import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDITIONS = new Set(['2015', '2018', '2021', '2024']);
const MAX_BUFFER = 64 * 1024 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function casefoldPath(path) {
  return path.toLowerCase();
}

function assertSafePath(path, label) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    path.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new TypeError(`${label} must be a safe relative path: ${JSON.stringify(path)}`);
  }
}

function validateEntries(entries) {
  if (!Array.isArray(entries)) throw new TypeError('entries must be an array');

  const exactPaths = new Set();
  const foldedPaths = new Map();
  const normalized = entries.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new TypeError(`entries[${index}] must be an object`);
    }
    assertSafePath(entry.path, `entries[${index}].path`);
    if (typeof entry.mode !== 'string') {
      throw new TypeError(`entries[${index}].mode must be a string`);
    }
    if (!Buffer.isBuffer(entry.content)) {
      throw new TypeError(`entries[${index}].content must be a Buffer`);
    }
    if (exactPaths.has(entry.path)) {
      throw new TypeError(`entries contain a path collision: ${entry.path}`);
    }
    exactPaths.add(entry.path);

    const foldedPath = casefoldPath(entry.path);
    const previousPath = foldedPaths.get(foldedPath);
    if (previousPath !== undefined && previousPath !== entry.path) {
      throw new TypeError(`entries contain a case-insensitive path collision: ${previousPath} and ${entry.path}`);
    }
    foldedPaths.set(foldedPath, entry.path);

    return {
      path: entry.path,
      mode: entry.mode,
      content: Buffer.from(entry.content),
    };
  });

  for (const entry of normalized) {
    const components = casefoldPath(entry.path).split('/');
    for (let length = 1; length < components.length; length += 1) {
      const prefix = components.slice(0, length).join('/');
      const prefixPath = foldedPaths.get(prefix);
      if (prefixPath !== undefined) {
        throw new TypeError(`entries contain a file-directory path collision: ${prefixPath} and ${entry.path}`);
      }
    }
  }

  return normalized;
}

function validateSelection(paths, entries) {
  if (paths === undefined) throw new TypeError('options.paths is required');
  if (!Array.isArray(paths) && !(paths instanceof Set)) {
    throw new TypeError('options.paths must be an array or Set');
  }

  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const exactPaths = new Set();
  const foldedPaths = new Map();
  const selectedPaths = [];

  for (const path of paths) {
    assertSafePath(path, 'options.paths entry');
    if (!path.endsWith('.rs')) {
      throw new TypeError(`selected path must be a .rs file: ${path}`);
    }
    if (exactPaths.has(path)) {
      throw new TypeError(`options.paths contain a path collision: ${path}`);
    }
    exactPaths.add(path);

    const foldedPath = casefoldPath(path);
    const previousPath = foldedPaths.get(foldedPath);
    if (previousPath !== undefined && previousPath !== path) {
      throw new TypeError(`options.paths contain a case-insensitive path collision: ${previousPath} and ${path}`);
    }
    foldedPaths.set(foldedPath, path);

    const entry = entriesByPath.get(path);
    if (entry === undefined) throw new TypeError(`options.paths contains an unknown path: ${path}`);
    if (entry.mode === '120000') throw new TypeError(`selected Rust path is a symlink: ${path}`);
    try {
      UTF8_DECODER.decode(entry.content);
    } catch (error) {
      throw new TypeError(`selected Rust path is not valid UTF-8 text: ${path}: ${error.message}`);
    }
    selectedPaths.push(path);
  }

  return selectedPaths.sort(comparePaths);
}

function isolatedEnvironment(directory) {
  const environment = { ...process.env };
  delete environment.RUSTFMT_CONFIG_PATH;
  delete environment.RUSTFMT_CONFIG;
  if (environment.ACTIVE_HERMIT) {
    const userHome = environment.HERMIT_USER_HOME || environment.HOME;
    if (userHome) {
      environment.HERMIT_STATE_DIR ||=
        process.platform === 'darwin'
          ? join(userHome, 'Library', 'Caches', 'hermit')
          : join(environment.XDG_CACHE_HOME || join(userHome, '.cache'), 'hermit');
      environment.RUSTUP_HOME ||= join(userHome, '.rustup');
    }
    if (!environment.RUSTUP_TOOLCHAIN) {
      const activeToolchain = spawnSync('rustup', ['show', 'active-toolchain'], {
        cwd: environment.ACTIVE_HERMIT,
        env: process.env,
        encoding: 'utf8',
        maxBuffer: MAX_BUFFER,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (activeToolchain.status === 0 && activeToolchain.signal === null) {
        environment.RUSTUP_TOOLCHAIN = activeToolchain.stdout.trim().split(/\s+/u)[0];
      }
    }
  }
  environment.HOME = directory;
  environment.USERPROFILE = directory;
  environment.XDG_CONFIG_HOME = directory;
  return environment;
}

function invokeRustfmt(args, input, directory, environment, path) {
  const result = spawnSync('rustfmt', args, {
    cwd: directory,
    env: environment,
    encoding: null,
    input,
    maxBuffer: MAX_BUFFER,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) throw new Error(`rustfmt invocation failed for ${path}: ${result.error.message}`);
  if (result.status !== 0 || result.signal !== null) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8').trim() : '';
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8').trim() : '';
    const details = stderr || stdout || `exit status ${result.status ?? 'unknown'}`;
    throw new Error(`rustfmt failed for ${path}: ${details}`);
  }
  if (Buffer.isBuffer(result.stderr) && result.stderr.length > 0) {
    throw new Error(`rustfmt reported an error for ${path}: ${result.stderr.toString('utf8').trim()}`);
  }
  if (!Buffer.isBuffer(result.stdout)) throw new Error(`rustfmt returned no stdout for ${path}`);
  return Buffer.from(result.stdout);
}

function rustfmtVersion(directory, environment) {
  const result = spawnSync('rustfmt', ['--version'], {
    cwd: directory,
    env: environment,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) throw new Error(`rustfmt --version failed: ${result.error.message}`);
  if (result.status !== 0 || result.signal !== null) {
    const details = result.stderr?.trim() || result.stdout?.trim() || `exit status ${result.status ?? 'unknown'}`;
    throw new Error(`rustfmt --version failed: ${details}`);
  }
  if (result.stderr?.length > 0) throw new Error(`rustfmt --version reported an error: ${result.stderr.trim()}`);
  const version = result.stdout?.trim();
  if (!version) throw new Error('rustfmt --version returned no version');
  return version;
}

export function formatSnapshot(entries, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  const edition = options.edition === undefined ? '2021' : options.edition;
  if (typeof edition !== 'string' || !EDITIONS.has(edition)) {
    throw new TypeError(`invalid Rust edition: ${edition}`);
  }

  const normalizedEntries = validateEntries(entries);
  const selectedPaths = validateSelection(options.paths, normalizedEntries);
  const entriesByPath = new Map(normalizedEntries.map((entry) => [entry.path, entry]));
  const rustfmtArgs = [
    '--emit',
    'stdout',
    '--edition',
    edition,
    '--config',
    'skip_children=true',
  ];
  const workingDirectory = mkdtempSync(join(tmpdir(), 'aibuddy-rustfmt-'));

  try {
    const environment = isolatedEnvironment(workingDirectory);
    const version = rustfmtVersion(workingDirectory, environment);
    const outputEntries = normalizedEntries.map((entry) => ({
      path: entry.path,
      mode: entry.mode,
      content: Buffer.from(entry.content),
    }));
    const fileReports = [];

    for (const path of selectedPaths) {
      const input = entriesByPath.get(path).content;
      const output = invokeRustfmt(rustfmtArgs, input, workingDirectory, environment, path);
      const changed = !input.equals(output);
      const outputEntry = outputEntries.find((entry) => entry.path === path);
      outputEntry.content = output;
      fileReports.push({
        path,
        beforeDigest: digest(input),
        afterDigest: digest(output),
        formattingChangeCount: changed ? 1 : 0,
      });
    }

    return {
      entries: outputEntries,
      report: {
        formatter: 'rustfmt',
        rustfmtVersion: version,
        edition,
        command: ['rustfmt', ...rustfmtArgs],
        config: {
          source: 'rustfmt defaults',
          cwd: 'isolated temporary directory',
          userConfig: 'disabled',
        },
        offsetBasis: 'pre-format',
        digestAlgorithm: 'sha256',
        selectedPaths,
        files: fileReports,
        formattingChangeCount: fileReports.reduce(
          (count, file) => count + file.formattingChangeCount,
          0,
        ),
      },
    };
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
}
