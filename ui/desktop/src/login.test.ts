import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login } from './login';
import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-15
 * login 单测：验证转发主进程 OA 登录 IPC（window.electron.loginViaOA）并解包 result。
 * 主进程以 {ok, creds|message} result 模式返回（避免 Electron 给 IPC 异常加技术性前缀），
 * 覆盖成功解包(P1)、业务失败抛 message(P2)、IPC 层自身异常上抛(P3) 三条独立路径。
 */
describe('login（转发主进程 OA 登录 IPC）', () => {
  const mockLoginViaOA = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      ...(window as unknown as { electron: Record<string, unknown> }).electron,
      loginViaOA: mockLoginViaOA,
    };
  });

  it('P1: 成功 result 解包返回凭证并转发 loginName/password', async () => {
    const creds: LoginCredentials = {
      token: 'access-token',
      baseUrl: 'http://localhost:3001/v1',
      apiKey: 'sk-abc',
    };
    mockLoginViaOA.mockResolvedValue({ ok: true, creds });

    const result = await login('seeyon6', 'test@1234');

    expect(result).toEqual(creds);
    expect(mockLoginViaOA).toHaveBeenCalledWith('seeyon6', 'test@1234');
    expect(mockLoginViaOA).toHaveBeenCalledTimes(1);
  });

  it('P2: 失败 result 时抛出主进程返回的 message', async () => {
    mockLoginViaOA.mockResolvedValue({ ok: false, message: '账号或密码错误' });

    await expect(login('seeyon6', 'wrong')).rejects.toThrow('账号或密码错误');
  });

  it('P3: IPC 层自身抛异常（如通道不存在）时向上转发该错误', async () => {
    mockLoginViaOA.mockRejectedValue(new Error('Error invoking remote method'));

    await expect(login('seeyon6', 'test@1234')).rejects.toThrow('Error invoking remote method');
  });
});
