import fs from 'node:fs';
import path from 'node:path';
import {
  decodeCredentialsFile,
  writeCredentials,
  type CredentialsCodec,
  type LoginCredentials,
} from './credentials';

export interface MigrationOptions {
  legacyUserDataDir: string;
  targetUserDataDir: string;
  codec: CredentialsCodec;
}

export interface MigrationResult {
  credentialsMigrated: boolean;
  settingsMigrated: boolean;
}

interface PublishedCredentials {
  temporaryFile: string;
  contents: Buffer;
}

export function migrateLegacyAIBuddyData({
  legacyUserDataDir,
  targetUserDataDir,
  codec,
}: MigrationOptions): MigrationResult {
  const result: MigrationResult = {
    credentialsMigrated: false,
    settingsMigrated: false,
  };
  const targetCredentialsFile = path.join(targetUserDataDir, 'credentials.json');

  if (fs.existsSync(targetCredentialsFile)) return result;
  const targetDirectoryExisted = fs.existsSync(targetUserDataDir);

  const legacyCredentials = decodeCredentialsFile(
    path.join(legacyUserDataDir, 'credentials.json'),
    codec
  );
  if (!legacyCredentials || !isSub2apiCredentials(legacyCredentials)) {
    return result;
  }

  const publishedCredentials = publishCredentialsAtomically(
    targetCredentialsFile,
    legacyCredentials,
    codec
  );
  if (!publishedCredentials) {
    if (!targetDirectoryExisted) removeEmptyDirectory(targetUserDataDir);
    return result;
  }
  result.credentialsMigrated = true;

  let rollbackCredentials = false;
  try {
    const legacySettingsFile = path.join(legacyUserDataDir, 'settings.json');
    const targetSettingsFile = path.join(targetUserDataDir, 'settings.json');
    if (fs.existsSync(legacySettingsFile) && !fs.existsSync(targetSettingsFile)) {
      result.settingsMigrated = copySettingsAtomically(legacySettingsFile, targetSettingsFile);
    }
  } catch (error) {
    rollbackCredentials = true;
    rollbackPublishedCredentials(publishedCredentials, targetCredentialsFile);
    throw error;
  } finally {
    removeFile(publishedCredentials.temporaryFile);
    if (rollbackCredentials && !targetDirectoryExisted) {
      removeEmptyDirectory(targetUserDataDir);
    }
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

function publishCredentialsAtomically(
  targetFile: string,
  credentials: LoginCredentials,
  codec: CredentialsCodec
): PublishedCredentials | null {
  const temporaryFile = temporaryFilePath(targetFile);
  writeCredentials(temporaryFile, credentials, codec);
  const contents = fs.readFileSync(temporaryFile);

  try {
    fs.linkSync(temporaryFile, targetFile);
    return { temporaryFile, contents };
  } catch (error) {
    removeFile(temporaryFile);
    if (isAlreadyExistsError(error)) return null;
    throw error;
  }
}

function copySettingsAtomically(sourceFile: string, targetFile: string): boolean {
  const temporaryFile = temporaryFilePath(targetFile);

  try {
    fs.copyFileSync(sourceFile, temporaryFile, fs.constants.COPYFILE_EXCL);
    try {
      fs.linkSync(temporaryFile, targetFile);
      return true;
    } catch (error) {
      if (isAlreadyExistsError(error)) return false;
      throw error;
    }
  } finally {
    removeFile(temporaryFile);
  }
}

function temporaryFilePath(targetFile: string): string {
  return path.join(
    path.dirname(targetFile),
    `.${path.basename(targetFile)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  return (error as { code?: string }).code === 'EEXIST';
}

function isSameFile(firstFile: string, secondFile: string): boolean {
  try {
    const first = fs.statSync(firstFile);
    const second = fs.statSync(secondFile);
    return first.dev === second.dev && first.ino === second.ino;
  } catch {
    return false;
  }
}

function rollbackPublishedCredentials(
  { temporaryFile, contents }: PublishedCredentials,
  targetFile: string
): void {
  const claimDirectory = fs.mkdtempSync(
    path.join(path.dirname(targetFile), `.${path.basename(targetFile)}.rollback-`)
  );
  const claimedFile = path.join(claimDirectory, path.basename(targetFile));

  try {
    try {
      fs.renameSync(targetFile, claimedFile);
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }

    if (isSameFile(claimedFile, temporaryFile) && fs.readFileSync(claimedFile).equals(contents)) {
      removeFile(claimedFile);
      return;
    }

    try {
      fs.linkSync(claimedFile, targetFile);
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;
    }
    removeFile(claimedFile);
  } finally {
    removeEmptyDirectory(claimDirectory);
  }
}

function isNotFoundError(error: unknown): boolean {
  return (error as { code?: string }).code === 'ENOENT';
}

function removeFile(filePath: string): void {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function removeEmptyDirectory(directoryPath: string): void {
  try {
    fs.rmdirSync(directoryPath);
  } catch {
    // A concurrent process created data in the directory.
  }
}
