import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-15
 * 登录转发：renderer 不直连外部（受 CSP 限制），由主进程 net.fetch 调 new-api OA 登录接口。
 * 主进程以 {ok, creds|message} result 模式返回（不抛异常，避免 Electron 给 IPC 错误加
 * "Error invoking remote method" 前缀），此处解包后抛出干净的 Error。
 */
export async function login(loginName: string, password: string): Promise<LoginCredentials> {
  const result = await window.electron.loginViaOA(loginName, password);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.creds;
}
