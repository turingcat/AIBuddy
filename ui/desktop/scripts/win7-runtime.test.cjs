const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyWin7Uv } = require('./win7-runtime');

test('accepts only both locally built binaries matching the Win7 manifest', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'win7-runtime-'));
  try {
    assert.throws(() => verifyWin7Uv(directory), /Win7/);
    const hashes = {};
    for (const name of ['uv.exe', 'uvx.exe']) {
      fs.writeFileSync(path.join(directory, name), name);
      hashes[name] = crypto.createHash('sha256').update(name).digest('hex');
    }
    const manifest = { target: 'i686-win7-windows-msvc', version: '0.11.11', hashes };
    const file = path.join(directory, 'win7-uv.json');
    fs.writeFileSync(file, JSON.stringify(manifest));
    verifyWin7Uv(directory);
    fs.writeFileSync(path.join(directory, 'uv.exe'), 'wrong binary');
    assert.throws(() => verifyWin7Uv(directory), /checksum/);
    fs.writeFileSync(file, JSON.stringify({ ...manifest, target: 'i686-pc-windows-msvc' }));
    assert.throws(() => verifyWin7Uv(directory), /target/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
