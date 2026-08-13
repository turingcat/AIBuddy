/**
 * @author logic
 * @date 2026-08-12
 * 登录服务端配置。当前仅测试环境；生产环境地址确定后补 production 一项并在此切换。
 */
export type AuthEnv = 'production' | 'test';

export interface AuthConfig {
  env: AuthEnv;
  apiBaseUrl: string;
  tokenName: string;
}

const CONFIGS: Record<AuthEnv, AuthConfig> = {
  production: { env: 'production', apiBaseUrl: '', tokenName: 'heybuddy' },
  test: { env: 'test', apiBaseUrl: 'http://localhost:3001', tokenName: 'heybuddy' },
};

export const authConfig: AuthConfig = CONFIGS.test;
