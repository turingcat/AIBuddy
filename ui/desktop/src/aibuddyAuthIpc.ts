import type { IpcMain } from 'electron';
import { AIBuddyPendingLoginStore } from './aibuddyPendingLogin';
import type { LoginCredentials } from './credentials';
import {
  completeSub2apiTotp,
  fetchSub2apiPublicSettings,
  prepareAIBuddyProvisioning,
  provisionAIBuddyGroup,
  startSub2apiLogin,
  type AIBuddyGroup,
  type FetchLike,
  type Sub2apiPublicSettings,
} from './sub2apiAuth';

export type AIBuddyAuthResult =
  | { ok: true; step: 'authenticated'; firstModelId: string }
  | { ok: true; step: 'select-group'; pendingLoginId: string; groups: AIBuddyGroup[] }
  | { ok: true; step: 'totp-required'; tempToken: string; maskedEmail?: string }
  | { ok: false; message: string; reason?: string };

export interface AIBuddyAuthIpcDependencies {
  apiBaseUrl: string;
  fetchImpl: FetchLike;
  idempotencyKeyFactory: () => string;
  writeCredentials: (credentials: LoginCredentials) => void;
  pendingLogins?: AIBuddyPendingLoginStore;
}

function errorResult(error: unknown): Extract<AIBuddyAuthResult, { ok: false }> {
  return { ok: false, message: error instanceof Error ? error.message : '登录失败，请稍后重试' };
}

export function registerAIBuddyAuthIpc(
  ipcMain: Pick<IpcMain, 'handle'>,
  {
    apiBaseUrl,
    fetchImpl,
    idempotencyKeyFactory,
    writeCredentials,
    pendingLogins = new AIBuddyPendingLoginStore(),
  }: AIBuddyAuthIpcDependencies
): void {
  const completeProvisioning = async (
    accessToken: string,
    settings: Sub2apiPublicSettings
  ): Promise<AIBuddyAuthResult> => {
    try {
      const prepared = await prepareAIBuddyProvisioning(
        apiBaseUrl,
        accessToken,
        settings,
        fetchImpl
      );
      if (prepared.step === 'authenticated') {
        writeCredentials(prepared.credentials);
        return { ok: true, step: 'authenticated', firstModelId: prepared.firstModelId };
      }
      return {
        ok: true,
        step: 'select-group',
        pendingLoginId: pendingLogins.create({ accessToken, settings, groups: prepared.groups }),
        groups: prepared.groups,
      };
    } catch (error) {
      return errorResult(error);
    }
  };

  ipcMain.handle('get-aibuddy-auth-settings', () =>
    fetchSub2apiPublicSettings(apiBaseUrl, fetchImpl)
  );
  ipcMain.handle(
    'login-via-aibuddy',
    async (_event, email: string, password: string, captchaProof: string) => {
      const settingsResult = await fetchSub2apiPublicSettings(apiBaseUrl, fetchImpl);
      if (!settingsResult.ok) {
        return {
          ok: false,
          message: settingsResult.message,
          ...(settingsResult.reason ? { reason: settingsResult.reason } : {}),
        };
      }
      try {
        const login = await startSub2apiLogin(apiBaseUrl, email, password, captchaProof, fetchImpl);
        if (login.kind === 'totp-required') {
          return {
            ok: true,
            step: 'totp-required',
            tempToken: login.tempToken,
            maskedEmail: login.maskedEmail,
          };
        }
        return completeProvisioning(login.accessToken, settingsResult.settings);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
  ipcMain.handle('complete-aibuddy-2fa', async (_event, tempToken: string, totpCode: string) => {
    try {
      const accessToken = await completeSub2apiTotp(apiBaseUrl, tempToken, totpCode, fetchImpl);
      const settingsResult = await fetchSub2apiPublicSettings(apiBaseUrl, fetchImpl);
      if (!settingsResult.ok) {
        return {
          ok: false,
          message: settingsResult.message,
          ...(settingsResult.reason ? { reason: settingsResult.reason } : {}),
        };
      }
      return completeProvisioning(accessToken, settingsResult.settings);
    } catch (error) {
      return errorResult(error);
    }
  });
  ipcMain.handle(
    'provision-aibuddy-group',
    async (_event, pendingLoginId: string, groupId: string) => {
      const pending = pendingLogins.consume(pendingLoginId);
      if (!pending) {
        return { ok: false, message: '登录状态已过期，请重新登录' };
      }
      if (!pending.groups.some((group) => group.id === groupId)) {
        return { ok: false, message: '请选择可用分组' };
      }
      try {
        const provisioned = await provisionAIBuddyGroup(
          apiBaseUrl,
          pending.accessToken,
          pending.settings,
          groupId,
          fetchImpl,
          idempotencyKeyFactory
        );
        writeCredentials(provisioned.credentials);
        return { ok: true, step: 'authenticated', firstModelId: provisioned.firstModelId };
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
