import { appBrand } from './brand';

export type AuthEnv = 'production' | 'test';
export type AuthMode = 'oa' | 'sub2api';

export interface AuthConfig {
  env: AuthEnv;
  mode: AuthMode;
  apiBaseUrl: string;
  tokenName: string;
}

export interface AuthEnvironment {
  HEYBUDDY_AUTH_API_BASE_URL?: string;
  AIBUDDY_AUTH_API_BASE_URL?: string;
}

declare const __AUTH_API_BASE_URL__: string | undefined;
declare const __AUTH_MODE__: AuthMode | undefined;

export function resolveAuthApiBaseUrl(
  environment: AuthEnvironment,
  fallback = appBrand.authApiBaseUrl
): string {
  return environment.AIBUDDY_AUTH_API_BASE_URL?.trim() || fallback;
}

export function resolveAuthMode(): AuthMode {
  return appBrand.authMode as AuthMode;
}

const compiledAuthApiBaseUrl =
  typeof __AUTH_API_BASE_URL__ === 'string' ? __AUTH_API_BASE_URL__ : undefined;

const apiBaseUrl = compiledAuthApiBaseUrl || resolveAuthApiBaseUrl(process.env);
const mode = typeof __AUTH_MODE__ === 'string' ? __AUTH_MODE__ : resolveAuthMode();

export const authConfig: AuthConfig = {
  env: apiBaseUrl.includes('localhost') ? 'test' : 'production',
  mode,
  apiBaseUrl,
  tokenName: 'heybuddy',
};
