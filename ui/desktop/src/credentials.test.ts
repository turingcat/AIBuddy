import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  decodeCredentialsFile,
  readCredentials,
  writeCredentials,
  withRefreshedSession,
  clearCredentials,
  type CredentialsCodec,
} from './credentials';

/**
 * @author: logic
 * @date: 2026-08-27
 * credentials 读写单测：以注入 codec 覆盖加密往返、旧明文自动迁移、回退与损坏分支
 */

// 恒等编解码：模拟 Linux 无系统加密时的明文回退
const identityCodec: CredentialsCodec = {
  encrypt: (plain) => plain,
  decrypt: (blob) => blob,
};

// 可逆 base64 编解码：模拟 safeStorage 的加解密行为
const base64Codec: CredentialsCodec = {
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (blob) => {
    try {
      return Buffer.from(blob, 'base64').toString('utf8');
    } catch {
      return null;
    }
  },
};

// 解密恒失败：模拟密钥变更后旧密文无法解开的场景
const brokenCodec: CredentialsCodec = {
  encrypt: () => {
    throw new Error('encrypt unavailable');
  },
  decrypt: () => null,
};

describe('credentials 读写', () => {
  let tmpFile: string;
  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `creds-${Math.random().toString(36).slice(2)}.json`);
  });
  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('文件不存在时 read 返回 null', () => {
    expect(readCredentials(tmpFile, identityCodec)).toBeNull();
  });

  it('write 后 read 能读回（identity 回退）', () => {
    const creds = { token: 't', baseUrl: 'https://gw', apiKey: 'k' };
    writeCredentials(tmpFile, creds, identityCodec);
    expect(readCredentials(tmpFile, identityCodec)).toMatchObject(creds);
  });

  it('含 pat 时 write/read 往返保留（加密 codec）', () => {
    const creds = { token: 't', baseUrl: 'u', apiKey: 'k', pat: 'pat-x' };
    writeCredentials(tmpFile, creds, base64Codec);
    expect(readCredentials(tmpFile, base64Codec)).toMatchObject(creds);
  });

  it('加密写入后文件不含明文凭证', () => {
    writeCredentials(
      tmpFile,
      { token: 'secret-token', baseUrl: 'https://gw', apiKey: 'secret-key', pat: 'secret-pat' },
      base64Codec
    );
    const raw = fs.readFileSync(tmpFile, 'utf8');
    expect(raw).not.toContain('secret-token');
    expect(raw).not.toContain('secret-key');
    expect(raw).not.toContain('secret-pat');
    expect(JSON.parse(raw)).toMatchObject({ v: 1 });
  });

  it('旧登录文件（明文）无 pat 字段时仍可读', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ token: 't', baseUrl: 'u', apiKey: 'k' }));
    const creds = readCredentials(tmpFile, identityCodec);
    expect(creds).toMatchObject({ token: 't', baseUrl: 'u', apiKey: 'k' });
    expect(creds?.pat).toBeUndefined();
  });

  it('decodeCredentialsFile 读取旧明文但不重写源文件', () => {
    const plaintext = JSON.stringify({
      token: 'plain-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    fs.writeFileSync(tmpFile, plaintext);

    expect(decodeCredentialsFile(tmpFile, base64Codec)).toMatchObject({
      token: 'plain-token',
      siteKind: 'sub2api',
    });
    expect(fs.readFileSync(tmpFile, 'utf8')).toBe(plaintext);
  });

  it('旧明文文件用加密 codec 读取时自动迁移为 v:1 信封', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ token: 'plain-token', baseUrl: 'u', apiKey: 'k' }));
    const creds = readCredentials(tmpFile, base64Codec);
    expect(creds).toMatchObject({ token: 'plain-token', baseUrl: 'u', apiKey: 'k' });
    const raw = fs.readFileSync(tmpFile, 'utf8');
    expect(raw).not.toContain('plain-token');
    expect(JSON.parse(raw)).toMatchObject({ v: 1 });
    // 迁移后再读一次仍可读回
    expect(readCredentials(tmpFile, base64Codec)).toEqual(creds);
  });

  it('旧明文文件用 identity codec 读取时重写为信封结构', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ token: 't', baseUrl: 'u', apiKey: 'k' }));
    const creds = readCredentials(tmpFile, identityCodec);
    expect(creds).toMatchObject({ token: 't', baseUrl: 'u', apiKey: 'k' });
    const envelope = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    expect(envelope).toMatchObject({ v: 1 });
    expect(typeof envelope.blob).toBe('string');
  });

  it('sub2api authKind 加密往返后保留', () => {
    const creds = {
      token: 'access-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api' as const,
    };

    writeCredentials(tmpFile, creds, base64Codec);

    expect(readCredentials(tmpFile, base64Codec)).toMatchObject(creds);
  });

  it('migrates a legacy TFlow credential into a normalized site record', () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        token: 'access-token',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-aibuddy',
        authKind: 'sub2api',
      })
    );

    expect(readCredentials(tmpFile, identityCodec)).toMatchObject({
      schemaVersion: 2,
      siteKind: 'sub2api',
      session: { accessToken: 'access-token' },
      account: {},
      gateway: {
        providerId: 'aibuddy',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-aibuddy',
      },
    });
  });

  // 余额取数按 gateway.groupId 判断该账号走计量余额还是订阅日限额，归一化不能把它丢掉
  it('surfaces the key group on the normalized gateway record', () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        token: 'access-token',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-aibuddy',
        authKind: 'sub2api',
        groupId: '42',
      })
    );

    expect(readCredentials(tmpFile, identityCodec)).toMatchObject({
      gateway: { groupId: '42' },
    });
  });

  it('旧版凭证没有 authKind 时仍然有效', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ token: 'legacy', baseUrl: 'u', apiKey: 'k' }));

    expect(readCredentials(tmpFile, identityCodec)).toMatchObject({
      token: 'legacy',
      baseUrl: 'u',
      apiKey: 'k',
    });
  });

  it('v:1 信封 blob 解密失败时返回 null', () => {
    const blob = Buffer.from('{"token":"t","baseUrl":"u","apiKey":"k"}', 'utf8').toString('base64');
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, blob }));
    expect(readCredentials(tmpFile, brokenCodec)).toBeNull();
  });

  it('v:1 信封 blob 非字符串时返回 null', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, blob: 12345 }));
    expect(readCredentials(tmpFile, base64Codec)).toBeNull();
  });

  it('v:1 信封解密后内层 JSON 非法时返回 null', () => {
    const blob = Buffer.from('not json', 'utf8').toString('base64');
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, blob }));
    expect(readCredentials(tmpFile, base64Codec)).toBeNull();
  });

  it('v:1 信封解密后字段类型不匹配时返回 null', () => {
    const blob = Buffer.from(
      JSON.stringify({ token: 1, baseUrl: 'u', apiKey: 'k' }),
      'utf8'
    ).toString('base64');
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, blob }));
    expect(readCredentials(tmpFile, base64Codec)).toBeNull();
  });

  // Windows 上 Unix 权限位不生效，仅在 Linux/macOS 校验 0o600
  it.skipIf(process.platform === 'win32')('write 后文件权限为 0o600', () => {
    writeCredentials(tmpFile, { token: 't', baseUrl: 'u', apiKey: 'k' }, identityCodec);
    const mode = fs.statSync(tmpFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  // 迁移写入失败（只读文件）不应阻断读取，凭证仍返回
  it.skipIf(process.platform === 'win32')('旧明文迁移写入失败时读取不中断', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ token: 't', baseUrl: 'u', apiKey: 'k' }));
    fs.chmodSync(tmpFile, 0o400);
    try {
      expect(readCredentials(tmpFile, identityCodec)).toMatchObject({
        token: 't',
        baseUrl: 'u',
        apiKey: 'k',
      });
    } finally {
      fs.chmodSync(tmpFile, 0o600);
    }
  });

  it('clear 删除文件', () => {
    writeCredentials(tmpFile, { token: 't', baseUrl: 'u', apiKey: 'k' }, identityCodec);
    clearCredentials(tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('clear 文件不存在时不抛异常', () => {
    expect(() => clearCredentials(tmpFile)).not.toThrow();
  });

  it('read 损坏文件返回 null', () => {
    fs.writeFileSync(tmpFile, 'not json');
    expect(readCredentials(tmpFile, identityCodec)).toBeNull();
  });

  it('read 字段类型不匹配返回 null', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ token: 1, baseUrl: 'u', apiKey: 'k' }));
    expect(readCredentials(tmpFile, identityCodec)).toBeNull();
  });
});

// 令牌轮换后如果只更新 flat token，schemaVersion 2 的记录读回来仍是旧 session，
// 下一次取数又是 401，刷新形同虚设
describe('withRefreshedSession', () => {
  it('更新 flat 与 session 两处令牌并保留其余凭证', () => {
    const refreshed = withRefreshedSession(
      {
        schemaVersion: 2,
        siteKind: 'sub2api',
        token: 'old-access',
        refreshToken: 'old-refresh',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-secret',
        authKind: 'sub2api',
        groupId: 'team-a',
        session: { accessToken: 'old-access', refreshToken: 'old-refresh' },
      },
      { accessToken: 'new-access', refreshToken: 'new-refresh' }
    );

    expect(refreshed).toMatchObject({
      token: 'new-access',
      refreshToken: 'new-refresh',
      session: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      apiKey: 'sk-secret',
      groupId: 'team-a',
    });
  });

  it('面板未下发新 refresh token 时沿用原有的', () => {
    const refreshed = withRefreshedSession(
      {
        token: 'old-access',
        refreshToken: 'old-refresh',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-secret',
        session: { accessToken: 'old-access', refreshToken: 'old-refresh' },
      },
      { accessToken: 'new-access' }
    );

    expect(refreshed.token).toBe('new-access');
    expect(refreshed.refreshToken).toBe('old-refresh');
    expect(refreshed.session).toEqual({
      accessToken: 'new-access',
      refreshToken: 'old-refresh',
    });
  });
});
