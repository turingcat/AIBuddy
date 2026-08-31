import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  BalanceFetchError,
  type BalanceData,
  fetchCurrencyWithCache,
  fetchStatusCurrency,
  fetchUserBalance,
  runBalanceFetch,
  type CurrencyCacheState,
} from './balance';
import { DEFAULT_CURRENCY_CONFIG } from './quotaFormat';

/**
 * @author logic
 * @date 2026-08-24
 * 余额取数单测：注入 fetch 验证主进程余额/货币配置请求逻辑。
 *
 * 路径分析（fetchJson 共享层）：超时 / 网络错误(含非 Error 值) / 401 / 其他非 2xx / 非 JSON。
 * 路径分析（fetchUserBalance，V(G)=8）：成功映射、success=false 有/无 message、
 *   数值字段非法、字符串字段缺失回退，叠加 fetchJson 五条。
 * 路径分析（fetchStatusCurrency，V(G)=2）：success=true 解析、success=false、data 缺失回退默认。
 * 路径分析（fetchCurrencyWithCache，V(G)=4）：缓存命中不发请求 / TTL 过期重拉写回 /
 *   重拉失败降级旧值 / 无缓存失败抛错；TTL 边界（恰好到期 → 重拉）。
 * 路径分析（runBalanceFetch，V(G)=3）：成功 / BalanceFetchError 透传 kind /
 *   非 Error 与普通 Error 归为 network。
 */

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const selfPayload = {
  success: true,
  data: {
    quota: 5000000,
    used_quota: 100000,
    request_count: 42,
    username: 'oa_1',
    display_name: '张三',
  },
};

describe('fetchUserBalance（主进程余额查询）', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P1: 成功时映射字段并携带 Bearer PAT', async () => {
    mockFetch.mockResolvedValue(jsonResponse(selfPayload));

    const balance = await fetchUserBalance('http://localhost:3001', 'pat-token', mockFetch);

    expect(balance).toEqual({
      kind: 'balance',
      quota: 5000000,
      usedQuota: 100000,
      requestCount: 42,
      userName: 'oa_1',
      displayName: '张三',
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/user/self', {
      method: 'GET',
      headers: { Authorization: 'Bearer pat-token' },
      signal: expect.any(AbortSignal),
    });
  });

  it('P9: username/display_name 缺失时回退空字符串', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { quota: 1, used_quota: 0, request_count: 0 },
      })
    );

    const balance = await fetchUserBalance('http://localhost:3001', 'pat', mockFetch);

    expect(balance.userName).toBe('');
    expect(balance.displayName).toBe('');
  });

  it('P2: HTTP 401（PAT 失效）归类为 unauthorized', async () => {
    mockFetch.mockResolvedValue(new Response('unauthorized', { status: 401 }));

    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'unauthorized',
        message: '登录已失效，请重新登录',
      }
    );
  });

  it('P3: 其他 HTTP 非 2xx 归类为 http 并带状态码', async () => {
    mockFetch.mockResolvedValue(new Response('oops', { status: 502 }));

    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'http',
        message: '余额服务不可用（HTTP 502）',
      }
    );
  });

  it('P4: HTTP 200 但响应非 JSON 归类为 bad-response', async () => {
    mockFetch.mockResolvedValue(
      new Response('<html>bad gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'bad-response',
        message: '余额服务响应格式异常',
      }
    );
  });

  it('P5: 网络错误归类为 network；非 Error 异常值同样归为 network', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'network',
      }
    );

    mockFetch.mockRejectedValueOnce('boom');
    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'network',
      }
    );
  });

  it('P6: 服务超时（AbortSignal 触发 TimeoutError）归类为 timeout', async () => {
    const hangFetch = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        })
    );

    await expect(
      fetchUserBalance('http://localhost:3001', 'pat', hangFetch, 20)
    ).rejects.toMatchObject({ kind: 'timeout', message: '余额服务响应超时，请稍后重试' });
  });

  it('P7: success=false 时抛出服务端 message；无 message 时用默认文案', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: false, message: '令牌无效' }));
    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'bad-response',
        message: '令牌无效',
      }
    );

    mockFetch.mockResolvedValueOnce(jsonResponse({ success: false }));
    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'bad-response',
        message: '余额查询失败',
      }
    );
  });

  it('P8: 数值字段缺失或非有限数时抛出数据异常', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { used_quota: 1, request_count: 1 } })
    );
    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'bad-response',
        message: '余额服务响应数据异常',
      }
    );

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { quota: 1, used_quota: Number.NaN, request_count: 1 } })
    );
    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'bad-response',
      }
    );

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { quota: 1, used_quota: 1, request_count: '42' } })
    );
    await expect(fetchUserBalance('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject(
      {
        kind: 'bad-response',
      }
    );
  });
});

describe('fetchStatusCurrency（货币配置查询）', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P10: 成功时按 /api/status data 解析货币配置', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { quota_per_unit: 300000, quota_display_type: 'CNY', usd_exchange_rate: 7.3 },
      })
    );

    const config = await fetchStatusCurrency('http://localhost:3001', mockFetch);

    expect(config).toEqual({
      ...DEFAULT_CURRENCY_CONFIG,
      quotaPerUnit: 300000,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 7.3,
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/status', {
      method: 'GET',
      signal: expect.any(AbortSignal),
    });
  });

  it('P12: success=true 但 data 缺失时回退默认配置', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));

    expect(await fetchStatusCurrency('http://localhost:3001', mockFetch)).toEqual(
      DEFAULT_CURRENCY_CONFIG
    );
  });

  it('P11: success=false 时抛 bad-response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: false }));

    await expect(fetchStatusCurrency('http://localhost:3001', mockFetch)).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });

  it('P11b: HTTP 非 2xx 时归类为 http（覆盖错误文案回调）', async () => {
    mockFetch.mockResolvedValue(new Response('oops', { status: 503 }));

    await expect(fetchStatusCurrency('http://localhost:3001', mockFetch)).rejects.toMatchObject({
      kind: 'http',
      message: '余额服务不可用（HTTP 503）',
    });
  });
});

describe('fetchCurrencyWithCache（货币配置缓存）', () => {
  const mockFetch = vi.fn();
  const freshConfig = { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'CNY' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P13: TTL 内命中缓存直接返回，不发请求', async () => {
    const state: CurrencyCacheState = { config: freshConfig, fetchedAt: 1_000 };

    const config = await fetchCurrencyWithCache(
      state,
      'http://localhost:3001',
      mockFetch,
      1_499,
      500
    );

    expect(config).toBe(freshConfig);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('P14: 恰好到期（now-fetchedAt=ttl）触发重拉并写回缓存', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { quota_display_type: 'CNY' } })
    );
    const state: CurrencyCacheState = { config: DEFAULT_CURRENCY_CONFIG, fetchedAt: 1_000 };

    const config = await fetchCurrencyWithCache(
      state,
      'http://localhost:3001',
      mockFetch,
      1_500,
      500
    );

    expect(config).toEqual(freshConfig);
    expect(state.config).toEqual(freshConfig);
    expect(state.fetchedAt).toBe(1_500);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('P15: 重拉失败但有旧缓存时降级返回旧值', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    const state: CurrencyCacheState = { config: freshConfig, fetchedAt: 1_000 };

    const config = await fetchCurrencyWithCache(
      state,
      'http://localhost:3001',
      mockFetch,
      2_000,
      500
    );

    expect(config).toBe(freshConfig);
  });

  it('P16: 无缓存且拉取失败时抛出原始错误', async () => {
    mockFetch.mockRejectedValue(new BalanceFetchError('network', '无法连接余额服务，请检查网络'));
    const state: CurrencyCacheState = { config: null, fetchedAt: 0 };

    await expect(
      fetchCurrencyWithCache(state, 'http://localhost:3001', mockFetch, 1_000, 500)
    ).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('runBalanceFetch（IPC result 模式包装）', () => {
  const sampleBalance = {
    quota: 5000000,
    usedQuota: 100000,
    requestCount: 42,
    userName: 'oa_1',
    displayName: '张三',
    kind: 'balance' as const,
  };

  it('P17: 成功时返回 {ok:true, balance, currency}', async () => {
    const result = await runBalanceFetch(async () => ({
      balance: sampleBalance,
      currency: DEFAULT_CURRENCY_CONFIG,
    }));

    expect(result).toEqual({
      ok: true,
      balance: sampleBalance,
      currency: DEFAULT_CURRENCY_CONFIG,
    });
  });

  it('P18: BalanceFetchError 透传 kind 与 message', async () => {
    const result = await runBalanceFetch(async () => {
      throw new BalanceFetchError('unauthorized', '登录已失效，请重新登录');
    });

    expect(result).toEqual({ ok: false, kind: 'unauthorized', message: '登录已失效，请重新登录' });
  });

  it('P19: 普通 Error 归为 network；非 Error 值用默认文案', async () => {
    const errResult = await runBalanceFetch(async () => {
      throw new Error('boom');
    });
    expect(errResult).toEqual({ ok: false, kind: 'network', message: 'boom' });

    const nonErrResult = await runBalanceFetch(async () => {
      throw 'boom';
    });
    expect(nonErrResult).toEqual({ ok: false, kind: 'network', message: '余额查询失败' });
  });

  it('preserves subscription period values unchanged in the IPC result', async () => {
    const subscription: BalanceData = {
      kind: 'subscription',
      remainingUSD: { weekly: -1.25, monthly: 3.5 },
      userName: 'alice',
      displayName: 'alice',
      groupName: 'TFlow Pro',
    };

    await expect(
      runBalanceFetch(async () => ({ balance: subscription, currency: DEFAULT_CURRENCY_CONFIG }))
    ).resolves.toEqual({ ok: true, balance: subscription, currency: DEFAULT_CURRENCY_CONFIG });
  });
});
