import type { LoginCredentials } from './credentials';

export function buildAIBuddyServeEnv(
  creds: LoginCredentials | null,
  aibuddyPathRoot: string
): Record<string, string> {
  return {
    AIBUDDY_PROVIDER: 'aibuddy',
    ...(creds
      ? {
          AIBUDDY_BASE_URL: creds.gateway?.baseUrl ?? creds.baseUrl,
          AIBUDDY_API_KEY: creds.gateway?.apiKey ?? creds.apiKey,
        }
      : {}),
    AIBUDDY_PATH_ROOT: aibuddyPathRoot,
  };
}
