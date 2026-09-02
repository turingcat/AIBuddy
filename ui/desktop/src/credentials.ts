import fs from 'node:fs';
import path from 'node:path';
import type { CredentialsCodec } from './credentialsCrypto';
import type { GatewayCredentials, SiteAccountIdentity, SiteTarget } from './siteRuntime/types';

/**
 * @author: logic
 * @date: 2026-08-11
 * AIBuddy 登录凭证：登录成功后由服务端下发，写入独立文件，注入给 goose serve
 * 2026-08-27 起：文件为 v:1 加密信封 {"v":1,"blob":"..."}，codec 由调用方注入；
 * 读取到旧版明文文件时自动加密迁移，迁移失败仅记录不阻断
 */

// 重新导出避免调用方同时依赖两个模块
export type { CredentialsCodec };

export interface LoginCredentials {
  schemaVersion?: 2;
  siteKind?: 'sub2api';
  session?: { accessToken: string; refreshToken?: string; pat?: string };
  account?: SiteAccountIdentity;
  target?: SiteTarget;
  gateway?: GatewayCredentials;
  token: string;
  baseUrl: string;
  apiKey: string;
  authKind?: 'sub2api';
  /** 面板访问令牌（PAT）：登录网关下发，用于查询用户余额；旧登录数据可能没有 */
  pat?: string;
  /** 面板刷新令牌：access token 过期时换新，缺失则只能重新登录 */
  refreshToken?: string;
  /** API Key 所属分组：订阅型分组据此匹配日限额；旧登录数据可能没有 */
  groupId?: string;
}

interface CredentialsEnvelope {
  v: number;
  blob: string;
}

/**
 * @author: logic
 * @date: 2026-08-27
 * 写入加密信封文件，权限 0o600（Windows 上该参数无害，Unix 上生效）
 */
export function writeCredentials(
  filePath: string,
  creds: LoginCredentials,
  codec: CredentialsCodec
): void {
  const envelope: CredentialsEnvelope = {
    v: 1,
    blob: codec.encrypt(JSON.stringify(creds)),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), { mode: 0o600 });
}

/**
 * @author: logic
 * @date: 2026-08-27
 * 读取凭证文件：v:1 信封经 codec 解密；旧版明文读取成功后自动迁移为加密信封。
 * 文件不存在、内容损坏、解密失败或字段非法时返回 null
 */
export function readCredentials(
  filePath: string,
  codec: CredentialsCodec
): LoginCredentials | null {
  if (!fs.existsSync(filePath)) return null;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }

  // v:1 信封：解密后校验内层字段
  if (isEnvelope(data)) {
    const plain = codec.decrypt(data.blob);
    if (plain === null) return null;
    const credentials = parseAndValidate(plain);
    return credentials ? normalizeCredentials(credentials) : null;
  }

  // 旧版明文：校验通过后迁移为加密信封（失败不阻断读取）
  const legacy = validateFields(data);
  if (legacy) {
    const normalized = normalizeCredentials(legacy);
    try {
      writeCredentials(filePath, normalized, codec);
    } catch (err) {
      console.warn('登录凭证明文迁移加密失败，将继续以明文文件运行：', err);
    }
    return normalized;
  }
  return null;
}

export function decodeCredentialsFile(
  filePath: string,
  codec: CredentialsCodec
): LoginCredentials | null {
  if (!fs.existsSync(filePath)) return null;

  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }

  if (isEnvelope(data)) {
    const plain = codec.decrypt(data.blob);
    if (plain === null) return null;
    const credentials = parseAndValidate(plain);
    return credentials ? normalizeCredentials(credentials) : null;
  }

  const legacy = validateFields(data);
  return legacy ? normalizeCredentials(legacy) : null;
}

/**
 * 令牌轮换后的回写：flat token 与 session 两处必须同步，
 * 只改一处会让 normalizeCredentials 的 schemaVersion 2 早退分支继续吐旧令牌
 */
export function withRefreshedSession(
  credentials: LoginCredentials,
  session: { accessToken: string; refreshToken?: string }
): LoginCredentials {
  const refreshToken = session.refreshToken ? { refreshToken: session.refreshToken } : {};
  return {
    ...credentials,
    token: session.accessToken,
    ...refreshToken,
    session: { ...credentials.session, accessToken: session.accessToken, ...refreshToken },
  };
}

/**
 * @author: logic
 * @date: 2026-08-11
 * 删除凭证文件，文件不存在时安全返回
 */
export function clearCredentials(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function isEnvelope(data: unknown): data is CredentialsEnvelope {
  const envelope = data as CredentialsEnvelope | null;
  return (
    typeof envelope === 'object' &&
    envelope !== null &&
    envelope.v === 1 &&
    typeof envelope.blob === 'string'
  );
}

function parseAndValidate(plain: string): LoginCredentials | null {
  try {
    return validateFields(JSON.parse(plain));
  } catch {
    return null;
  }
}

function validateFields(data: unknown): LoginCredentials | null {
  const creds = data as LoginCredentials | null;
  if (
    typeof creds?.token === 'string' &&
    typeof creds?.baseUrl === 'string' &&
    typeof creds?.apiKey === 'string' &&
    ((creds.schemaVersion === 2 &&
      creds.siteKind === 'sub2api' &&
      creds.gateway?.providerId === 'aibuddy') ||
      (creds.schemaVersion === undefined && creds.authKind === 'sub2api'))
  ) {
    return creds;
  }
  return null;
}

function normalizeCredentials(credentials: LoginCredentials): LoginCredentials {
  if (
    credentials.schemaVersion === 2 &&
    credentials.siteKind &&
    credentials.session &&
    credentials.gateway
  ) {
    return credentials;
  }

  return {
    ...credentials,
    schemaVersion: 2,
    siteKind: 'sub2api',
    session: {
      accessToken: credentials.token,
      ...(credentials.refreshToken ? { refreshToken: credentials.refreshToken } : {}),
      ...(credentials.pat ? { pat: credentials.pat } : {}),
    },
    account: {},
    gateway: {
      providerId: 'aibuddy',
      baseUrl: credentials.baseUrl,
      apiKey: credentials.apiKey,
      ...(credentials.groupId ? { groupId: credentials.groupId } : {}),
    },
  };
}
