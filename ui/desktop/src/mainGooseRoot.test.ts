import { describe, expect, it, vi } from 'vitest';

describe('main embedded Goose root', () => {
  it('passes the AIBuddy-owned Goose root from main to the embedded backend', async () => {
    vi.resetModules();
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
    const originalResourcesPath = process.resourcesPath;
    Object.defineProperty(process, 'resourcesPath', { configurable: true, value: '/tmp' });

    let resolveReady: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const buildEnv = vi.fn((_credentials, goosePathRoot: string) => ({
      GOOSE_PATH_ROOT: goosePathRoot,
    }));
    const cleanup = vi.fn(async () => undefined);
    const start = vi.fn(async () => ({
      certFingerprint: null,
      cleanup,
      workingDir: '/tmp',
    }));
    const mockedSession = {
      fromPartition: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      setProxy: vi.fn(async () => undefined),
      webRequest: {
        onBeforeSendHeaders: vi.fn(),
        onHeadersReceived: vi.fn(),
      },
    };
    mockedSession.fromPartition.mockReturnValue(mockedSession);
    const app = {
      commandLine: { appendSwitch: vi.fn() },
      dock: { hide: vi.fn(), setMenu: vi.fn() },
      getPath: vi.fn((name: string) =>
        name === 'userData' ? '/tmp/Application Support/AIBuddy' : '/tmp'
      ),
      getSystemLocale: vi.fn(() => 'en-US'),
      getVersion: vi.fn(() => 'test'),
      isPackaged: false,
      isReady: vi.fn(() => true),
      on: vi.fn(),
      quit: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      setName: vi.fn(),
      whenReady: vi.fn(() => ready),
    };
    const menu = { append: vi.fn(), items: [] };
    class MenuItem {
      constructor(options: Record<string, unknown>) {
        Object.assign(this, options);
      }
    }
    class Menu {
      static buildFromTemplate = vi.fn(() => menu);
      static getApplicationMenu = vi.fn(() => menu);
      static setApplicationMenu = vi.fn();
    }

    vi.doMock('electron', () => ({
      app,
      BrowserWindow: {
        fromWebContents: vi.fn(),
        getAllWindows: vi.fn(() => []),
        getFocusedWindow: vi.fn(() => null),
      },
      dialog: {
        showErrorBox: vi.fn(),
        showMessageBoxSync: vi.fn(() => 1),
      },
      globalShortcut: { register: vi.fn(), unregisterAll: vi.fn() },
      ipcMain: { handle: vi.fn(), on: vi.fn() },
      Menu,
      MenuItem,
      net: { fetch: vi.fn() },
      Notification: class {},
      powerMonitor: { on: vi.fn() },
      powerSaveBlocker: { stop: vi.fn() },
      screen: { getPrimaryDisplay: vi.fn() },
      session: {
        defaultSession: mockedSession,
        fromPartition: mockedSession.fromPartition,
      },
      shell: { openPath: vi.fn() },
      Tray: class {},
    }));
    vi.doMock('./backendCertificateVerifier', () => ({
      installBackendCertificateVerifiers: vi.fn(),
    }));
    vi.doMock('./credentials', () => ({
      clearCredentials: vi.fn(),
      readCredentials: vi.fn(() => null),
      writeCredentials: vi.fn(),
    }));
    vi.doMock('./credentialsCrypto', () => ({
      getCredentialsCodec: vi.fn(() => ({ decrypt: vi.fn(), encrypt: vi.fn() })),
    }));
    vi.doMock('./gooseServeEnv', () => ({ buildGooseServeEnv: buildEnv }));
    vi.doMock('./gooseServe', () => ({ startGooseServe: start }));
    vi.doMock('./loginShellPath', () => ({ getLoginShellPath: vi.fn(async () => null) }));
    vi.doMock('./utils/winShims', () => ({ ensureWinShims: vi.fn(async () => undefined) }));
    vi.doMock('./utils/settings', () => ({
      defaultSettings: {
        enableNotifications: true,
        enableWakelock: false,
        externalGoosed: { enabled: false, secret: '', url: '' },
        keyboardShortcuts: {},
        language: 'system',
        recentModels: [],
        responseStyle: 'concise',
        seenAnnouncementIds: [],
        showDockIcon: true,
        showMenuBarIcon: false,
        spellcheckEnabled: true,
        theme: 'light',
        useSystemTheme: true,
      },
      getKeyboardShortcuts: vi.fn(() => ({})),
    }));
    vi.doMock('electron-window-state', () => ({
      default: vi.fn(() => ({ manage: vi.fn() })),
    }));
    vi.doMock('electron-squirrel-startup', () => ({ default: false }));

    try {
      await import('./main');
      expect(app.whenReady).toHaveBeenCalled();
      resolveReady!();

      await vi.waitFor(() => {
        expect(start).toHaveBeenCalledOnce();
      });

      const expectedRoot = '/tmp/Application Support/AIBuddy/goose';
      expect(buildEnv).toHaveBeenCalledWith(null, expectedRoot);
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ GOOSE_PATH_ROOT: expectedRoot }),
        })
      );
    } finally {
      vi.doUnmock('./backendCertificateVerifier');
      vi.doUnmock('./credentials');
      vi.doUnmock('./credentialsCrypto');
      vi.doUnmock('./gooseServeEnv');
      vi.doUnmock('./gooseServe');
      vi.doUnmock('./loginShellPath');
      vi.doUnmock('./utils/winShims');
      vi.doUnmock('./utils/settings');
      vi.doUnmock('electron-window-state');
      vi.doUnmock('electron-squirrel-startup');
      vi.doUnmock('electron');
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: originalResourcesPath,
      });
    }
  });
});
