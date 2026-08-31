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

  const legacyCredentials = decodeCredentialsFile(
    path.join(legacyUserDataDir, 'credentials.json'),
    codec
  );
  if (
    !legacyCredentials ||
    (legacyCredentials.siteKind !== 'sub2api' && legacyCredentials.authKind !== 'sub2api')
  ) {
    return result;
  }

  writeCredentials(targetCredentialsFile, legacyCredentials, codec);
  result.credentialsMigrated = true;

  const legacySettingsFile = path.join(legacyUserDataDir, 'settings.json');
  const targetSettingsFile = path.join(targetUserDataDir, 'settings.json');
  if (fs.existsSync(legacySettingsFile) && !fs.existsSync(targetSettingsFile)) {
    copySettingsAtomically(legacySettingsFile, targetSettingsFile);
    result.settingsMigrated = true;
  }

  return result;
}

function copySettingsAtomically(sourceFile: string, targetFile: string): void {
  const temporaryFile = path.join(
    path.dirname(targetFile),
    `.${path.basename(targetFile)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  );

  try {
    fs.copyFileSync(sourceFile, temporaryFile, fs.constants.COPYFILE_EXCL);
    if (fs.existsSync(targetFile)) return;
    fs.renameSync(temporaryFile, targetFile);
  } finally {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
}
