import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeAppIdentity } from './appIdentity';

describe('initializeAppIdentity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses HeyBuddy without changing its path family', () => {
    vi.stubEnv('APP_EDITION', 'heybuddy');
    const calls: string[] = [];
    const app = {
      setName: (name: string) => calls.push(`setName:${name}`),
      getPath: (name: 'userData') => {
        calls.push(`getPath:${name}`);
        return '/tmp/Application Support/HeyBuddy';
      },
    };

    expect(initializeAppIdentity(app)).toMatchObject({
      userDataDir: '/tmp/Application Support/HeyBuddy',
      settingsFile: '/tmp/Application Support/HeyBuddy/settings.json',
      credentialsFile: '/tmp/Application Support/HeyBuddy/credentials.json',
      startupLogsDir: '/tmp/Application Support/HeyBuddy/logs/startup',
    });
    expect(calls.slice(0, 2)).toEqual(['setName:HeyBuddy', 'getPath:userData']);
  });

  it('does not resolve userData while bootstrap dependencies load', async () => {
    vi.resetModules();
    const calls: string[] = [];
    vi.doMock('electron', () => ({
      app: {
        setName: (name: string) => calls.push(`setName:${name}`),
        getPath: (name: 'userData') => {
          calls.push(`getPath:${name}`);
          return '/tmp/Application Support/HeyBuddy';
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
    vi.stubEnv('APP_EDITION', 'heybuddy');
    initialize({
      setName: (name: string) => calls.push(`setName:${name}`),
      getPath: (name: 'userData') => {
        calls.push(`getPath:${name}`);
        return '/tmp/Application Support/HeyBuddy';
      },
    });
    expect(calls.slice(0, 2)).toEqual(['setName:HeyBuddy', 'getPath:userData']);
    vi.doUnmock('electron');
  });

  it('initializes identity before evaluating the main-process entry point', async () => {
    vi.resetModules();
    vi.stubEnv('APP_EDITION', 'heybuddy');
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
    const calls: string[] = [];
    const app = new Proxy(
      {
        setName: (name: string) => calls.push(`setName:${name}`),
        getPath: (name: 'userData') => {
          calls.push(`getPath:${name}`);
          return '/tmp/Application Support/HeyBuddy';
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
    expect(calls.slice(0, 2)).toEqual(['setName:HeyBuddy', 'getPath:userData']);
    vi.doUnmock('electron');
  });
});
