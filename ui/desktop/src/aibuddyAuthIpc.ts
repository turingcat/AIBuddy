import type { IpcMain } from 'electron';
import {
  authenticateAIBuddy,
  completeAIBuddyAuthentication,
  fetchSub2apiPublicSettings,
  type FetchLike,
} from './sub2apiAuth';

export interface AIBuddyAuthIpcDependencies {
  apiBaseUrl: string;
  fetchImpl: FetchLike;
  idempotencyKeyFactory: () => string;
}

export function registerAIBuddyAuthIpc(
  ipcMain: Pick<IpcMain, 'handle'>,
  { apiBaseUrl, fetchImpl, idempotencyKeyFactory }: AIBuddyAuthIpcDependencies
): void {
  ipcMain.handle('get-aibuddy-auth-settings', () =>
    fetchSub2apiPublicSettings(apiBaseUrl, fetchImpl)
  );
  ipcMain.handle(
    'login-via-aibuddy',
    (_event, email: string, password: string, captchaProof: string) =>
      authenticateAIBuddy(
        apiBaseUrl,
        email,
        password,
        captchaProof,
        fetchImpl,
        idempotencyKeyFactory
      )
  );
  ipcMain.handle('complete-aibuddy-2fa', (_event, tempToken: string, totpCode: string) =>
    completeAIBuddyAuthentication(apiBaseUrl, tempToken, totpCode, fetchImpl, idempotencyKeyFactory)
  );
}
