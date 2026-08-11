import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-11
 * 阶段二桩登录：返回固定凭证，供端到端验证注入链路；阶段三 Task 13 替换为真实服务端 API
 */
export async function stubLogin(account: string, password: string): Promise<LoginCredentials> {
  void account;
  void password;
  return {
    token: 'stub-token',
    baseUrl: 'https://stub-gw/v1',
    apiKey: 'stub-key',
  };
}
