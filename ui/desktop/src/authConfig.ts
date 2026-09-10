import brands from '../branding/brands.json';

export type AuthEnv = 'production' | 'test';
export type AuthMode = 'sub2api';

export interface AuthConfig {
  env: AuthEnv;
  mode: AuthMode;
  apiBaseUrl: string;
  tokenName: string;
}

export const LOCAL_AUTH_API_BASE_URL = 'http://localhost:3001';

export interface AuthEnvironment {
  AIBUDDY_AUTH_API_BASE_URL?: string;
}

declare const __AUTH_API_BASE_URL__: string | undefined;
declare const __AUTH_MODE__: AuthMode | undefined;

export function resolveAuthApiBaseUrl(environment: AuthEnvironment, fallback?: string): string {
  return environment.AIBUDDY_AUTH_API_BASE_URL?.trim() || fallback || brands.authApiBaseUrl;
}

const compiledAuthApiBaseUrl =
  typeof __AUTH_API_BASE_URL__ === 'string' ? __AUTH_API_BASE_URL__ : undefined;
const apiBaseUrl = compiledAuthApiBaseUrl || resolveAuthApiBaseUrl(process.env);
const mode = typeof __AUTH_MODE__ === 'string' ? __AUTH_MODE__ : (brands.authMode as AuthMode);

export const authConfig: AuthConfig = {
  env: apiBaseUrl.includes('localhost') ? 'test' : 'production',
  mode,
  apiBaseUrl,
  tokenName: 'aibuddy',
};
