import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rebrand-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'));
  for (const name of ['cli.mjs', 'package.json', 'package-lock.json', 'production-policy.json', 'text-policy.json', 'map.json', 'map.schema.json', 'src/adapter.mjs', 'rust-parser/Cargo.toml', 'rust-parser/Cargo.lock', 'rust-parser/src/main.rs']) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), name);
  }
  return root;
}

test('tool identity pins implementation, policy, dependencies and input mode', async (t) => {
  const { toolIdentity } = await import('../src/tool-identity.mjs');
  const root = await fixture(t);
  const original = await toolIdentity('product', root);
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.equal(await toolIdentity('product', root), original);
  assert.notEqual(await toolIdentity('upstream', root), original);
  for (const file of ['src/adapter.mjs', 'production-policy.json', 'package-lock.json', 'map.json', 'map.schema.json', 'text-policy.json', 'rust-parser/Cargo.lock', 'rust-parser/src/main.rs']) {
    const before = await toolIdentity('product', root);
    await writeFile(join(root, file), 'changed');
    assert.notEqual(await toolIdentity('product', root), before);
  }
});

test('tool identity refuses incomplete or symlinked inputs and invalid mode', async (t) => {
  const { toolIdentity } = await import('../src/tool-identity.mjs');
  const root = await fixture(t);
  await assert.rejects(toolIdentity('other', root), /input/);
  await rm(join(root, 'package-lock.json'));
  await assert.rejects(toolIdentity('product', root), /ENOENT/);
  await symlink(join(root, 'package.json'), join(root, 'package-lock.json'));
  await assert.rejects(toolIdentity('product', root), /symlink/);
});
