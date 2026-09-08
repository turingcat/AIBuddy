import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function isolatedGitEnvironment(environment = process.env) {
  const result = { ...environment };
  for (const key of Object.keys(result)) {
    if (key.startsWith('GIT_')) {
      delete result[key];
    }
  }
  result.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  result.GIT_CONFIG_NOSYSTEM = '1';
  result.GIT_CONFIG_SYSTEM = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return result;
}

function git(cwd, args, { environment = process.env, input } = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: isolatedGitEnvironment(environment),
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function writeFixtureFile(root, relativePath, content, mode) {
  const filePath = join(root, relativePath);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, content);
  if (mode !== undefined) {
    chmodSync(filePath, mode);
  }
}

export function createInventoryFixture({ environment = process.env, syntheticEntries = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-inventory-'));
  const runGit = (args, options = {}) => git(root, args, { ...options, environment });

  writeFixtureFile(root, 'README.md', 'Pinned Goose content\n');
  writeFixtureFile(root, '.hidden/GeEsE.md', 'A hidden GeEsE candidate\n');
  writeFixtureFile(root, 'docs/CaseVariant.txt', 'No brand in the path, but gEeSe is content\n');
  writeFixtureFile(root, 'docs/goose note\twith spaces.md', 'Whitespace Goose filename\n');
  writeFixtureFile(root, 'src/build/goose-source.rs', 'Tracked source under a nested build directory\n');
  writeFixtureFile(root, 'src/dependencies/geese-source.txt', 'Tracked source under a nested dependencies directory\n');
  writeFixtureFile(root, 'build/generated/goose-input.txt', 'Tracked build input\n');
  writeFixtureFile(root, 'dist/generated/geese-input.txt', 'Tracked dist input\n');
  writeFixtureFile(root, 'vendor/v8/goose-source.cc', 'Tracked vendor workspace source\n');
  writeFixtureFile(root, 'assets/logo.GOOSE.bin', Buffer.from([0, 0x47, 0x6f, 0x4f, 0x73, 0x45, 0xff]));
  writeFixtureFile(root, 'bin/runner', '#!/bin/sh\nexit 0\n', 0o755);
  mkdirSync(join(root, 'links'), { recursive: true });
  symlinkSync('../README.md', join(root, 'links/goose-link'));
  symlinkSync('../../outside/goose.txt', join(root, 'links/escape-goose-link'));

  writeFixtureFile(root, 'cache/goose-cache.bin', Buffer.from([0, 0x47, 0x4f, 0x4f, 0x53, 0x45]));
  writeFixtureFile(root, 'deps/geese-dependency.txt', 'dependency Goose content\n');
  writeFixtureFile(root, 'node_modules/goose/index.js', 'installed dependency\n');
  writeFixtureFile(root, '.worktrees/nested/goose.txt', 'nested worktree\n');
  writeFixtureFile(root, 'vendor/geese/vendor.txt', 'Tracked vendor source\n');
  writeFixtureFile(root, 'target/goose/debug.bin', Buffer.from([0, 1, 2, 3]));

  runGit(['init', '-q']);
  runGit(['config', 'core.ignorecase', 'false']);
  runGit(['config', 'user.email', 'inventory@example.test']);
  runGit(['config', 'user.name', 'Inventory Fixture']);
  runGit(['add', '--all']);
  for (const entry of syntheticEntries) {
    const objectId = runGit(['hash-object', '-w', '--stdin'], { input: entry.content });
    runGit([
      'update-index',
      '--add',
      '--cacheinfo',
      `${entry.mode ?? '100644'},${objectId},${entry.path}`,
    ]);
  }
  runGit(['commit', '-qm', 'fixture']);

  const commit = runGit(['rev-parse', 'HEAD']);
  const tree = runGit(['rev-parse', 'HEAD^{tree}']);

  return {
    environment: isolatedGitEnvironment(environment),
    root,
    commit,
    tree,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
