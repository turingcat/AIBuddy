import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login } from './login';
import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-12
 * login 单测：验证转发主进程 OA 登录 IPC（window.electron.loginViaOA），
 * 覆盖正常转发(P1)与错误上抛(P2)两条独立路径。
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

  it('P1: 正常转发 loginName/password 并返回凭证', async () => {
    const creds: LoginCredentials = {
      token: 'access-token',
      baseUrl: 'http://localhost:3001/v1',
      apiKey: 'sk-abc',
    };
    mockLoginViaOA.mockResolvedValue(creds);

    const result = await login('seeyon6', 'test@1234');

    expect(result).toEqual(creds);
    expect(mockLoginViaOA).toHaveBeenCalledWith('seeyon6', 'test@1234');
    expect(mockLoginViaOA).toHaveBeenCalledTimes(1);
  });

  it('P2: IPC 抛错时向上转发该错误', async () => {
    mockLoginViaOA.mockRejectedValue(new Error('登录失败'));

    await expect(login('seeyon6', 'wrong')).rejects.toThrow('登录失败');
    expect(mockLoginViaOA).toHaveBeenCalledWith('seeyon6', 'wrong');
  });
});
