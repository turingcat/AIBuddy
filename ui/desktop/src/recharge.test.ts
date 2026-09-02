import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createWechatPayOrder,
  fetchTopupInfo,
  fetchWechatPayOrderStatus,
  RechargeFetchError,
  runRechargeFetch,
} from './recharge';

/**
 * @author logic
 * @date 2026-09-02
 * 微信充值取数单测：注入 fetch 验证主进程充值配置/下单/订单状态请求逻辑。
 *
 * 路径分析（fetchJson 共享层）：超时 / 网络错误(含非 Error 值) / 401 / 其他非 2xx / 非 JSON。
 * 路径分析（fetchTopupInfo）：成功映射（amount_options 字符串/数组两种形态）、
 *   微信开关默认关闭、topup_link 空串回退 null、success=false 业务错误文案
 *   （data 字符串优先 / message 非 error 占位 / 默认兜底）。
 * 路径分析（createWechatPayOrder）：金额校验（0/负数/小数/NaN）、成功映射、
 *   业务错误、data 字段缺失或类型不符。
 * 路径分析（fetchWechatPayOrderStatus）：pending 与三种终态、非法 status、业务错误。
 * 路径分析（runRechargeFetch）：成功 / RechargeFetchError 透传 kind / 非 Error 默认文案。
 */

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const topupInfoPayload = {
  success: true,
  data: {
    enable_wechat_topup: true,
    wechat_min_topup: 5,
    amount_options: '[10, 50, 100]',
    topup_link: 'https://example.com/topup',
  },
};

const orderPayload = {
  success: true,
  data: {
    code_url: 'weixin://wxpay/bitgenerate?pr=abc',
    trade_no: 'USR1NO123456',
    expire_at: 1_756_800_000,
  },
};

describe('fetchTopupInfo（充值配置查询）', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P1: 成功时映射字段（amount_options 为 JSON 字符串）并携带 Bearer PAT', async () => {
    mockFetch.mockResolvedValue(jsonResponse(topupInfoPayload));

    const info = await fetchTopupInfo('http://localhost:3001', 'pat-token', mockFetch);

    expect(info).toEqual({
      enableWechatTopup: true,
      wechatMinTopup: 5,
      amountOptions: [10, 50, 100],
      topupLink: 'https://example.com/topup',
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/user/topup/info', {
      method: 'GET',
      headers: { Authorization: 'Bearer pat-token' },
      signal: expect.any(AbortSignal),
    });
  });

  it('P2: amount_options 为数组时同样解析；非法项（0/负数/小数/非数字）被过滤', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          enable_wechat_topup: true,
          amount_options: [10, 30, 0, -5, 2.5, '50', null],
        },
      })
    );

    const info = await fetchTopupInfo('http://localhost:3001', 'pat', mockFetch);

    expect(info.amountOptions).toEqual([10, 30]);
  });

  it('P3: 字段缺失时回退安全默认值（微信关闭、最低 1 元、无链接）', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true, data: {} }));

    const info = await fetchTopupInfo('http://localhost:3001', 'pat', mockFetch);

    expect(info).toEqual({
      enableWechatTopup: false,
      wechatMinTopup: 1,
      amountOptions: [],
      topupLink: null,
    });
  });

  it('P3b: {message:"success"} 方言（无 success 字段）同样按成功解析', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ message: 'success', data: { enable_wechat_topup: true } })
    );

    const info = await fetchTopupInfo('http://localhost:3001', 'pat', mockFetch);

    expect(info.enableWechatTopup).toBe(true);
    expect(info.wechatMinTopup).toBe(1);
  });

  it('P4: topup_link 为空白字符串时回退 null；非法 JSON 字符串的 amount_options 回退空数组', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { enable_wechat_topup: false, amount_options: 'not-json', topup_link: '   ' },
      })
    );

    const info = await fetchTopupInfo('http://localhost:3001', 'pat', mockFetch);

    expect(info.topupLink).toBeNull();
    expect(info.amountOptions).toEqual([]);
  });

  it('P5: 业务失败时优先透出 data 中的中文错误文本', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: false, message: 'error', data: '当前分组未开启充值' })
    );

    await expect(fetchTopupInfo('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject({
      kind: 'business',
      message: '当前分组未开启充值',
    });
  });

  it('P6: 业务失败无 data 时透出 message；message 为 error 占位或缺失时用默认文案', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: false, message: '令牌无效' }));
    await expect(fetchTopupInfo('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject({
      kind: 'business',
      message: '令牌无效',
    });

    mockFetch.mockResolvedValue(jsonResponse({ success: false, message: 'error' }));
    await expect(fetchTopupInfo('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject({
      kind: 'business',
      message: '充值配置获取失败',
    });

    mockFetch.mockResolvedValue(jsonResponse({ success: false }));
    await expect(fetchTopupInfo('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject({
      kind: 'business',
      message: '充值配置获取失败',
    });
  });

  it('P7: HTTP 401（PAT 失效）归类为 unauthorized', async () => {
    mockFetch.mockResolvedValue(new Response('unauthorized', { status: 401 }));

    await expect(fetchTopupInfo('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject({
      kind: 'unauthorized',
      message: '登录已失效，请重新登录',
    });
  });

  it('P8: 网络/超时/HTTP/非 JSON 分别归类为对应错误', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(fetchTopupInfo('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject({
      kind: 'network',
    });

    const hangFetch = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        })
    );
    await expect(
      fetchTopupInfo('http://localhost:3001', 'pat', hangFetch, 20)
    ).rejects.toMatchObject({ kind: 'timeout' });

    mockFetch.mockResolvedValueOnce(new Response('oops', { status: 502 }));
    await expect(fetchTopupInfo('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject({
      kind: 'http',
      message: '充值服务不可用（HTTP 502）',
    });

    mockFetch.mockResolvedValueOnce(
      new Response('<html>bad gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );
    await expect(fetchTopupInfo('http://localhost:3001', 'pat', mockFetch)).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });
});

describe('createWechatPayOrder（微信 Native 下单）', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P1: 成功时映射 code_url/trade_no/expire_at 并按 JSON POST 金额', async () => {
    mockFetch.mockResolvedValue(jsonResponse(orderPayload));

    const order = await createWechatPayOrder('http://localhost:3001', 'pat', 30, mockFetch);

    expect(order).toEqual({
      codeUrl: 'weixin://wxpay/bitgenerate?pr=abc',
      tradeNo: 'USR1NO123456',
      expireAt: 1_756_800_000,
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/user/wechatpay/pay', {
      method: 'POST',
      headers: { Authorization: 'Bearer pat', 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 30 }),
      signal: expect.any(AbortSignal),
    });
  });

  it('P1b: 服务端微信直连方言 {message:"success"}（无 success 字段）同样按成功解析', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        message: 'success',
        data: {
          code_url: 'weixin://wxpay/bitgenerate?pr=xyz',
          trade_no: 'USR2NO654321',
          expire_at: 1_756_900_000,
        },
      })
    );

    const order = await createWechatPayOrder('http://localhost:3001', 'pat', 10, mockFetch);

    expect(order).toEqual({
      codeUrl: 'weixin://wxpay/bitgenerate?pr=xyz',
      tradeNo: 'USR2NO654321',
      expireAt: 1_756_900_000,
    });
  });

  it('P2: 金额非法（0/负数/小数/NaN）在发请求前拒绝为 bad-request', async () => {
    for (const amount of [0, -10, 9.9, Number.NaN]) {
      await expect(
        createWechatPayOrder('http://localhost:3001', 'pat', amount, mockFetch)
      ).rejects.toMatchObject({ kind: 'bad-request' });
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('P3: 业务失败透出服务端文案', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: false, message: 'error', data: '充值金额低于最低限制' })
    );

    await expect(
      createWechatPayOrder('http://localhost:3001', 'pat', 1, mockFetch)
    ).rejects.toMatchObject({
      kind: 'business',
      message: '充值金额低于最低限制',
    });
  });

  it('P3b: 服务端微信直连方言 {message:"error", data}（无 success 字段）按业务失败透出 data 文案', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ message: 'error', data: '充值数量不能小于 5' })
    );

    await expect(
      createWechatPayOrder('http://localhost:3001', 'pat', 1, mockFetch)
    ).rejects.toMatchObject({
      kind: 'business',
      message: '充值数量不能小于 5',
    });
  });

  it('P4: data 字段缺失或类型不符时抛数据异常', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: {} }));
    await expect(
      createWechatPayOrder('http://localhost:3001', 'pat', 10, mockFetch)
    ).rejects.toMatchObject({ kind: 'bad-response' });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { code_url: 'weixin://x', trade_no: 'T1', expire_at: 'soon' },
      })
    );
    await expect(
      createWechatPayOrder('http://localhost:3001', 'pat', 10, mockFetch)
    ).rejects.toMatchObject({ kind: 'bad-response' });

    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
    await expect(
      createWechatPayOrder('http://localhost:3001', 'pat', 10, mockFetch)
    ).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('P5: 401 / 非 2xx 沿用共享错误归类', async () => {
    mockFetch.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    await expect(
      createWechatPayOrder('http://localhost:3001', 'pat', 10, mockFetch)
    ).rejects.toMatchObject({ kind: 'unauthorized' });

    mockFetch.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    await expect(
      createWechatPayOrder('http://localhost:3001', 'pat', 10, mockFetch)
    ).rejects.toMatchObject({
      kind: 'http',
      message: '充值服务不可用（HTTP 500）',
    });
  });
});

describe('fetchWechatPayOrderStatus（订单状态查询）', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P1: pending 与三种终态均透传；trade_no 做 URL 编码', async () => {
    for (const status of ['pending', 'success', 'failed', 'expired']) {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { status, trade_no: 'USR1 NO/1' } })
      );
      await expect(
        fetchWechatPayOrderStatus('http://localhost:3001', 'pat', 'USR1 NO/1', mockFetch)
      ).resolves.toBe(status);
    }
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/user/wechatpay/status?trade_no=USR1%20NO%2F1',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('P1b: 状态接口双方言：{message:"success"} 成功与 {message:"error"} 失败均正确判定', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: 'success', data: { status: 'pending', trade_no: 'T1' } })
    );
    await expect(
      fetchWechatPayOrderStatus('http://localhost:3001', 'pat', 'T1', mockFetch)
    ).resolves.toBe('pending');

    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'error', data: '订单不存在' }));
    await expect(
      fetchWechatPayOrderStatus('http://localhost:3001', 'pat', 'T404', mockFetch)
    ).rejects.toMatchObject({ kind: 'business', message: '订单不存在' });
  });

  it('P2: status 非法或缺失时抛数据异常', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { status: 'PAID' } })
    );
    await expect(
      fetchWechatPayOrderStatus('http://localhost:3001', 'pat', 'T1', mockFetch)
    ).rejects.toMatchObject({ kind: 'bad-response' });

    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: {} }));
    await expect(
      fetchWechatPayOrderStatus('http://localhost:3001', 'pat', 'T1', mockFetch)
    ).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('P3: 业务失败（订单不存在）透出服务端文案', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: false, message: 'error', data: '订单不存在' })
    );

    await expect(
      fetchWechatPayOrderStatus('http://localhost:3001', 'pat', 'T404', mockFetch)
    ).rejects.toMatchObject({ kind: 'business', message: '订单不存在' });
  });
});

describe('runRechargeFetch（IPC result 模式包装）', () => {
  it('P1: 成功时返回 {ok:true, data}', async () => {
    const result = await runRechargeFetch(async () => orderPayload.data);

    expect(result).toEqual({ ok: true, data: orderPayload.data });
  });

  it('P2: RechargeFetchError 透传 kind 与 message', async () => {
    const result = await runRechargeFetch(async () => {
      throw new RechargeFetchError('business', '充值金额低于最低限制');
    });

    expect(result).toEqual({ ok: false, kind: 'business', message: '充值金额低于最低限制' });
  });

  it('P3: 普通 Error 归为 network 透传 message；非 Error 值用默认文案', async () => {
    const errResult = await runRechargeFetch(async () => {
      throw new Error('boom');
    });
    expect(errResult).toEqual({ ok: false, kind: 'network', message: 'boom' });

    const nonErrResult = await runRechargeFetch(async () => {
      throw 'boom';
    });
    expect(nonErrResult).toEqual({ ok: false, kind: 'network', message: '充值请求失败' });
  });
});
