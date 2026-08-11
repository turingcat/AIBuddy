import type { LoginCredentials } from './credentials';

/**
 * @author logic
 * @date 2026-08-11
 * 阶段二桩登录：返回固定凭证，供端到端验证注入链路；阶段三 Task 13 替换为真实服务端 API。
 * 注意：本桩对任意输入都返回硬编码凭证，正式发布前必须替换，否则等同于绕过登录。
 */
export async function stubLogin(account: string, password: string): Promise<LoginCredentials> {
  console.warn(
    '[HeyBuddy] stubLogin in use — replace with real server API before release (Task 13).'
  );
  void account;
  void password;
  return {
    token: 'stub-token',
    baseUrl: 'https://stub-gw/v1',
    apiKey: 'stub-key',
  };
}
