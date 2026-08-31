import type { IpcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeSub2apiTotp,
  fetchSub2apiPublicSettings,
  prepareAIBuddyProvisioning,
  provisionAIBuddyGroup,
  startSub2apiLogin,
  type FetchLike,
} from './sub2apiAuth';
import { registerAIBuddyAuthIpc } from './aibuddyAuthIpc';

vi.mock('./sub2apiAuth', () => ({
  completeSub2apiTotp: vi.fn(),
  fetchSub2apiPublicSettings: vi.fn(),
  prepareAIBuddyProvisioning: vi.fn(),
  provisionAIBuddyGroup: vi.fn(),
  startSub2apiLogin: vi.fn(),
}));

type Handler = (event: unknown, ...args: string[]) => unknown;

describe('registerAIBuddyAuthIpc', () => {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
  };
  const fetchImpl = vi.fn() as unknown as FetchLike;
  const idempotencyKeyFactory = vi.fn(() => 'idempotency-key');
  const writeCredentials = vi.fn();

  beforeEach(() => {
    handlers.clear();
    ipcMain.handle.mockClear();
    idempotencyKeyFactory.mockClear();
    writeCredentials.mockReset();
    vi.mocked(completeSub2apiTotp).mockReset();
    vi.mocked(fetchSub2apiPublicSettings).mockReset();
    vi.mocked(prepareAIBuddyProvisioning).mockReset();
    vi.mocked(provisionAIBuddyGroup).mockReset();
    vi.mocked(startSub2apiLogin).mockReset();
    registerAIBuddyAuthIpc(ipcMain as unknown as Pick<IpcMain, 'handle'>, {
      apiBaseUrl: 'https://tflow.online',
      fetchImpl,
      idempotencyKeyFactory,
      writeCredentials,
    });
  });

  it('registers the group provisioning channel alongside the login channels', () => {
    expect(ipcMain.handle.mock.calls.map(([channel]) => channel)).toEqual([
      'get-aibuddy-auth-settings',
      'login-via-aibuddy',
      'complete-aibuddy-2fa',
      'provision-aibuddy-group',
    ]);
  });

  it('returns only an opaque pending id when a group must be selected', async () => {
    const settings = { apiBaseUrl: 'https://tflow.online/v1' } as never;
    vi.mocked(fetchSub2apiPublicSettings).mockResolvedValue({ ok: true, settings });
    vi.mocked(startSub2apiLogin).mockResolvedValue({
      kind: 'authenticated',
      session: { accessToken: 'panel-jwt', refreshToken: 'panel-refresh' },
    });
    vi.mocked(prepareAIBuddyProvisioning).mockResolvedValue({
      step: 'select-group',
      groups: [{ id: 'team-a', name: 'Team A' }],
    });

    await expect(
      handlers.get('login-via-aibuddy')!({}, 'user@example.com', 'password', 'captcha-proof')
    ).resolves.toEqual({
      ok: true,
      step: 'select-group',
      pendingLoginId: expect.any(String),
      groups: [{ id: 'team-a', name: 'Team A' }],
    });
    expect(writeCredentials).not.toHaveBeenCalled();
  });

  it('persists an existing grouped key without exposing its credentials', async () => {
    const settings = { apiBaseUrl: 'https://tflow.online/v1' } as never;
    const credentials = {
      token: 'panel-jwt',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-secret',
      authKind: 'sub2api' as const,
    };
    vi.mocked(fetchSub2apiPublicSettings).mockResolvedValue({ ok: true, settings });
    vi.mocked(startSub2apiLogin).mockResolvedValue({
      kind: 'authenticated',
      session: { accessToken: 'panel-jwt', refreshToken: 'panel-refresh' },
    });
    vi.mocked(prepareAIBuddyProvisioning).mockResolvedValue({
      step: 'authenticated',
      credentials,
      firstModelId: 'first-group-model',
    });

    await expect(
      handlers.get('login-via-aibuddy')!({}, 'user@example.com', 'password', 'captcha-proof')
    ).resolves.toEqual({ ok: true, step: 'authenticated', firstModelId: 'first-group-model' });
    expect(writeCredentials).toHaveBeenCalledWith(credentials);
  });

  it('returns the settings error without attempting authentication', async () => {
    vi.mocked(fetchSub2apiPublicSettings).mockResolvedValue({
      ok: false,
      message: 'settings unavailable',
      reason: 'UNAVAILABLE',
    });

    await expect(
      handlers.get('login-via-aibuddy')!({}, 'user@example.com', 'password', 'captcha-proof')
    ).resolves.toEqual({ ok: false, message: 'settings unavailable', reason: 'UNAVAILABLE' });
    expect(startSub2apiLogin).not.toHaveBeenCalled();
  });

  it('completes TOTP with a fresh settings lookup before auto-provisioning', async () => {
    const settings = { apiBaseUrl: 'https://tflow.online/v1' } as never;
    const credentials = {
      token: 'totp-jwt',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-secret',
      authKind: 'sub2api' as const,
    };
    vi.mocked(completeSub2apiTotp).mockResolvedValue({ accessToken: 'totp-jwt' });
    vi.mocked(fetchSub2apiPublicSettings).mockResolvedValue({ ok: true, settings });
    vi.mocked(prepareAIBuddyProvisioning).mockResolvedValue({
      step: 'authenticated',
      credentials,
      firstModelId: 'totp-model',
    });

    await expect(
      handlers.get('complete-aibuddy-2fa')!({}, 'temp-token', '123456')
    ).resolves.toEqual({
      ok: true,
      step: 'authenticated',
      firstModelId: 'totp-model',
    });
    expect(completeSub2apiTotp).toHaveBeenCalledWith(
      'https://tflow.online',
      'temp-token',
      '123456',
      fetchImpl
    );
  });

  it('writes credentials in the main process after a selected group is provisioned', async () => {
    const settings = { apiBaseUrl: 'https://tflow.online/v1' } as never;
    vi.mocked(fetchSub2apiPublicSettings).mockResolvedValue({ ok: true, settings });
    vi.mocked(startSub2apiLogin).mockResolvedValue({
      kind: 'authenticated',
      session: { accessToken: 'panel-jwt', refreshToken: 'panel-refresh' },
    });
    vi.mocked(prepareAIBuddyProvisioning).mockResolvedValue({
      step: 'select-group',
      groups: [{ id: 'team-a', name: 'Team A' }],
    });
    vi.mocked(provisionAIBuddyGroup).mockResolvedValue({
      credentials: {
        token: 'panel-jwt',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-secret',
        authKind: 'sub2api',
      },
      firstModelId: 'team-model',
    });

    const selection = (await handlers.get('login-via-aibuddy')!(
      {},
      'user@example.com',
      'password',
      'captcha-proof'
    )) as { pendingLoginId: string };

    await expect(
      handlers.get('provision-aibuddy-group')!({}, selection.pendingLoginId, 'team-a')
    ).resolves.toEqual({ ok: true, step: 'authenticated', firstModelId: 'team-model' });
    expect(writeCredentials).toHaveBeenCalledWith({
      token: 'panel-jwt',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-secret',
      authKind: 'sub2api',
    });
  });

  it('rejects an expired pending login before it can create a key', async () => {
    await expect(
      handlers.get('provision-aibuddy-group')!({}, 'expired-id', 'team-a')
    ).resolves.toEqual({
      ok: false,
      message: '登录状态已过期，请重新登录',
    });
    expect(provisionAIBuddyGroup).not.toHaveBeenCalled();
  });
});
