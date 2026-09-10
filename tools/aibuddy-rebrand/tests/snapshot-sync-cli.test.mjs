import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSyncCommand } from '../sync.mjs';

test('sync CLI parses explicit preparation, application, recording and history arguments', () => {
  assert.deepEqual(parseSyncCommand(['prepare', '--previous', '/tmp/old', '--next', '/tmp/new', '--output', '/tmp/plan']),
    { command: 'prepare', previousSnapshot: '/tmp/old', nextSnapshot: '/tmp/new', outputDir: '/tmp/plan' });
  for (const command of ['apply', 'record']) {
    assert.deepEqual(parseSyncCommand([command, '--plan', '/tmp/plan']), { command, planDir: '/tmp/plan' });
  }
  assert.deepEqual(parseSyncCommand(['check-history', '--base', 'origin/main']), { command: 'check-history', base: 'origin/main' });
  for (const args of [[], ['--help'], ['prepare', '--help']]) assert.deepEqual(parseSyncCommand(args), { command: 'help' });
});

test('sync CLI rejects unknown, duplicate and missing parameters', () => {
  for (const args of [['merge'], ['apply'], ['prepare'], ['check-history'], ['record', '--plan'],
    ['apply', '--plan', '--help'], ['apply', '--plan', '/tmp/one', '--plan', '/tmp/two'],
    ['apply', '--plan', '/tmp/one', 'constructor', 'value'], ['check-history', '--head', 'main']]) {
    assert.throws(() => parseSyncCommand(args), Error, JSON.stringify(args));
  }
});

test('history CLI runs from a standalone copy without package dependencies', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'aibuddy-sync-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  copyFileSync(fileURLToPath(new URL('../sync.mjs', import.meta.url)), join(root, 'sync.mjs'));
  copyFileSync(fileURLToPath(new URL('../src/snapshot-sync.mjs', import.meta.url)), join(root, 'src', 'snapshot-sync.mjs'));
  const output = execFileSync(process.execPath, [join(root, 'sync.mjs'), '--help'], { encoding: 'utf8' });
  assert.match(output, /never imports upstream commit ancestry/);
  assert.match(output, /check-history --base/);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (args) => execFileSync('git', args, { cwd: root, env, stdio: 'pipe' });
  git(['init', '-q']);
  git(['-c', 'user.name=Maintainer', '-c', 'user.email=maintainer@example.invalid', '-c', `core.hooksPath=${env.GIT_CONFIG_GLOBAL}`, 'commit', '--allow-empty', '-qm', 'product']);
  const result = JSON.parse(execFileSync(process.execPath, [join(root, 'sync.mjs'), 'check-history', '--base', 'HEAD'], { cwd: root, env, encoding: 'utf8' }));
  assert.equal(result.valid, true);
  assert.equal(result.commits, 0);
});
