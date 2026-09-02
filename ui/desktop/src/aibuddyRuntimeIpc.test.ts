import { describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';
import { registerAIBuddyRuntimeIpc, type AIBuddyRuntimeIpcDependencies } from './aibuddyRuntimeIpc';
import { Sub2apiUnauthorizedError, type Sub2apiEntitlement } from './siteRuntime/sub2apiAdapter';
import type { CanonicalAIBuddyCredentials, LoginCredentials } from './credentials';
import type { FetchLike } from './balance';

type Handler = (...args: unknown[]) => unknown;

const credentials: CanonicalAIBuddyCredentials = {
  schemaVersion: 2,
  siteKind: 'sub2api',
  session: { accessToken: 'access-old', refreshToken: 'refresh-old' },
  account: { email: 'user@example.com' },
  gateway: {
    providerId: 'aibuddy',
    baseUrl: 'https://gateway.example/v1',
    apiKey: 'sk-aibuddy',
    groupId: '42',
  },
  token: 'access-old',
  refreshToken: 'refresh-old',
  baseUrl: 'https://gateway.example/v1',
  apiKey: 'sk-aibuddy',
  groupId: '42',
  authKind: 'sub2api',
};

function setup(overrides: Partial<AIBuddyRuntimeIpcDependencies> = {}) {
  const handlers = new Map<string, Handler>();
  const written: LoginCredentials[] = [];
  const errors: string[] = [];
  const fetchImpl = vi.fn() as unknown as FetchLike;
  const dependencies: AIBuddyRuntimeIpcDependencies = {
    apiBaseUrl: 'https://panel.example',
    fetchImpl,
    readCredentials: () => credentials,
    writeCredentials: (value: LoginCredentials) => {
      written.push(value);
    },
    withSession: async (
      _baseUrl: string,
      session: { accessToken: string; refreshToken?: string },
      _fetch: FetchLike,
      _onRefreshed: (session: { accessToken: string; refreshToken?: string }) => void,
      run: (accessToken: string) => Promise<Sub2apiEntitlement>
    ) => run(session.accessToken),
    fetchEntitlement: async () => ({
      kind: 'balance' as const,
      displayName: 'Ada',
      balance: 12.5,
    }),
    fetchModels: async () => [{ id: 'model-a', providerId: 'aibuddy' as const }],
    logger: { error: (message: string) => errors.push(message) },
    ...overrides,
  };

  registerAIBuddyRuntimeIpc(
    {
      handle: (channel: string, handler: Handler) => {
        handlers.set(channel, handler);
      },
    } as unknown as Pick<IpcMain, 'handle'>,
    dependencies
  );

  const invoke = async (channel: string) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Missing handler: ${channel}`);
    return handler({});
  };

  return { invoke, written, errors, fetchImpl };
}

describe('registerAIBuddyRuntimeIpc', () => {
  it('returns logged-out results without calling TFlow services', async () => {
    const fail = () => {
      throw new Error('TFlow service must not be called');
    };
    const { invoke } = setup({
      readCredentials: () => null,
      withSession: fail,
      fetchEntitlement: fail,
      fetchModels: fail,
    });

    await expect(invoke('get-user-balance')).resolves.toEqual({
      ok: false,
      kind: 'not-logged-in',
      message: '尚未登录',
    });
    await expect(invoke('list-models-via-api')).resolves.toEqual([]);
  });

  it('uses a refreshed TFlow session and persists it before returning entitlement', async () => {
    const entitlementCalls: unknown[][] = [];
    const { invoke, written, fetchImpl } = setup({
      withSession: async (
        baseUrl: string,
        session: { accessToken: string; refreshToken?: string },
        suppliedFetch: FetchLike,
        onRefreshed: (session: { accessToken: string; refreshToken?: string }) => void,
        run: (accessToken: string) => Promise<Sub2apiEntitlement>
      ) => {
        expect([baseUrl, session, suppliedFetch]).toEqual([
          'https://panel.example',
          { accessToken: 'access-old', refreshToken: 'refresh-old' },
          fetchImpl,
        ]);
        onRefreshed({ accessToken: 'access-new', refreshToken: 'refresh-new' });
        return run('access-new');
      },
      fetchEntitlement: async (...args: unknown[]) => {
        entitlementCalls.push(args);
        return { kind: 'balance' as const, displayName: 'Ada', balance: 12.5 };
      },
    });

    await expect(invoke('get-user-balance')).resolves.toEqual({
      ok: true,
      balance: {
        kind: 'balance',
        quota: 12.5,
        usedQuota: 0,
        requestCount: 0,
        userName: 'Ada',
        displayName: 'Ada',
      },
      currency: {
        quotaPerUnit: 1,
        quotaDisplayType: 'USD',
        usdExchangeRate: 1,
        customCurrencySymbol: '$',
        customCurrencyExchangeRate: 1,
      },
    });
    expect(entitlementCalls).toEqual([['https://panel.example', 'access-new', '42', fetchImpl]]);
    expect(written).toEqual([
      expect.objectContaining({
        token: 'access-new',
        refreshToken: 'refresh-new',
        session: { accessToken: 'access-new', refreshToken: 'refresh-new' },
      }),
    ]);
  });

  it('maps an expired TFlow session to an unauthorized balance result', async () => {
    const { invoke } = setup({
      withSession: async () => {
        throw new Sub2apiUnauthorizedError();
      },
    });

    await expect(invoke('get-user-balance')).resolves.toEqual({
      ok: false,
      kind: 'unauthorized',
      message: '登录已失效，请重新登录',
    });
  });

  it('lists models exclusively through the stored TFlow gateway', async () => {
    const modelCalls: unknown[][] = [];
    const { invoke, fetchImpl } = setup({
      fetchModels: async (...args: unknown[]) => {
        modelCalls.push(args);
        return [{ id: 'model-a', providerId: 'aibuddy' as const }];
      },
    });

    await expect(invoke('list-models-via-api')).resolves.toEqual([
      {
        id: 'model-a',
        name: 'model-a',
        contextLimit: null,
        reasoning: null,
        providerId: 'aibuddy',
      },
    ]);
    expect(modelCalls).toEqual([['https://gateway.example/v1', 'sk-aibuddy', fetchImpl]]);
  });

  it('returns an empty model list and logs TFlow failures', async () => {
    const { invoke, errors } = setup({
      fetchModels: async () => {
        throw new Error('gateway unavailable');
      },
    });

    await expect(invoke('list-models-via-api')).resolves.toEqual([]);
    expect(errors).toEqual(['[AIBuddy] list-models-via-api failed: Error: gateway unavailable']);
  });
});
