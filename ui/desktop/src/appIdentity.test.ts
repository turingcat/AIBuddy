import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeAppIdentity } from './appIdentity';

describe('initializeAppIdentity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses AIBuddy without changing its path family', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');
    const calls: string[] = [];
    const app = {
      setName: (name: string) => calls.push(`setName:${name}`),
      getPath: (name: 'userData') => {
        calls.push(`getPath:${name}`);
        return '/tmp/Application Support/AIBuddy';
      },
    };

    expect(initializeAppIdentity(app)).toMatchObject({
      userDataDir: '/tmp/Application Support/AIBuddy',
      settingsFile: '/tmp/Application Support/AIBuddy/settings.json',
      credentialsFile: '/tmp/Application Support/AIBuddy/credentials.json',
      startupLogsDir: '/tmp/Application Support/AIBuddy/logs/startup',
    });
    expect(calls.slice(0, 2)).toEqual(['setName:AIBuddy', 'getPath:userData']);
  });

  it('does not resolve userData while bootstrap dependencies load', async () => {
    vi.resetModules();
    const calls: string[] = [];
    vi.doMock('electron', () => ({
      app: {
        setName: (name: string) => calls.push(`setName:${name}`),
        getPath: (name: 'userData') => {
          calls.push(`getPath:${name}`);
          return '/tmp/Application Support/AIBuddy';
        },
      },
      ipcMain: {
        handle: () => undefined,
        on: () => undefined,
      },
      BrowserWindow: {
        getFocusedWindow: () => null,
      },
    }));

    await import('./utils/recentDirs');
    await import('./utils/logger');
    await import('./utils/recipeHash');
    expect(calls).toEqual([]);

    const { initializeAppIdentity: initialize } = await import('./appIdentity');
    vi.stubEnv('APP_EDITION', 'aibuddy');
    initialize({
      setName: (name: string) => calls.push(`setName:${name}`),
      getPath: (name: 'userData') => {
        calls.push(`getPath:${name}`);
        return '/tmp/Application Support/AIBuddy';
      },
    });
    expect(calls.slice(0, 2)).toEqual(['setName:AIBuddy', 'getPath:userData']);
    vi.doUnmock('electron');
  });

  it('initializes identity before evaluating the main-process entry point', async () => {
    vi.resetModules();
    vi.stubEnv('APP_EDITION', 'aibuddy');
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
    const calls: string[] = [];
    const app = new Proxy(
      {
        setName: (name: string) => calls.push(`setName:${name}`),
        getPath: (name: 'userData') => {
          calls.push(`getPath:${name}`);
          return '/tmp/Application Support/AIBuddy';
        },
        isPackaged: false,
        whenReady: () => Promise.resolve(),
        on: () => undefined,
        isReady: () => false,
      },
      { get: (target, property: string) => target[property as keyof typeof target] ?? vi.fn() }
    );
    vi.doMock('electron', () => ({
      app,
      ipcMain: { handle: () => undefined, on: () => undefined },
      BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
      dialog: {},
      globalShortcut: {},
      Menu: {},
      MenuItem: class {},
      net: {},
      Notification: class {},
      powerMonitor: {},
      powerSaveBlocker: {},
      screen: {},
      session: { defaultSession: {} },
      shell: {},
      Tray: class {},
    }));

    await import('./main');

    expect(calls.filter((call) => call.startsWith('getPath:'))[0]).toBe('getPath:userData');
    expect(calls.slice(0, 2)).toEqual(['setName:AIBuddy', 'getPath:userData']);
    vi.doUnmock('electron');
  });
});
