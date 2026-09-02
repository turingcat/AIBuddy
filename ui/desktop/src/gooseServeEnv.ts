import type { LoginCredentials } from './credentials';

export function buildGooseServeEnv(creds: LoginCredentials | null): Record<string, string> {
  if (!creds) return {};

  return {
    AIBUDDY_BASE_URL: creds.gateway?.baseUrl ?? creds.baseUrl,
    AIBUDDY_API_KEY: creds.gateway?.apiKey ?? creds.apiKey,
    GOOSE_PROVIDER: 'aibuddy',
  };
}
