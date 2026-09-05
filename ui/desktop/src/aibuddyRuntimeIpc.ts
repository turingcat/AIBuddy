import type { IpcMain } from 'electron';
import {
  BalanceFetchError,
  runBalanceFetch,
  toSub2apiBalanceData,
  type BalanceResult,
  type FetchLike,
} from './balance';
import { withRefreshedSession, type CanonicalAIBuddyCredentials } from './credentials';
import type { Sub2apiSession } from './sub2apiAuth';
import {
  Sub2apiUnauthorizedError,
  type SiteModel,
  type Sub2apiEntitlement,
} from './siteRuntime/sub2apiAdapter';

export interface AIBuddyRuntimeIpcDependencies {
  apiBaseUrl: string;
  fetchImpl: FetchLike;
  readCredentials: () => CanonicalAIBuddyCredentials | null;
  writeCredentials: (credentials: CanonicalAIBuddyCredentials) => void;
  withSession: (
    panelBaseUrl: string,
    session: Sub2apiSession,
    fetchImpl: FetchLike,
    onRefreshed: (session: Sub2apiSession) => void,
    run: (accessToken: string) => Promise<Sub2apiEntitlement>
  ) => Promise<Sub2apiEntitlement>;
  fetchEntitlement: (
    baseUrl: string,
    accessToken: string,
    groupId: string | undefined,
    fetchImpl: FetchLike
  ) => Promise<Sub2apiEntitlement>;
  fetchModels: (baseUrl: string, apiKey: string, fetchImpl: FetchLike) => Promise<SiteModel[]>;
  logger: { error: (message: string) => void };
}

const USD_CURRENCY = {
  quotaPerUnit: 1,
  quotaDisplayType: 'USD' as const,
  usdExchangeRate: 1,
  customCurrencySymbol: '$',
  customCurrencyExchangeRate: 1,
};

export function registerAIBuddyRuntimeIpc(
  ipcMain: Pick<IpcMain, 'handle'>,
  {
    apiBaseUrl,
    fetchImpl,
    readCredentials,
    writeCredentials,
    withSession,
    fetchEntitlement,
    fetchModels,
    logger,
  }: AIBuddyRuntimeIpcDependencies
): void {
  ipcMain.handle('get-user-balance', async (): Promise<BalanceResult> => {
    const credentials = readCredentials();
    if (!credentials) {
      return { ok: false, kind: 'not-logged-in', message: '尚未登录' };
    }

    const refreshToken = credentials.session.refreshToken;
    return runBalanceFetch(async () => {
      const entitlement = await withSession(
        apiBaseUrl,
        {
          accessToken: credentials.session.accessToken,
          ...(refreshToken ? { refreshToken } : {}),
        },
        fetchImpl,
        (refreshed) => writeCredentials(withRefreshedSession(credentials, refreshed)),
        (accessToken) =>
          fetchEntitlement(apiBaseUrl, accessToken, credentials.gateway.groupId, fetchImpl)
      ).catch((error) => {
        if (error instanceof Sub2apiUnauthorizedError) {
          throw new BalanceFetchError('unauthorized', error.message);
        }
        throw error;
      });

      return { balance: toSub2apiBalanceData(entitlement), currency: USD_CURRENCY };
    });
  });

  ipcMain.handle('list-models-via-api', async () => {
    try {
      const credentials = readCredentials();
      if (!credentials) return [];

      return (
        await fetchModels(credentials.gateway.baseUrl, credentials.gateway.apiKey, fetchImpl)
      ).map((model) => ({
        id: model.id,
        name: model.id,
        contextLimit: null,
        reasoning: null,
        providerId: model.providerId,
      }));
    } catch (error) {
      logger.error(`[AIBuddy] list-models-via-api failed: ${error}`);
      return [];
    }
  });
}
