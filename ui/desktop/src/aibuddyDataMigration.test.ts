import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateLegacyAIBuddyData, type MigrationOptions } from './aibuddyDataMigration';
import { decodeCredentialsFile, type CredentialsCodec } from './credentials';

const identityCodec: CredentialsCodec = {
  encrypt: (plain) => plain,
  decrypt: (blob) => blob,
};

const brokenCodec: CredentialsCodec = {
  encrypt: () => {
    throw new Error('encrypt unavailable');
  },
  decrypt: () => null,
};

describe('migrateLegacyAIBuddyData', () => {
  let rootDir: string;
  let legacyUserDataDir: string;
  let targetUserDataDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibuddy-migration-'));
    legacyUserDataDir = path.join(rootDir, 'HeyBuddy');
    targetUserDataDir = path.join(rootDir, 'AIBuddy');
    fs.mkdirSync(legacyUserDataDir);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  function migrate(overrides: Partial<MigrationOptions> = {}) {
    return migrateLegacyAIBuddyData({
      edition: 'aibuddy',
      legacyUserDataDir,
      targetUserDataDir,
      codec: identityCodec,
      ...overrides,
    });
  }

  function writeLegacyCredentials(credentials: object): void {
    fs.writeFileSync(path.join(legacyUserDataDir, 'credentials.json'), JSON.stringify(credentials));
  }

  function writeLegacySettings(contents = '{"theme":"dark"}\n'): void {
    fs.writeFileSync(path.join(legacyUserDataDir, 'settings.json'), contents);
  }

  it('migrates legacy sub2api envelope settings into empty AIBuddy directory', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    writeLegacySettings();

    expect(migrate()).toMatchObject({ credentialsMigrated: true, settingsMigrated: true });
    expect(
      decodeCredentialsFile(path.join(targetUserDataDir, 'credentials.json'), identityCodec)
    ).toMatchObject({
      token: 'legacy-token',
      siteKind: 'sub2api',
      gateway: { providerId: 'aibuddy' },
    });
    expect(fs.readFileSync(path.join(targetUserDataDir, 'settings.json'), 'utf8')).toBe(
      '{"theme":"dark"}\n'
    );
  });

  it('migrates normalized sub2api envelope settings into empty AIBuddy directory', () => {
    writeLegacyCredentials({
      v: 1,
      blob: JSON.stringify({
        schemaVersion: 2,
        siteKind: 'sub2api',
        token: 'normalized-token',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-aibuddy',
        session: { accessToken: 'normalized-token' },
        account: {},
        gateway: {
          providerId: 'aibuddy',
          baseUrl: 'https://tflow.online/v1',
          apiKey: 'sk-aibuddy',
        },
      }),
    });
    writeLegacySettings('{"language":"zh-CN"}\n');

    migrate();

    expect(
      decodeCredentialsFile(path.join(targetUserDataDir, 'credentials.json'), identityCodec)
    ).toMatchObject({ token: 'normalized-token', siteKind: 'sub2api' });
    expect(fs.readFileSync(path.join(targetUserDataDir, 'settings.json'), 'utf8')).toBe(
      '{"language":"zh-CN"}\n'
    );
  });

  it('does nothing in HeyBuddy edition', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    writeLegacySettings();

    expect(migrate({ edition: 'heybuddy' })).toMatchObject({
      credentialsMigrated: false,
      settingsMigrated: false,
    });
    expect(fs.existsSync(targetUserDataDir)).toBe(false);
  });

  it('rejects OA credentials does not copy settings', () => {
    writeLegacyCredentials({
      token: 'oa-token',
      baseUrl: 'https://oa.example.com',
      apiKey: 'oa-key',
      authKind: 'oa',
    });
    writeLegacySettings();

    migrate();

    expect(fs.existsSync(targetUserDataDir)).toBe(false);
  });

  it('rejects invalid credentials leaves target empty', () => {
    writeLegacyCredentials({ token: 1, baseUrl: 'https://tflow.online/v1', apiKey: 'sk-aibuddy' });
    writeLegacySettings();

    migrate();

    expect(fs.existsSync(targetUserDataDir)).toBe(false);
  });

  it('rejects undecryptable credentials leaves target empty', () => {
    writeLegacyCredentials({ v: 1, blob: 'unreadable' });
    writeLegacySettings();

    migrate({ codec: brokenCodec });

    expect(fs.existsSync(targetUserDataDir)).toBe(false);
  });

  it('does not overwrite existing AIBuddy credentials file', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    writeLegacySettings();
    fs.mkdirSync(targetUserDataDir);
    fs.writeFileSync(path.join(targetUserDataDir, 'credentials.json'), 'target credentials');

    migrate();

    expect(fs.readFileSync(path.join(targetUserDataDir, 'credentials.json'), 'utf8')).toBe(
      'target credentials'
    );
    expect(fs.existsSync(path.join(targetUserDataDir, 'settings.json'))).toBe(false);
  });

  it('does not overwrite existing AIBuddy settings file credential migration', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    writeLegacySettings('{"theme":"dark"}\n');
    fs.mkdirSync(targetUserDataDir);
    fs.writeFileSync(path.join(targetUserDataDir, 'settings.json'), '{"theme":"light"}\n');

    expect(migrate()).toMatchObject({ credentialsMigrated: true, settingsMigrated: false });
    expect(
      decodeCredentialsFile(path.join(targetUserDataDir, 'credentials.json'), identityCodec)
    ).toMatchObject({ token: 'legacy-token', siteKind: 'sub2api' });
    expect(fs.readFileSync(path.join(targetUserDataDir, 'settings.json'), 'utf8')).toBe(
      '{"theme":"light"}\n'
    );
  });
});
