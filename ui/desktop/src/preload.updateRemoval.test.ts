import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (...args: unknown[]) => exposeInMainWorld(...args),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    sendSync: vi.fn(() => ''),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

async function exposedElectronApi(): Promise<Record<string, unknown>> {
  exposeInMainWorld.mockClear();
  vi.resetModules();
  await import('./preload');
  const call = exposeInMainWorld.mock.calls.find(([name]) => name === 'electron');
  if (!call) throw new Error('preload never exposed the electron API');
  return call[1] as Record<string, unknown>;
}

// The app ships no updater: the renderer must not be able to reach one, or a
// settings screen could offer an update path that silently does nothing.
describe('preload electron API', () => {
  beforeEach(() => {
    process.argv = [...process.argv, '{}'];
  });

  it.each([
    'checkForUpdates',
    'downloadUpdate',
    'installUpdate',
    'onUpdaterEvent',
    'getUpdateState',
    'isUsingGitHubFallback',
    'getAutoDownloadDisabled',
  ])('does not expose %s', async (method) => {
    expect(await exposedElectronApi()).not.toHaveProperty(method);
  });

  it('still exposes the installed version', async () => {
    expect(await exposedElectronApi()).toHaveProperty('getVersion');
  });
});
