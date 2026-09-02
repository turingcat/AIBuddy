import brands from '../branding/brands.json';

type AuthEdition = 'heybuddy' | 'aibuddy';

export type AuthEnv = 'production' | 'test';
export type AuthMode = 'oa' | 'sub2api';

export interface AuthConfig {
  env: AuthEnv;
  mode: AuthMode;
  apiBaseUrl: string;
  tokenName: string;
}

export const LOCAL_AUTH_API_BASE_URL = 'http://localhost:3001';
export const PRODUCTION_AUTH_API_BASE_URL = 'https://ai.linyeyun.cn';

export interface AuthEnvironment {
  HEYBUDDY_AUTH_API_BASE_URL?: string;
  AIBUDDY_AUTH_API_BASE_URL?: string;
}

declare const __AUTH_API_BASE_URL__: string | undefined;
declare const __AUTH_MODE__: AuthMode | undefined;

export function resolveAuthApiBaseUrl(
  environment: AuthEnvironment,
  edition: AuthEdition = 'heybuddy',
  fallback?: string
): string {
  const environmentValue =
    edition === 'aibuddy'
      ? environment.AIBUDDY_AUTH_API_BASE_URL
      : environment.HEYBUDDY_AUTH_API_BASE_URL;
  return environmentValue?.trim() || fallback ||
    (edition === 'aibuddy' ? brands.authApiBaseUrl : PRODUCTION_AUTH_API_BASE_URL);
}

export function resolveAuthMode(edition: AuthEdition): AuthMode {
  return edition === 'aibuddy' ? (brands.authMode as AuthMode) : 'oa';
}

const compiledAuthApiBaseUrl =
  typeof __AUTH_API_BASE_URL__ === 'string' ? __AUTH_API_BASE_URL__ : undefined;

const apiBaseUrl = compiledAuthApiBaseUrl || resolveAuthApiBaseUrl(process.env);
const mode = typeof __AUTH_MODE__ === 'string' ? __AUTH_MODE__ : resolveAuthMode('heybuddy');

export const authConfig: AuthConfig = {
  env: apiBaseUrl.includes('localhost') ? 'test' : 'production',
  mode,
  apiBaseUrl,
  tokenName: 'heybuddy',
};
