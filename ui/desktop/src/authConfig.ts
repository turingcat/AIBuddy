export type AuthEnv = 'production' | 'test';

export interface AuthConfig {
  env: AuthEnv;
  apiBaseUrl: string;
  tokenName: string;
}

export const LOCAL_AUTH_API_BASE_URL = 'http://localhost:3001';
export const PRODUCTION_AUTH_API_BASE_URL = 'https://ai.linyeyun.cn';

export interface AuthEnvironment {
  HEYBUDDY_AUTH_API_BASE_URL?: string;
}

declare const __HEYBUDDY_AUTH_API_BASE_URL__: string | undefined;

export function resolveAuthApiBaseUrl(
  environment: AuthEnvironment,
  fallback = PRODUCTION_AUTH_API_BASE_URL
): string {
  return environment.HEYBUDDY_AUTH_API_BASE_URL?.trim() || fallback;
}

const compiledAuthApiBaseUrl =
  typeof __HEYBUDDY_AUTH_API_BASE_URL__ === 'string' ? __HEYBUDDY_AUTH_API_BASE_URL__ : undefined;

const apiBaseUrl = resolveAuthApiBaseUrl({
  HEYBUDDY_AUTH_API_BASE_URL: compiledAuthApiBaseUrl || process.env.HEYBUDDY_AUTH_API_BASE_URL,
});

export const authConfig: AuthConfig = {
  env: apiBaseUrl.includes('localhost') ? 'test' : 'production',
  apiBaseUrl,
  tokenName: 'heybuddy',
};
