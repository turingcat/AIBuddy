import path from 'node:path';
import { getAppDisplayName } from './brand';

export interface AppIdentityTarget {
  setName(name: string): void;
  getPath(name: 'userData'): string;
}

export interface AppDataPaths {
  userDataDir: string;
  goosePathRoot: string;
  settingsFile: string;
  credentialsFile: string;
  startupLogsDir: string;
}

export function initializeAppIdentity(app: AppIdentityTarget): AppDataPaths {
  app.setName(getAppDisplayName());
  const userDataDir = app.getPath('userData');
  return {
    userDataDir,
    goosePathRoot: path.join(userDataDir, 'goose'),
    settingsFile: path.join(userDataDir, 'settings.json'),
    credentialsFile: path.join(userDataDir, 'credentials.json'),
    startupLogsDir: path.join(userDataDir, 'logs', 'startup'),
  };
}
