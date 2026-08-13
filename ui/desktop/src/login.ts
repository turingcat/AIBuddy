import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-12
 * 登录转发：renderer 不直连外部（受 CSP 限制），由主进程 net.fetch 调 new-api OA 登录接口。
 */
export async function login(loginName: string, password: string): Promise<LoginCredentials> {
  return window.electron.loginViaOA(loginName, password);
}
