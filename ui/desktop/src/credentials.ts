import fs from 'node:fs';
import path from 'node:path';

/**
 * @author logic
 * @date 2026-08-11
 * HeyBuddy 登录凭证：登录成功后由服务端下发，写入独立文件，注入给 goose serve
 */
export interface LoginCredentials {
  token: string;
  baseUrl: string;
  apiKey: string;
  /** 面板访问令牌（PAT）：登录网关下发，用于查询用户余额；旧登录数据可能没有 */
  pat?: string;
}

/**
 * @author logic
 * @date 2026-08-11
 * 读取凭证文件，文件不存在或内容损坏时返回 null
 */
export function readCredentials(filePath: string): LoginCredentials | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (
      typeof data?.token === 'string' &&
      typeof data?.baseUrl === 'string' &&
      typeof data?.apiKey === 'string'
    ) {
      return data as LoginCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @author logic
 * @date 2026-08-11
 * 写入凭证文件，权限 0o600（Windows 上该参数无害，Unix 上生效）
 */
export function writeCredentials(filePath: string, creds: LoginCredentials): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

/**
 * @author logic
 * @date 2026-08-11
 * 删除凭证文件，文件不存在时安全返回
 */
export function clearCredentials(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
