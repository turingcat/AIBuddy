import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SUPPORTED_PLATFORMS = new Set(['darwin', 'linux', 'win32']);

function compileHelper(root) {
  const helperDirectory = mkdtempSync(join(root, 'native-publish-build-'));
  const binaryName = process.platform === 'win32' ? 'native-publish.exe' : 'native-publish';
  const binaryPath = join(helperDirectory, binaryName);
  const sourcePath = fileURLToPath(new URL('../src/native-publish.rs', import.meta.url));
  execFileSync('rustc', ['--edition=2021', sourcePath, '-o', binaryPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return binaryPath;
}

test('native publication is atomic and refuses to replace an existing destination', {
  skip: !SUPPORTED_PLATFORMS.has(process.platform),
}, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-native-publish-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));

  const binaryPath = compileHelper(root);
  const stage = join(root, 'stage');
  const destination = join(root, 'destination');
  mkdirSync(stage);
  writeFileSync(join(stage, 'payload.txt'), 'staged payload\n');
  mkdirSync(destination);

  const refused = spawnSync(binaryPath, [stage, destination], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.notEqual(refused.status, 0, refused.stderr);
  assert.deepEqual(readdirSync(destination), []);
  assert.equal(readFileSync(join(stage, 'payload.txt'), 'utf8'), 'staged payload\n');

  rmSync(destination, { recursive: true });
  const published = spawnSync(binaryPath, [stage, destination], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(published.status, 0, published.stderr);
  assert.equal(readFileSync(join(destination, 'payload.txt'), 'utf8'), 'staged payload\n');
  assert.equal(existsSync(stage), false);
});
