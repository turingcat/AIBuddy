import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('preload file access boundary', () => {
  it('uses the Electron 22 File.path API when webUtils is unavailable', async () => {
    const exposed: Record<string, any> = {};
    vi.doMock('electron', () => ({
      default: {},
      contextBridge: {
        exposeInMainWorld: (name: string, value: unknown) => {
          exposed[name] = value;
        },
      },
      ipcRenderer: { on: vi.fn(), send: vi.fn(), invoke: vi.fn() },
      webUtils: undefined,
    }));
    await import('./preload');
    expect(exposed.electron.getPathForFile({ path: 'C:\\files\\notes.txt' })).toBe(
      'C:\\files\\notes.txt'
    );
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it('exposes only narrow file operations without renderer-supplied paths', async () => {
    const exposed: Record<string, unknown> = {};
    const invoke = vi.fn();
    vi.doMock('electron', () => ({
      default: {},
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: {
        emit: vi.fn(),
        invoke,
        off: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
        send: vi.fn(),
        sendSync: vi.fn(),
      },
      webUtils: { getPathForFile: vi.fn() },
    }));

    await import('./preload');

    const electron = exposed.electron as Record<string, (...args: unknown[]) => unknown>;
    expect(electron).not.toHaveProperty('readFile');

    electron.selectRecipeFile('/etc/passwd');
    electron.readAIBuddyhints('../secret');
    electron.writeAIBuddyhints('project guidance', '../secret');

    expect(invoke).toHaveBeenNthCalledWith(1, 'select-recipe-file');
    expect(invoke).toHaveBeenNthCalledWith(2, 'read-aibuddyhints');
    expect(invoke).toHaveBeenNthCalledWith(3, 'write-aibuddyhints', 'project guidance');
  });
});
