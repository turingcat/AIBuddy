import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-11
 * 把登录下发的凭证映射为 goose serve 子进程环境变量，供 heybuddy provider 接收；
 * 无凭证时返回空对象，避免污染子进程环境。
 */
export function buildHeyBuddyEnv(creds: LoginCredentials | null): Record<string, string> {
  if (!creds) return {};
  return {
    HEYBUDDY_BASE_URL: creds.baseUrl,
    HEYBUDDY_API_KEY: creds.apiKey,
  };
}
