import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-15
 * 主进程 OA 登录请求：注入 fetch 以便单测，由 main.ts 的 login-via-oa IPC 调用。
 * 对网络错误 / 超时 / HTTP 非 2xx / 非 JSON 响应抛出可读错误，
 * 避免把网关纯文本响应（如 "default backend - 404"）的 SyntaxError 直接抛给渲染进程。
 */
type OaLoginResponse =
  | { success: true; data: { access_token: string; base_url: string; api_key: string; pat?: string } }
  | { success: false; message?: string };

// 结构化最小 fetch 类型：同时兼容全局 fetch 与 Electron 的 net.fetch
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// IPC result 模式返回值：主进程不抛异常，避免 Electron 给 IPC 错误加
// "Error invoking remote method 'login-via-oa': " 技术前缀
export type OaLoginResult =
  | { ok: true; creds: LoginCredentials }
  | { ok: false; message: string };

const DEFAULT_TIMEOUT_MS = 15_000;

export async function performOaLogin(
  apiBaseUrl: string,
  loginName: string,
  password: string,
  fetchImpl: FetchLike,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<LoginCredentials> {
  let res: Response;
  try {
    res = await fetchImpl(`${apiBaseUrl}/api/user/login/oa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_name: loginName, password }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // AbortSignal.timeout 超时时 reject 的异常 name 为 TimeoutError
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error('登录服务响应超时，请稍后重试');
    }
    throw new Error('无法连接登录服务，请检查网络或服务地址');
  }
  if (!res.ok) {
    throw new Error(`登录服务不可用（HTTP ${res.status}）`);
  }
  let body: OaLoginResponse;
  try {
    body = await res.json();
  } catch {
    throw new Error('登录服务响应格式异常');
  }
  if (!body.success) {
    throw new Error(body.message || '登录失败');
  }
  // 运行时 JSON 不受类型约束，服务端契约破坏时给出可读错误
  if (!body.data) {
    throw new Error('登录服务响应数据异常');
  }
  return {
    token: body.data.access_token,
    baseUrl: body.data.base_url,
    apiKey: body.data.api_key,
    pat: body.data.pat,
  };
}

/**
 * @author logic
 * @date 2026-08-15
 * IPC result 模式包装：把 performOaLogin 的成功/异常转为 {ok, ...} 对象，
 * main.ts 的 handler 用它返回而非抛异常，渲染进程解包后自行抛干净的 Error
 */
export async function runOaLogin(fn: () => Promise<LoginCredentials>): Promise<OaLoginResult> {
  try {
    return { ok: true, creds: await fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '登录失败' };
  }
}
