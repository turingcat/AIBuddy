import fs, { constants as fsConstants } from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopFileAccess,
  isAppRendererUrl,
  isAuthorizedFileAccessRequest,
  readSelectedRecipe,
} from './desktopFileAccess';

const tempDirectories: string[] = [];

function makeTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aibuddy-desktop-file-access-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirectories.length > 0) {
    fs.rmSync(tempDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('DesktopFileAccess', () => {
  it('reads .aibuddyhints from the bound working directory', async () => {
    const workingDirectory = makeTempDirectory();
    fs.writeFileSync(path.join(workingDirectory, '.aibuddyhints'), 'project guidance');
    const access = new DesktopFileAccess();
    await access.bindWindow(7, workingDirectory);
    const canonicalWorkingDirectory = fs.realpathSync(workingDirectory);

    await expect(access.readAIBuddyhints(7)).resolves.toEqual({
      file: 'project guidance',
      filePath: path.join(canonicalWorkingDirectory, '.aibuddyhints'),
      error: null,
      found: true,
    });
  });

  it('preserves missing-file behavior', async () => {
    const workingDirectory = makeTempDirectory();
    const access = new DesktopFileAccess();
    await access.bindWindow(7, workingDirectory);
    const canonicalWorkingDirectory = fs.realpathSync(workingDirectory);

    await expect(access.readAIBuddyhints(7)).resolves.toEqual({
      file: '',
      filePath: path.join(canonicalWorkingDirectory, '.aibuddyhints'),
      error: null,
      found: false,
    });
  });

  it('creates and updates .aibuddyhints in the bound working directory', async () => {
    const workingDirectory = makeTempDirectory();
    const access = new DesktopFileAccess();
    await access.bindWindow(7, workingDirectory);
    const filePath = path.join(fs.realpathSync(workingDirectory), '.aibuddyhints');

    await expect(access.writeAIBuddyhints(7, 'first guidance')).resolves.toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('first guidance');

    await expect(access.writeAIBuddyhints(7, 'updated guidance')).resolves.toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('updated guidance');
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a canonical working directory replaced by a symlink',
    async () => {
      const root = makeTempDirectory();
      const workingDirectory = path.join(root, 'project');
      const originalDirectory = path.join(root, 'original-project');
      const replacementDirectory = path.join(root, 'replacement-project');
      fs.mkdirSync(workingDirectory);
      fs.mkdirSync(replacementDirectory);
      fs.writeFileSync(path.join(workingDirectory, '.aibuddyhints'), 'original guidance');
      fs.writeFileSync(path.join(replacementDirectory, '.aibuddyhints'), 'replacement guidance');
      const access = new DesktopFileAccess();
      await access.bindWindow(7, workingDirectory);

      fs.renameSync(workingDirectory, originalDirectory);
      fs.symlinkSync(replacementDirectory, workingDirectory);

      const result = await access.readAIBuddyhints(7);
      await expect(access.writeAIBuddyhints(7, 'new guidance')).resolves.toBe(false);
      expect(result.found).toBe(false);
      expect(result.error).toContain('working directory changed');
      expect(fs.readFileSync(path.join(originalDirectory, '.aibuddyhints'), 'utf8')).toBe(
        'original guidance'
      );
      expect(fs.readFileSync(path.join(replacementDirectory, '.aibuddyhints'), 'utf8')).toBe(
        'replacement guidance'
      );
    }
  );

  it('rejects a canonical working directory replaced by another directory', async () => {
    const root = makeTempDirectory();
    const workingDirectory = path.join(root, 'project');
    const originalDirectory = path.join(root, 'original-project');
    fs.mkdirSync(workingDirectory);
    fs.writeFileSync(path.join(workingDirectory, '.aibuddyhints'), 'original guidance');
    const access = new DesktopFileAccess();
    await access.bindWindow(7, workingDirectory);

    fs.renameSync(workingDirectory, originalDirectory);
    fs.mkdirSync(workingDirectory);
    fs.writeFileSync(path.join(workingDirectory, '.aibuddyhints'), 'replacement guidance');

    const result = await access.readAIBuddyhints(7);
    await expect(access.writeAIBuddyhints(7, 'new guidance')).resolves.toBe(false);
    expect(result.found).toBe(false);
    expect(result.error).toContain('working directory changed');
    expect(fs.readFileSync(path.join(originalDirectory, '.aibuddyhints'), 'utf8')).toBe(
      'original guidance'
    );
    expect(fs.readFileSync(path.join(workingDirectory, '.aibuddyhints'), 'utf8')).toBe(
      'replacement guidance'
    );
  });

  it('rejects a bound working directory that was renamed away', async () => {
    const root = makeTempDirectory();
    const workingDirectory = path.join(root, 'project');
    const renamedDirectory = path.join(root, 'renamed-project');
    fs.mkdirSync(workingDirectory);
    fs.writeFileSync(path.join(workingDirectory, '.aibuddyhints'), 'original guidance');
    const access = new DesktopFileAccess();
    await access.bindWindow(7, workingDirectory);

    fs.renameSync(workingDirectory, renamedDirectory);

    const result = await access.readAIBuddyhints(7);
    await expect(access.writeAIBuddyhints(7, 'new guidance')).resolves.toBe(false);
    expect(result.found).toBe(false);
    expect(result.error).toContain('working directory changed');
    expect(fs.readFileSync(path.join(renamedDirectory, '.aibuddyhints'), 'utf8')).toBe(
      'original guidance'
    );
  });

  it.skipIf(process.platform === 'win32')(
    'rechecks the working directory before truncating an opened .aibuddyhints',
    async () => {
      const root = makeTempDirectory();
      const workingDirectory = path.join(root, 'project');
      const renamedDirectory = path.join(root, 'renamed-project');
      const filePath = path.join(workingDirectory, '.aibuddyhints');
      fs.mkdirSync(workingDirectory);
      fs.writeFileSync(filePath, 'original guidance');
      const access = new DesktopFileAccess();
      await access.bindWindow(7, workingDirectory);
      const open = fsPromises.open.bind(fsPromises);
      vi.spyOn(fsPromises, 'open').mockImplementationOnce(async (...args) => {
        fs.renameSync(workingDirectory, renamedDirectory);
        fs.mkdirSync(workingDirectory);
        fs.linkSync(
          path.join(renamedDirectory, '.aibuddyhints'),
          path.join(workingDirectory, '.aibuddyhints')
        );
        return open(...args);
      });

      await expect(access.writeAIBuddyhints(7, 'new guidance')).resolves.toBe(false);
      expect(fs.readFileSync(path.join(renamedDirectory, '.aibuddyhints'), 'utf8')).toBe(
        'original guidance'
      );
    }
  );

  it.skipIf(process.platform === 'win32')(
    'rechecks the working directory before reading an opened .aibuddyhints',
    async () => {
      const root = makeTempDirectory();
      const workingDirectory = path.join(root, 'project');
      const renamedDirectory = path.join(root, 'renamed-project');
      const filePath = path.join(workingDirectory, '.aibuddyhints');
      fs.mkdirSync(workingDirectory);
      fs.writeFileSync(filePath, 'original guidance');
      const access = new DesktopFileAccess();
      await access.bindWindow(7, workingDirectory);
      const open = fsPromises.open.bind(fsPromises);
      vi.spyOn(fsPromises, 'open').mockImplementationOnce(async (...args) => {
        fs.renameSync(workingDirectory, renamedDirectory);
        fs.mkdirSync(workingDirectory);
        fs.linkSync(
          path.join(renamedDirectory, '.aibuddyhints'),
          path.join(workingDirectory, '.aibuddyhints')
        );
        return open(...args);
      });

      const result = await access.readAIBuddyhints(7);

      expect(result.found).toBe(false);
      expect(result.file).toBe('');
      expect(result.error).toContain('working directory changed');
    }
  );

  it('rechecks the working directory before creating a missing .aibuddyhints', async () => {
    const root = makeTempDirectory();
    const workingDirectory = path.join(root, 'project');
    const renamedDirectory = path.join(root, 'renamed-project');
    fs.mkdirSync(workingDirectory);
    const access = new DesktopFileAccess();
    await access.bindWindow(7, workingDirectory);
    const lstat = fsPromises.lstat.bind(fsPromises);
    vi.spyOn(fsPromises, 'lstat').mockImplementation(async (...args) => {
      try {
        return await lstat(...args);
      } catch (error) {
        if (path.basename(args[0].toString()) === '.aibuddyhints') {
          fs.renameSync(workingDirectory, renamedDirectory);
          fs.mkdirSync(workingDirectory);
        }
        throw error;
      }
    });
    const open = vi.spyOn(fsPromises, 'open');

    await expect(access.writeAIBuddyhints(7, 'new guidance')).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workingDirectory, '.aibuddyhints'))).toBe(false);
  });

  it('rejects a renderer without a bound working directory', async () => {
    const access = new DesktopFileAccess();

    await expect(access.readAIBuddyhints(99)).rejects.toThrow('not authorized');
    await expect(access.writeAIBuddyhints(99, 'project guidance')).rejects.toThrow('not authorized');
  });

  it.skipIf(process.platform === 'win32')(
    'blocks a .aibuddyhints symlink that escapes the working directory',
    async () => {
      const root = makeTempDirectory();
      const workingDirectory = path.join(root, 'project');
      const secretPath = path.join(root, 'secret');
      fs.mkdirSync(workingDirectory);
      fs.writeFileSync(secretPath, 'host secret');
      fs.symlinkSync('../secret', path.join(workingDirectory, '.aibuddyhints'));
      const access = new DesktopFileAccess();
      await access.bindWindow(7, workingDirectory);

      const result = await access.readAIBuddyhints(7);
      const saved = await access.writeAIBuddyhints(7, 'replacement');

      expect(result.found).toBe(false);
      expect(result.file).toBe('');
      expect(result.error).toContain('symbolic link');
      expect(saved).toBe(false);
      expect(fs.readFileSync(secretPath, 'utf8')).toBe('host secret');
    }
  );

  it('does not truncate a replacement file opened after validation', async () => {
    const workingDirectory = makeTempDirectory();
    const filePath = path.join(workingDirectory, '.aibuddyhints');
    const originalPath = path.join(workingDirectory, 'original.aibuddyhints');
    fs.writeFileSync(filePath, 'original guidance');
    const access = new DesktopFileAccess();
    await access.bindWindow(7, workingDirectory);
    const open = fsPromises.open.bind(fsPromises);
    vi.spyOn(fsPromises, 'open').mockImplementationOnce(async (...args) => {
      fs.renameSync(filePath, originalPath);
      fs.writeFileSync(filePath, 'replacement guidance');
      return open(...args);
    });

    await expect(access.writeAIBuddyhints(7, 'new guidance')).resolves.toBe(false);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('replacement guidance');
    expect(fs.readFileSync(originalPath, 'utf8')).toBe('original guidance');
  });

  it.skipIf(process.platform === 'win32')(
    'keeps a symlinked working directory pinned to its bind-time target',
    async () => {
      const root = makeTempDirectory();
      const firstProject = path.join(root, 'first-project');
      const secondProject = path.join(root, 'second-project');
      const workingDirectory = path.join(root, 'current-project');
      fs.mkdirSync(firstProject);
      fs.mkdirSync(secondProject);
      fs.writeFileSync(path.join(firstProject, '.aibuddyhints'), 'first guidance');
      fs.writeFileSync(path.join(secondProject, '.aibuddyhints'), 'second guidance');
      fs.symlinkSync(firstProject, workingDirectory);
      const access = new DesktopFileAccess();
      await access.bindWindow(7, workingDirectory);
      const canonicalFirstProject = fs.realpathSync(firstProject);

      fs.unlinkSync(workingDirectory);
      fs.symlinkSync(secondProject, workingDirectory);

      await expect(access.readAIBuddyhints(7)).resolves.toEqual({
        file: 'first guidance',
        filePath: path.join(canonicalFirstProject, '.aibuddyhints'),
        error: null,
        found: true,
      });
      await expect(access.writeAIBuddyhints(7, 'updated first guidance')).resolves.toBe(true);
      expect(fs.readFileSync(path.join(firstProject, '.aibuddyhints'), 'utf8')).toBe(
        'updated first guidance'
      );
      expect(fs.readFileSync(path.join(secondProject, '.aibuddyhints'), 'utf8')).toBe(
        'second guidance'
      );
    }
  );

  it.skipIf(process.platform === 'win32')(
    'rejects a non-regular .aibuddyhints target without blocking',
    async () => {
      const workingDirectory = makeTempDirectory();
      execFileSync('mkfifo', [path.join(workingDirectory, '.aibuddyhints')]);
      const access = new DesktopFileAccess();
      await access.bindWindow(7, workingDirectory);

      await expect(access.writeAIBuddyhints(7, 'project guidance')).resolves.toBe(false);
    }
  );
});

describe('renderer provenance', () => {
  const devServerUrl = new URL('http://127.0.0.1:5173/');

  it('accepts legitimate hash-routed app URLs', () => {
    expect(isAppRendererUrl('http://127.0.0.1:5173/#/settings', devServerUrl)).toBe(true);
    expect(isAppRendererUrl('http://127.0.0.1:5173/#/schedules?tab=active', devServerUrl)).toBe(
      true
    );
    expect(
      isAppRendererUrl(
        'file:///Applications/AIBuddy.app/Contents/Resources/renderer/main_window/index.html#/settings',
        new URL('file:///Applications/AIBuddy.app/Contents/Resources/renderer/main_window/index.html')
      )
    ).toBe(true);
  });

  it('rejects sibling paths, foreign origins, and malformed URLs', () => {
    expect(isAppRendererUrl('http://127.0.0.1:5173/admin#/settings', devServerUrl)).toBe(false);
    expect(isAppRendererUrl('http://localhost:5173/#/settings', devServerUrl)).toBe(false);
    expect(isAppRendererUrl('https://attacker.example/#/settings', devServerUrl)).toBe(false);
    expect(
      isAppRendererUrl(
        'file://attacker/Applications/AIBuddy.app/Contents/Resources/renderer/main_window/index.html',
        new URL('file:///Applications/AIBuddy.app/Contents/Resources/renderer/main_window/index.html')
      )
    ).toBe(false);
    expect(isAppRendererUrl('not a URL', devServerUrl)).toBe(false);
  });

  it('requires a registered top-level AIBuddy window', () => {
    const legitimateRequest = {
      isRegisteredWindow: true,
      isMainFrame: true,
      rendererUrl: 'http://127.0.0.1:5173/#/settings',
    };

    expect(isAuthorizedFileAccessRequest(legitimateRequest, devServerUrl)).toBe(true);
    expect(
      isAuthorizedFileAccessRequest(
        { ...legitimateRequest, isRegisteredWindow: false },
        devServerUrl
      )
    ).toBe(false);
    expect(
      isAuthorizedFileAccessRequest({ ...legitimateRequest, isMainFrame: false }, devServerUrl)
    ).toBe(false);
  });
});

describe('readSelectedRecipe', () => {
  it('reads a picker-selected YAML recipe', async () => {
    const directory = makeTempDirectory();
    const recipePath = path.join(directory, 'recipe.yaml');
    fs.writeFileSync(recipePath, 'title: Daily summary');

    await expect(readSelectedRecipe(recipePath)).resolves.toEqual({
      file: 'title: Daily summary',
      filePath: recipePath,
      error: null,
      found: true,
    });
  });

  it('does not read a selected non-recipe file', async () => {
    const directory = makeTempDirectory();
    const secretPath = path.join(directory, 'secret.txt');
    fs.writeFileSync(secretPath, 'host secret');

    const result = await readSelectedRecipe(secretPath);

    expect(result.found).toBe(false);
    expect(result.file).toBe('');
    expect(result.error).toContain('YAML');
  });

  it.skipIf(process.platform === 'win32')('allows a picker-selected YAML symlink', async () => {
    const directory = makeTempDirectory();
    const targetPath = path.join(directory, 'target.yaml');
    const recipePath = path.join(directory, 'recipe.yaml');
    fs.writeFileSync(targetPath, 'title: Linked recipe');
    fs.symlinkSync(targetPath, recipePath);

    await expect(readSelectedRecipe(recipePath)).resolves.toEqual({
      file: 'title: Linked recipe',
      filePath: recipePath,
      error: null,
      found: true,
    });
  });

  it.skipIf(process.platform === 'win32')(
    'reads from the opened recipe when a selected symlink is retargeted',
    async () => {
      const directory = makeTempDirectory();
      const firstTarget = path.join(directory, 'first.yaml');
      const secondTarget = path.join(directory, 'second.yaml');
      const recipePath = path.join(directory, 'recipe.yaml');
      fs.writeFileSync(firstTarget, 'title: First recipe');
      fs.writeFileSync(secondTarget, 'title: Second recipe');
      fs.symlinkSync(firstTarget, recipePath);
      const open = fsPromises.open.bind(fsPromises);
      const openSpy = vi.spyOn(fsPromises, 'open').mockImplementationOnce(async (...args) => {
        const handle = await open(...args);
        fs.unlinkSync(recipePath);
        fs.symlinkSync(secondTarget, recipePath);
        return handle;
      });

      await expect(readSelectedRecipe(recipePath)).resolves.toEqual({
        file: 'title: First recipe',
        filePath: recipePath,
        error: null,
        found: true,
      });
      expect(openSpy).toHaveBeenCalledOnce();
    }
  );

  it.skipIf(process.platform === 'win32')(
    'rejects a picker-selected FIFO without blocking',
    async () => {
      const directory = makeTempDirectory();
      const recipePath = path.join(directory, 'recipe.yaml');
      execFileSync('mkfifo', [recipePath]);
      const openSpy = vi.spyOn(fsPromises, 'open');

      const result = await readSelectedRecipe(recipePath);

      expect(result.found).toBe(false);
      expect(result.error).toContain('not a regular file');
      expect(openSpy).toHaveBeenCalledWith(
        recipePath,
        fsConstants.O_RDONLY | fsConstants.O_NONBLOCK
      );
    }
  );
});
