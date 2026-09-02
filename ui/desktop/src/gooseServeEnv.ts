import type { LoginCredentials } from './credentials';

export function buildGooseServeEnv(
  creds: LoginCredentials | null,
  goosePathRoot: string
): Record<string, string> {
  return {
    ...(creds
      ? {
          AIBUDDY_BASE_URL: creds.gateway?.baseUrl ?? creds.baseUrl,
          AIBUDDY_API_KEY: creds.gateway?.apiKey ?? creds.apiKey,
          GOOSE_PROVIDER: 'aibuddy',
        }
      : {}),
    GOOSE_PATH_ROOT: goosePathRoot,
  };
}
