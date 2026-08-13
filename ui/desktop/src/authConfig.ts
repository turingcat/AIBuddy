/**
 * @author logic
 * @date 2026-08-13
 * 登录服务端配置。apiBaseUrl 由构建时环境变量 HEYBUDDY_AUTH_API_BASE_URL 注入
 * （见 vite.main.config.mts 的 define），未设置时默认本地测试地址。
 */
export type AuthEnv = 'production' | 'test';

export interface AuthConfig {
  env: AuthEnv;
  apiBaseUrl: string;
  tokenName: string;
}

const apiBaseUrl = process.env.HEYBUDDY_AUTH_API_BASE_URL || 'http://localhost:3001';

export const authConfig: AuthConfig = {
  env: apiBaseUrl.includes('localhost') ? 'test' : 'production',
  apiBaseUrl,
  tokenName: 'heybuddy',
};
