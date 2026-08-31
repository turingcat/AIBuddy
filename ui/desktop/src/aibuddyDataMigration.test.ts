import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('rejects a canonical OA credential with stale sub2api authKind', () => {
    writeLegacyCredentials({
      schemaVersion: 2,
      siteKind: 'oa',
      authKind: 'sub2api',
      token: 'oa-token',
      baseUrl: 'https://oa.example.com',
      apiKey: 'oa-key',
      session: { accessToken: 'oa-token' },
      account: {},
      gateway: {
        providerId: 'heybuddy',
        baseUrl: 'https://oa.example.com',
        apiKey: 'oa-key',
      },
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

  it('does not overwrite credentials that appear during exclusive publication', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    writeLegacySettings();
    const targetCredentialsFile = path.join(targetUserDataDir, 'credentials.json');
    const linkSync = fs.linkSync;
    const linkSpy = vi.spyOn(fs, 'linkSync').mockImplementation((sourceFile, targetFile) => {
      if (targetFile === targetCredentialsFile) {
        fs.writeFileSync(targetCredentialsFile, 'other process credentials');
      }
      return linkSync(sourceFile, targetFile);
    });

    try {
      expect(migrate()).toMatchObject({ credentialsMigrated: false, settingsMigrated: false });
    } finally {
      linkSpy.mockRestore();
    }

    expect(fs.readFileSync(targetCredentialsFile, 'utf8')).toBe('other process credentials');
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

  it('rolls back credentials when settings copy fails', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    fs.mkdirSync(path.join(legacyUserDataDir, 'settings.json'));

    expect(migrate).toThrow();
    expect(fs.existsSync(targetUserDataDir)).toBe(false);
  });

  it('does not remove credentials published by another process during rollback', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    const legacySettingsFile = path.join(legacyUserDataDir, 'settings.json');
    const targetCredentialsFile = path.join(targetUserDataDir, 'credentials.json');
    const replacementCredentialsFile = path.join(rootDir, 'replacement-credentials.json');
    fs.mkdirSync(legacySettingsFile);
    const copyFileSync = fs.copyFileSync;
    const copySpy = vi
      .spyOn(fs, 'copyFileSync')
      .mockImplementation((sourceFile, targetFile, mode) => {
        if (sourceFile === legacySettingsFile) {
          fs.writeFileSync(replacementCredentialsFile, 'other process credentials');
          fs.renameSync(replacementCredentialsFile, targetCredentialsFile);
        }
        return copyFileSync(sourceFile, targetFile, mode);
      });

    try {
      expect(migrate).toThrow();
    } finally {
      copySpy.mockRestore();
    }

    expect(fs.readFileSync(targetCredentialsFile, 'utf8')).toBe('other process credentials');
  });

  it('rolls back credentials when settings publication fails', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    writeLegacySettings();
    const targetSettingsFile = path.join(targetUserDataDir, 'settings.json');
    const linkSync = fs.linkSync;
    const linkSpy = vi.spyOn(fs, 'linkSync').mockImplementation((sourceFile, targetFile) => {
      if (targetFile === targetSettingsFile) {
        const error = new Error('settings publication denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }
      return linkSync(sourceFile, targetFile);
    });

    try {
      expect(migrate).toThrow('settings publication denied');
    } finally {
      linkSpy.mockRestore();
    }

    expect(fs.existsSync(targetUserDataDir)).toBe(false);
  });

  it('reports settings as not migrated when another process creates the destination', () => {
    writeLegacyCredentials({
      token: 'legacy-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    writeLegacySettings();
    const targetSettingsFile = path.join(targetUserDataDir, 'settings.json');
    const renameSync = fs.renameSync;
    const linkSync = fs.linkSync;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((sourceFile, targetFile) => {
      if (targetFile === targetSettingsFile) {
        fs.writeFileSync(targetSettingsFile, '{"theme":"other"}\n');
      }
      return renameSync(sourceFile, targetFile);
    });
    const linkSpy = vi.spyOn(fs, 'linkSync').mockImplementation((sourceFile, targetFile) => {
      if (targetFile === targetSettingsFile) {
        fs.writeFileSync(targetSettingsFile, '{"theme":"other"}\n');
      }
      return linkSync(sourceFile, targetFile);
    });

    try {
      expect(migrate()).toMatchObject({ credentialsMigrated: true, settingsMigrated: false });
    } finally {
      renameSpy.mockRestore();
      linkSpy.mockRestore();
    }

    expect(fs.readFileSync(targetSettingsFile, 'utf8')).toBe('{"theme":"other"}\n');
  });
});
