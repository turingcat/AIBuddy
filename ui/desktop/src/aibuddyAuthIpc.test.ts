import type { IpcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authenticateAIBuddy,
  completeAIBuddyAuthentication,
  fetchSub2apiPublicSettings,
  type FetchLike,
} from './sub2apiAuth';
import { registerAIBuddyAuthIpc } from './aibuddyAuthIpc';

vi.mock('./sub2apiAuth', () => ({
  authenticateAIBuddy: vi.fn(),
  completeAIBuddyAuthentication: vi.fn(),
  fetchSub2apiPublicSettings: vi.fn(),
}));

type Handler = (event: unknown, ...args: string[]) => unknown;

describe('registerAIBuddyAuthIpc', () => {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
  };
  const fetchImpl = vi.fn() as unknown as FetchLike;
  const idempotencyKeyFactory = vi.fn(() => 'idempotency-key');

  beforeEach(() => {
    handlers.clear();
    ipcMain.handle.mockClear();
    vi.mocked(authenticateAIBuddy).mockReset();
    vi.mocked(completeAIBuddyAuthentication).mockReset();
    vi.mocked(fetchSub2apiPublicSettings).mockReset();

    registerAIBuddyAuthIpc(ipcMain as unknown as Pick<IpcMain, 'handle'>, {
      apiBaseUrl: 'https://tflow.online',
      fetchImpl,
      idempotencyKeyFactory,
    });
  });

  it('registers the three fixed AIBuddy authentication channels', () => {
    expect(ipcMain.handle.mock.calls.map(([channel]) => channel)).toEqual([
      'get-aibuddy-auth-settings',
      'login-via-aibuddy',
      'complete-aibuddy-2fa',
    ]);
  });

  it('passes the configured base URL and main-process fetch to settings', async () => {
    const result = { ok: false as const, message: 'settings unavailable' };
    vi.mocked(fetchSub2apiPublicSettings).mockResolvedValue(result);

    await expect(handlers.get('get-aibuddy-auth-settings')!({})).resolves.toEqual(result);
    expect(fetchSub2apiPublicSettings).toHaveBeenCalledWith('https://tflow.online', fetchImpl);
  });

  it('passes login parameters and the idempotency key factory to authentication', async () => {
    const result = { ok: false as const, message: 'login unavailable' };
    vi.mocked(authenticateAIBuddy).mockResolvedValue(result);

    await expect(
      handlers.get('login-via-aibuddy')!({}, 'user@example.com', 'password', 'captcha-proof')
    ).resolves.toEqual(result);
    expect(authenticateAIBuddy).toHaveBeenCalledWith(
      'https://tflow.online',
      'user@example.com',
      'password',
      'captcha-proof',
      fetchImpl,
      idempotencyKeyFactory
    );
  });

  it('passes TOTP parameters and the idempotency key factory to completion', async () => {
    const result = { ok: false as const, message: 'TOTP unavailable' };
    vi.mocked(completeAIBuddyAuthentication).mockResolvedValue(result);

    await expect(
      handlers.get('complete-aibuddy-2fa')!({}, 'temporary-token', '123456')
    ).resolves.toEqual(result);
    expect(completeAIBuddyAuthentication).toHaveBeenCalledWith(
      'https://tflow.online',
      'temporary-token',
      '123456',
      fetchImpl,
      idempotencyKeyFactory
    );
  });
});
