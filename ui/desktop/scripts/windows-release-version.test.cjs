const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveWindowsVersion } = require('./windows-release-version');

test('generates the requested Shanghai timestamp and strips a tag prefix', () => {
  assert.equal(
    resolveWindowsVersion('v1.0.6', new Date('2026-09-09T14:10:00Z')),
    '1.0.6-b09092210'
  );
  assert.equal(resolveWindowsVersion('1.0.6', new Date('2026-12-31T16:01:00Z')), '1.0.6-b01010001');
});
test('preserves a version already assigned to this build', () => {
  assert.equal(resolveWindowsVersion('1.0.6-b09092210'), '1.0.6-b09092210');
});
test('rejects unsafe or malformed versions', () => {
  for (const value of [
    '',
    '1.0',
    '1.0.6-rc.1',
    '1.0.6\n',
    '1.0.6-b13992210',
    '1.0.6-b09092410',
    '1.0.6-b09092260',
    '1.0.6"',
  ]) {
    assert.throws(() => resolveWindowsVersion(value), /version/i);
  }
});

test('CLI writes one exact README and a shared workflow output', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-version-'));
  try {
    const output = path.join(directory, 'output');
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'windows-release-version.js')],
      {
        cwd: directory,
        env: { ...process.env, INPUT_VERSION: '1.0.6-b09092210', GITHUB_OUTPUT: output },
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      fs.readFileSync(path.join(directory, 'README'), 'utf8'),
      'VERSION=V1.0.6-b09092210'
    );
    assert.equal(fs.readFileSync(output, 'utf8'), 'version=1.0.6-b09092210\n');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
