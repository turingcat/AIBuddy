import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logout } from './logout';

const clearLoginCredentials = vi.fn();
const restartApp = vi.fn();

describe('logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      window as unknown as {
        electron: {
          clearLoginCredentials: typeof clearLoginCredentials;
          restartApp: typeof restartApp;
        };
      }
    ).electron = { clearLoginCredentials, restartApp };
  });

  it('clears credentials and restarts after logout is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await logout();

    expect(clearLoginCredentials).toHaveBeenCalledTimes(1);
    expect(restartApp).toHaveBeenCalledTimes(1);
  });

  it('does not clear credentials when logout is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await logout();

    expect(clearLoginCredentials).not.toHaveBeenCalled();
    expect(restartApp).not.toHaveBeenCalled();
  });
});
