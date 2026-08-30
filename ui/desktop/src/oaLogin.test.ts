import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performOaLogin, runOaLogin } from './oaLogin';
import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-15
 * performOaLogin 单测：注入 fetch 验证主进程 OA 登录请求逻辑，
 * 覆盖成功(P1)、业务失败有/无 message(P2/P3)、HTTP 非 2xx(P4)、
 * 响应非 JSON(P5)、网络错误(P6)、超时(P7)、data 缺失(P8)、
 * 非 Error 异常值(P9) 九条独立路径；
 * runOaLogin 单测覆盖 result 包装的成功(R1)、Error 错误(R2)、非 Error 错误(R3)。
 */
describe('performOaLogin（主进程 OA 登录请求）', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P1: success=true 时返回凭证并按约定发起请求', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            access_token: 'access-token',
            base_url: 'http://localhost:3001/v1',
            api_key: 'sk-abc',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await performOaLogin('http://localhost:3001', 'seeyon6', 'test@1234', mockFetch);

    const expected: LoginCredentials = {
      token: 'access-token',
      baseUrl: 'http://localhost:3001/v1',
      apiKey: 'sk-abc',
      authKind: 'oa',
    };
    expect(result).toEqual(expected);
    expect(result.authKind).toBe('oa');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/user/login/oa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_name: 'seeyon6', password: 'test@1234' }),
      signal: expect.any(AbortSignal),
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('P1b: 响应携带 pat 时透传到凭证（供余额查询使用）', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            access_token: 'access-token',
            base_url: 'http://localhost:3001/v1',
            api_key: 'sk-abc',
            pat: 'pat-token',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await performOaLogin('http://localhost:3001', 'seeyon6', 'test@1234', mockFetch);

    expect(result.pat).toBe('pat-token');
  });

  it('P10: 旧网关响应无 pat 字段时 pat 为 undefined（向后兼容）', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            access_token: 'access-token',
            base_url: 'http://localhost:3001/v1',
            api_key: 'sk-abc',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await performOaLogin('http://localhost:3001', 'seeyon6', 'test@1234', mockFetch);

    expect(result.pat).toBeUndefined();
  });

  it('P2: success=false 且带 message 时抛出服务端 message', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: '账号或密码错误' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      performOaLogin('http://localhost:3001', 'seeyon6', 'wrong', mockFetch)
    ).rejects.toThrow('账号或密码错误');
  });

  it('P3: success=false 且无 message 时抛出默认错误', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      performOaLogin('http://localhost:3001', 'seeyon6', 'wrong', mockFetch)
    ).rejects.toThrow('登录失败');
  });

  it('P4: HTTP 非 2xx（网关 default backend 404 纯文本）时抛出服务不可用', async () => {
    mockFetch.mockResolvedValue(
      new Response('default backend - 404', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );

    await expect(
      performOaLogin('https://ai.linyeyun.cn', 'seeyon6', 'test@1234', mockFetch)
    ).rejects.toThrow('登录服务不可用（HTTP 404）');
  });

  it('P5: HTTP 200 但响应非 JSON 时抛出响应格式异常', async () => {
    mockFetch.mockResolvedValue(
      new Response('<html>bad gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    await expect(
      performOaLogin('http://localhost:3001', 'seeyon6', 'test@1234', mockFetch)
    ).rejects.toThrow('登录服务响应格式异常');
  });

  it('P6: fetch 抛错（服务未启动/网络不通）时抛出可读的连接错误', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      performOaLogin('http://localhost:3001', 'seeyon6', 'test@1234', mockFetch)
    ).rejects.toThrow('无法连接登录服务，请检查网络或服务地址');
  });

  it('P7: 服务超时无响应（AbortSignal 触发 TimeoutError）时抛出超时提示', async () => {
    // 模拟连上但不响应的服务：仅在 signal 中止时 reject，与真实 fetch 行为一致
    const hangFetch = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        })
    );

    await expect(
      performOaLogin('http://localhost:3001', 'seeyon6', 'test@1234', hangFetch, 20)
    ).rejects.toThrow('登录服务响应超时，请稍后重试');
  });

  it('P8: success=true 但缺少 data 字段时抛出数据异常', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      performOaLogin('http://localhost:3001', 'seeyon6', 'test@1234', mockFetch)
    ).rejects.toThrow('登录服务响应数据异常');
  });

  it('P9: fetch 抛出非 Error 值时仍抛出可读的连接错误', async () => {
    // 条件覆盖：覆盖 catch 判定中 "e instanceof Error" 取假的原子条件
    mockFetch.mockRejectedValue('boom');

    await expect(
      performOaLogin('http://localhost:3001', 'seeyon6', 'test@1234', mockFetch)
    ).rejects.toThrow('无法连接登录服务，请检查网络或服务地址');
  });
});

describe('runOaLogin（IPC result 模式包装）', () => {
  it('R1: 内部成功时返回 {ok:true, creds}', async () => {
    const creds: LoginCredentials = {
      token: 'access-token',
      baseUrl: 'http://localhost:3001/v1',
      apiKey: 'sk-abc',
    };

    const result = await runOaLogin(async () => creds);

    expect(result).toEqual({ ok: true, creds });
  });

  it('R2: 内部抛 Error 时返回 {ok:false, message}', async () => {
    const result = await runOaLogin(async () => {
      throw new Error('账号或密码错误');
    });

    expect(result).toEqual({ ok: false, message: '账号或密码错误' });
  });

  it('R3: 内部抛非 Error 时返回 {ok:false, message:"登录失败"}', async () => {
    const result = await runOaLogin(async () => {
      throw 'boom';
    });

    expect(result).toEqual({ ok: false, message: '登录失败' });
  });
});
