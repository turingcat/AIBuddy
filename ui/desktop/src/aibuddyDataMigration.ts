import fs from 'node:fs';
import path from 'node:path';
import type { AppEdition } from './brand';
import { decodeCredentialsFile, writeCredentials, type CredentialsCodec } from './credentials';

export interface MigrationOptions {
  edition: AppEdition;
  legacyUserDataDir: string;
  targetUserDataDir: string;
  codec: CredentialsCodec;
}

export interface MigrationResult {
  credentialsMigrated: boolean;
  settingsMigrated: boolean;
}

export function migrateLegacyAIBuddyData({
  edition,
  legacyUserDataDir,
  targetUserDataDir,
  codec,
}: MigrationOptions): MigrationResult {
  const result: MigrationResult = {
    credentialsMigrated: false,
    settingsMigrated: false,
  };
  const targetCredentialsFile = path.join(targetUserDataDir, 'credentials.json');

  if (edition !== 'aibuddy' || fs.existsSync(targetCredentialsFile)) return result;
  const targetDirectoryExisted = fs.existsSync(targetUserDataDir);

  const legacyCredentials = decodeCredentialsFile(
    path.join(legacyUserDataDir, 'credentials.json'),
    codec
  );
  if (!legacyCredentials || !isSub2apiCredentials(legacyCredentials)) {
    return result;
  }

  writeCredentials(targetCredentialsFile, legacyCredentials, codec);
  result.credentialsMigrated = true;

  try {
    const legacySettingsFile = path.join(legacyUserDataDir, 'settings.json');
    const targetSettingsFile = path.join(targetUserDataDir, 'settings.json');
    if (fs.existsSync(legacySettingsFile) && !fs.existsSync(targetSettingsFile)) {
      result.settingsMigrated = copySettingsAtomically(legacySettingsFile, targetSettingsFile);
    }
  } catch (error) {
    fs.unlinkSync(targetCredentialsFile);
    if (!targetDirectoryExisted) {
      try {
        fs.rmdirSync(targetUserDataDir);
      } catch {
        // A concurrent process created data in the directory.
      }
    }
    throw error;
  }

  return result;
}

function isSub2apiCredentials(credentials: {
  siteKind?: string;
  authKind?: 'oa' | 'sub2api';
}): boolean {
  return credentials.siteKind
    ? credentials.siteKind === 'sub2api'
    : credentials.authKind === 'sub2api';
}

function copySettingsAtomically(sourceFile: string, targetFile: string): boolean {
  const temporaryFile = path.join(
    path.dirname(targetFile),
    `.${path.basename(targetFile)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  );

  try {
    fs.copyFileSync(sourceFile, temporaryFile, fs.constants.COPYFILE_EXCL);
    if (fs.existsSync(targetFile)) return false;
    fs.renameSync(temporaryFile, targetFile);
    return true;
  } finally {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
}
