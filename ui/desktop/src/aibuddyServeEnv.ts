import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-11
 * 把登录下发的凭证映射为 aibuddy serve 子进程环境变量，供 aibuddy provider 接收；
 * 无凭证时返回空对象，避免污染子进程环境。
 */
export function buildAIBuddyEnv(creds: LoginCredentials | null): Record<string, string> {
  if (!creds) return {};
  return {
    AIBUDDY_BASE_URL: creds.baseUrl,
    AIBUDDY_API_KEY: creds.apiKey,
    // 强制 active provider 为 aibuddy，覆盖 config.yaml 里残留的旧 active_provider
    AIBUDDY_PROVIDER: 'aibuddy',
  };
}
