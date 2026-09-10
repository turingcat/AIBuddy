import fs from 'node:fs';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import log from './logger';
import { ensureWinShims } from './winShims';

vi.mock('./logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ensureWinShims', () => {
  const originalPlatform = process.platform;
  const originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  const originalLocalAppData = process.env.LOCALAPPDATA;
  const originalPath = process.env.PATH;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    Object.defineProperty(process, 'resourcesPath', {
      value: 'C:\\Program Files\\AIBuddy\\resources',
      configurable: true,
    });
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    process.env.PATH = 'C:\\Windows\\System32';
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'copyFile').mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    if (originalResourcesPath) {
      Object.defineProperty(process, 'resourcesPath', originalResourcesPath);
    } else {
      Reflect.deleteProperty(process, 'resourcesPath');
    }
    if (originalLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = originalLocalAppData;
    }
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    vi.restoreAllMocks();
  });

  it('installs shims in the AIBuddy runtime directory', async () => {
    await ensureWinShims();

    const targetDirectory = 'C:\\Users\\test\\AppData\\Local/AIBuddy/bin';
    expect(fs.promises.mkdir).toHaveBeenCalledWith(targetDirectory, { recursive: true });
    expect(fs.promises.copyFile).toHaveBeenCalledWith(
      'C:\\Program Files\\AIBuddy\\resources/bin/uvx.exe',
      `${targetDirectory}/uvx.exe`
    );
    expect(process.env.PATH).toBe(`${targetDirectory}:C:\\Windows\\System32`);
    expect(log.info).toHaveBeenCalledWith(
      `Added ${targetDirectory} to PATH for AIBuddy processes only`
    );
  });

  it('does nothing outside Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    await ensureWinShims();

    expect(fs.promises.mkdir).not.toHaveBeenCalled();
  });

  it('moves an existing AIBuddy shim directory to the front of PATH', async () => {
    process.env.LOCALAPPDATA = '/local';
    const targetDirectory = '/local/AIBuddy/bin';
    process.env.PATH = `/system:${targetDirectory}:/tools`;

    await ensureWinShims();

    expect(process.env.PATH).toBe(`${targetDirectory}:/system:/tools`);
    expect(log.info).toHaveBeenCalledWith(
      `Moved ${targetDirectory} to beginning of PATH for AIBuddy processes only`
    );
  });

  it('keeps an AIBuddy shim directory already at the front of PATH', async () => {
    process.env.LOCALAPPDATA = '/local';
    const targetDirectory = '/local/AIBuddy/bin';
    process.env.PATH = `${targetDirectory}:/system`;

    await ensureWinShims();

    expect(process.env.PATH).toBe(`${targetDirectory}:/system`);
    expect(log.info).not.toHaveBeenCalledWith(expect.stringContaining('Moved'));
  });

  it('uses the Windows local app-data fallback', async () => {
    delete process.env.LOCALAPPDATA;
    vi.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\fallback');

    await ensureWinShims();

    expect(fs.promises.mkdir).toHaveBeenCalledWith(
      'C:\\Users\\fallback/AppData/Local/AIBuddy/bin',
      { recursive: true }
    );
  });

  it('reports an unavailable bundled shim and continues copying the others', async () => {
    vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('missing uvx'));

    await ensureWinShims();

    expect(fs.promises.copyFile).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith('Failed to copy shim uvx.exe', expect.any(Error));
  });

  it('reports setup failures without changing PATH', async () => {
    vi.mocked(fs.promises.mkdir).mockRejectedValueOnce(new Error('permission denied'));
    const originalTestPath = process.env.PATH;

    await ensureWinShims();

    expect(process.env.PATH).toBe(originalTestPath);
    expect(log.error).toHaveBeenCalledWith('Failed to ensure Windows shims:', expect.any(Error));
  });
});
