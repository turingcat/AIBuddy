import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initializeAppIdentity } from './appIdentity';

describe('initializeAppIdentity', () => {
  it('sets AIBuddy name before userData', () => {
    const calls: string[] = [];
    const app = {
      setName: (name: string) => calls.push(`setName:${name}`),
      getPath: (name: 'userData') => {
        calls.push(`getPath:${name}`);
        return '/tmp/Application Support/AIBuddy';
      },
    };

    expect(initializeAppIdentity(app)).toMatchObject({
      settingsFile: '/tmp/Application Support/AIBuddy/settings.json',
      credentialsFile: '/tmp/Application Support/AIBuddy/credentials.json',
      startupLogsDir: '/tmp/Application Support/AIBuddy/logs/startup',
      goosePathRoot: '/tmp/Application Support/AIBuddy/goose',
    });
    expect(calls.slice(0, 2)).toEqual(['setName:AIBuddy', 'getPath:userData']);
  });

  it('preserves the userData path returned by Electron', () => {
    const calls: string[] = [];
    const app = {
      setName: (name: string) => calls.push(`setName:${name}`),
      getPath: (name: 'userData') => {
        calls.push(`getPath:${name}`);
        return '/tmp/Application Support/ExistingData';
      },
    };

    expect(initializeAppIdentity(app)).toMatchObject({
      userDataDir: '/tmp/Application Support/ExistingData',
      startupLogsDir: '/tmp/Application Support/ExistingData/logs/startup',
      goosePathRoot: '/tmp/Application Support/ExistingData/goose',
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
    vi.stubEnv('GOOSE_PATH_ROOT', '~/shared/heybuddy');
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
    expect(process.env.GOOSE_PATH_ROOT).toBe('~/shared/heybuddy');
    vi.unstubAllEnvs();
    vi.doUnmock('electron');
  });

  it('reads startup data only from the AIBuddy userData directory', async () => {
    vi.resetModules();
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
    const calls: string[] = [];
    const userDataDir = '/tmp/Application Support/AIBuddy';
    const userDataParent = path.dirname(userDataDir);
    const siblingUserDataDir = path.join(userDataParent, 'HeyBuddy');
    const settingsFile = path.join(userDataDir, 'settings.json');
    const credentialsFile = path.join(userDataDir, 'credentials.json');
    const pathResolutions: Array<{
      operation: 'dirname' | 'join';
      inputs: string[];
      output: string;
    }> = [];
    const filesystemAccesses: Array<{ operation: string; path: string }> = [];
    const isUserDataBoundaryPath = (filePath: string) =>
      filePath === userDataDir ||
      filePath === userDataParent ||
      filePath === siblingUserDataDir ||
      filePath.startsWith(`${userDataDir}${path.sep}`) ||
      filePath.startsWith(`${siblingUserDataDir}${path.sep}`);
    const recordFilesystemAccess = (operation: string, ...filePaths: unknown[]) => {
      for (const filePath of filePaths) {
        if (typeof filePath === 'string') {
          filesystemAccesses.push({ operation, path: filePath });
        }
      }
    };
    let resolveReady: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const existsSync = fs.existsSync;
    const readFileSync = fs.readFileSync;
    const writeFileSync = fs.writeFileSync;
    const renameSync = fs.renameSync;
    const copyFileSync = fs.copyFileSync;
    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      recordFilesystemAccess('existsSync', filePath);
      if (filePath === settingsFile) calls.push('settings-read');
      return existsSync(filePath);
    });
    const readFileSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
      recordFilesystemAccess('readFileSync', args[0]);
      return Reflect.apply(readFileSync, fs, args);
    });
    const writeFileSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((...args) => {
      recordFilesystemAccess('writeFileSync', args[0]);
      return Reflect.apply(writeFileSync, fs, args);
    });
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      recordFilesystemAccess('renameSync', args[0], args[1]);
      return Reflect.apply(renameSync, fs, args);
    });
    const copyFileSpy = vi.spyOn(fs, 'copyFileSync').mockImplementation((...args) => {
      recordFilesystemAccess('copyFileSync', args[0], args[1]);
      return Reflect.apply(copyFileSync, fs, args);
    });
    vi.doMock('node:path', async (importOriginal) => {
      const actualPath = await importOriginal<typeof import('node:path')>();
      const pathApi = (actualPath as { default?: typeof path }).default ?? actualPath;
      const dirname = (filePath: string) => {
        const output = pathApi.dirname(filePath);
        if (isUserDataBoundaryPath(filePath) || isUserDataBoundaryPath(output)) {
          pathResolutions.push({ operation: 'dirname', inputs: [filePath], output });
        }
        return output;
      };
      const join = (...inputs: string[]) => {
        const output = pathApi.join(...inputs);
        if (inputs.some(isUserDataBoundaryPath) || isUserDataBoundaryPath(output)) {
          pathResolutions.push({ operation: 'join', inputs, output });
        }
        return output;
      };

      return {
        ...actualPath,
        dirname,
        join,
        default: { ...pathApi, dirname, join },
      };
    });
    const app = new Proxy(
      {
        setName: (name: string) => calls.push(`setName:${name}`),
        getPath: (name: 'userData') => {
          calls.push(`getPath:${name}`);
          return userDataDir;
        },
        isPackaged: false,
        whenReady: () => ready,
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
    try {
      await import('./main');

      resolveReady!();
      await Promise.resolve();
      await Promise.resolve();

      expect(calls.indexOf('settings-read')).toBeGreaterThan(-1);
      expect(
        [settingsFile, credentialsFile].every((filePath) =>
          filePath.startsWith(`${userDataDir}${path.sep}`)
        )
      ).toBe(true);
      expect(pathResolutions).toEqual(
        expect.arrayContaining([
          { operation: 'join', inputs: [userDataDir, 'settings.json'], output: settingsFile },
          { operation: 'join', inputs: [userDataDir, 'credentials.json'], output: credentialsFile },
        ])
      );

      const observedPaths = [
        ...pathResolutions.flatMap(({ inputs, output }) => [...inputs, output]),
        ...filesystemAccesses.map(({ path }) => path),
      ];
      expect(filesystemAccesses).toContainEqual({ operation: 'existsSync', path: settingsFile });
      expect(
        observedPaths.some(
          (filePath) =>
            filePath === siblingUserDataDir ||
            filePath.startsWith(`${siblingUserDataDir}${path.sep}`)
        )
      ).toBe(false);
    } finally {
      existsSpy.mockRestore();
      readFileSpy.mockRestore();
      writeFileSpy.mockRestore();
      renameSpy.mockRestore();
      copyFileSpy.mockRestore();
      vi.doUnmock('node:path');
      vi.doUnmock('electron');
    }
  });
});
