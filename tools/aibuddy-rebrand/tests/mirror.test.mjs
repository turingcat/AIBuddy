import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generateSnapshot } from '../src/generate.mjs';
import { toolIdentity } from '../src/tool-identity.mjs';
import { transformSnapshot } from '../src/transform.mjs';
import {
  appendMirror,
  establishBridge,
  prepareMirror,
} from '../src/mirror.mjs';

const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';

function isolatedGitEnvironment() {
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) {
      environment[key] = value;
    }
  }
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: nullDevice,
    GIT_AUTHOR_EMAIL: 'mirror-test@example.invalid',
    GIT_AUTHOR_NAME: 'Mirror Test',
    GIT_COMMITTER_EMAIL: 'mirror-test@example.invalid',
    GIT_COMMITTER_NAME: 'Mirror Test',
  };
}

function git(repo, args, { allowFailure = false, input } = {}) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: isolatedGitEnvironment(),
    input,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      [`git ${args.join(' ')} exited with ${result.status}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return {
    status: result.status,
    stderr: result.stderr.trimEnd(),
    stdout: result.stdout.trimEnd(),
  };
}

function output(repo, args, options) {
  return git(repo, args, options).stdout;
}

function createRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'aibuddy-mirror-test-'));
  git(repo, [
    '-c',
    `core.hooksPath=${nullDevice}`,
    'init',
    '--quiet',
    '--initial-branch=feat/aibuddy-branding',
    '--template=',
  ]);
  git(repo, ['config', 'user.email', 'mirror-test@example.invalid']);
  git(repo, ['config', 'user.name', 'Mirror Test']);
  return repo;
}

function commit(repo, message) {
  git(repo, ['add', '--all']);
  git(repo, ['commit', '--quiet', '-m', message]);
  return output(repo, ['rev-parse', 'HEAD']);
}

function commitTree(repo, tree, parents, message) {
  const args = [
    'commit-tree',
    tree,
    ...parents.flatMap((parent) => ['-p', parent]),
    '-F',
    '-',
  ];
  return output(repo, args, { input: message });
}

function tree(repo, commitish) {
  return output(repo, ['show', '-s', '--format=%T', commitish]);
}

function parents(repo, commitish) {
  return output(repo, ['rev-list', '--parents', '-n', '1', commitish])
    .split(/\s+/)
    .slice(1);
}

function lsTree(repo, commitish) {
  const listing = output(repo, ['ls-tree', '-r', '--name-only', commitish]);
  return listing ? listing.split('\n') : [];
}

async function generateUpstreamSnapshot(repo, sourceCommit, label) {
  const outputDir = mkdtempSync(join(tmpdir(), `aibuddy-mirror-${label}-`));
  rmSync(outputDir, { recursive: true, force: true });
  await generateSnapshot({
    cwd: repo,
    outputDir,
    sourceRef: sourceCommit,
    transform: (entries) => transformSnapshot(entries, { input: 'upstream' }),
    transformIdentity: await toolIdentity('upstream'),
  });
  return outputDir;
}

function writeUpstreamSource(repo, { version, addFeature = false }) {
  writeFileSync(join(repo, 'README.md'), `Goose upstream ${version}\n`);
  writeFileSync(
    join(repo, 'src-goose.rs'),
    `pub struct Goose${version} { pub value: &'static str }\n`,
  );
  if (addFeature) {
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'goose-feature.md'), 'Goose upstream feature\n');
  }
}

function makeRepositoryWithSnapshots() {
  const repo = createRepo();
  writeUpstreamSource(repo, { version: 'v0' });
  const u0 = commit(repo, 'raw upstream U0');
  writeUpstreamSource(repo, { version: 'v1', addFeature: true });
  const u1 = commit(repo, 'raw upstream U1');
  return { repo, u0, u1 };
}

function cleanupRepository({ repo, ...rest }) {
  rmSync(repo, { recursive: true, force: true });
  for (const directory of Object.values(rest)) {
    if (typeof directory === 'string' && directory.startsWith('/tmp/aibuddy-mirror-')) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

test('prepareMirror dry-run validates an upstream snapshot without creating its ref', async (t) => {
  const fixture = makeRepositoryWithSnapshots();
  t.after(() => cleanupRepository(fixture));
  const snapshotDir = await generateUpstreamSnapshot(fixture.repo, fixture.u0, 'm0-dry-run');
  t.after(() => rmSync(snapshotDir, { recursive: true, force: true }));
  const objectCountBefore = output(fixture.repo, ['count-objects', '-v']);

  const result = await prepareMirror({
    cwd: fixture.repo,
    snapshotDir,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.mirrorCommit, null);
  assert.equal(result.sourceCommit, fixture.u0);
  assert.equal(result.branch, 'upstream/aibuddy-mirror');
  assert.match(result.message, /Upstream-Commit:/);
  assert.equal(output(fixture.repo, ['count-objects', '-v']), objectCountBefore);
  assert.equal(
    git(fixture.repo, ['show-ref', '--verify', '--quiet', 'refs/heads/upstream/aibuddy-mirror'], {
      allowFailure: true,
    }).status,
    1,
  );
});

test('prepareMirror creates a pure transformed root commit and excludes provenance metadata', async (t) => {
  const fixture = makeRepositoryWithSnapshots();
  t.after(() => cleanupRepository(fixture));
  const snapshotDir = await generateUpstreamSnapshot(fixture.repo, fixture.u0, 'm0');
  t.after(() => rmSync(snapshotDir, { recursive: true, force: true }));

  const result = await prepareMirror({
    cwd: fixture.repo,
    snapshotDir,
    dryRun: false,
  });

  assert.equal(output(fixture.repo, ['rev-parse', 'refs/heads/upstream/aibuddy-mirror']), result.mirrorCommit);
  assert.deepEqual(parents(fixture.repo, result.mirrorCommit), []);
  assert.equal(lsTree(fixture.repo, result.mirrorCommit).includes('.aibuddy-rebrand.json'), false);
  assert.equal(lsTree(fixture.repo, result.mirrorCommit).some((path) => path === '.git' || path.startsWith('.git/')), false);
  assert.equal(lsTree(fixture.repo, result.mirrorCommit).includes('thirdpartydata'), false);
  assert.match(result.message, /Mirror-Input: upstream/);
  assert.match(result.message, new RegExp(`Mirror-Source-Tree: ${result.sourceTree}`));
});

test('prepareMirror rejects a non-pristine snapshot and unresolved conversion', async (t) => {
  const fixture = makeRepositoryWithSnapshots();
  t.after(() => cleanupRepository(fixture));
  const snapshotDir = await generateUpstreamSnapshot(fixture.repo, fixture.u0, 'corrupt');
  t.after(() => rmSync(snapshotDir, { recursive: true, force: true }));

  writeFileSync(join(snapshotDir, 'README.md'), 'tampered\n');
  await assert.rejects(
    prepareMirror({ cwd: fixture.repo, snapshotDir }),
    /digest|content|manifest/i,
  );

  writeFileSync(join(fixture.repo, 'notes.source'), 'Goose unresolved source\n');
  const unresolvedCommit = commit(fixture.repo, 'raw unresolved upstream');
  await assert.rejects(
    generateUpstreamSnapshot(fixture.repo, unresolvedCommit, 'unresolved'),
    /unresolved/i,
  );
});

test('prepareMirror refuses an existing branch and appendMirror uses CAS against the previous mirror', async (t) => {
  const fixture = makeRepositoryWithSnapshots();
  t.after(() => cleanupRepository(fixture));
  const m0Snapshot = await generateUpstreamSnapshot(fixture.repo, fixture.u0, 'm0-cas');
  const m1Snapshot = await generateUpstreamSnapshot(fixture.repo, fixture.u1, 'm1-cas');
  t.after(() => {
    rmSync(m0Snapshot, { recursive: true, force: true });
    rmSync(m1Snapshot, { recursive: true, force: true });
  });

  const m0 = await prepareMirror({ cwd: fixture.repo, snapshotDir: m0Snapshot, dryRun: false });
  await assert.rejects(
    prepareMirror({ cwd: fixture.repo, snapshotDir: m0Snapshot, dryRun: false }),
    /already exists|refuse|overwrite/i,
  );

  const wrongExpectedRef = '0'.repeat(40);
  await assert.rejects(
    appendMirror({
      cwd: fixture.repo,
      snapshotDir: m1Snapshot,
      parentMirror: m0.mirrorCommit,
      expectedRef: wrongExpectedRef,
      dryRun: false,
    }),
    /expected|CAS|tip|parent/i,
  );

  const m1 = await appendMirror({
    cwd: fixture.repo,
    snapshotDir: m1Snapshot,
    parentMirror: m0.mirrorCommit,
    expectedRef: m0.mirrorCommit,
    dryRun: false,
  });
  assert.deepEqual(parents(fixture.repo, m1.mirrorCommit), [m0.mirrorCommit]);
  assert.equal(output(fixture.repo, ['rev-parse', 'refs/heads/upstream/aibuddy-mirror']), m1.mirrorCommit);
  assert.match(m1.message, new RegExp(`Mirror-Parent: ${m0.mirrorCommit}`));
  assert.equal(parents(fixture.repo, m1.mirrorCommit).includes(fixture.u1), false);
});

test('appendMirror preserves the transformed mirror merge-base for a reviewed bridge', async (t) => {
  const fixture = makeRepositoryWithSnapshots();
  t.after(() => cleanupRepository(fixture));
  const m0Snapshot = await generateUpstreamSnapshot(fixture.repo, fixture.u0, 'm0-merge-base');
  const m1Snapshot = await generateUpstreamSnapshot(fixture.repo, fixture.u1, 'm1-merge-base');
  t.after(() => {
    rmSync(m0Snapshot, { recursive: true, force: true });
    rmSync(m1Snapshot, { recursive: true, force: true });
  });

  const m0 = await prepareMirror({ cwd: fixture.repo, snapshotDir: m0Snapshot, dryRun: false });
  try {
    git(fixture.repo, ['checkout', '--detach', '--force', m0.mirrorCommit]);
    writeFileSync(join(fixture.repo, 'product-only.txt'), 'AIBuddy product patch\n');
    const productCommit = commit(fixture.repo, 'product baseline P0');
    const bridge = commitTree(
      fixture.repo,
      tree(fixture.repo, productCommit),
      [productCommit, m0.mirrorCommit],
      'reviewed bootstrap bridge',
    );
    const m1 = await appendMirror({
      cwd: fixture.repo,
      snapshotDir: m1Snapshot,
      parentMirror: m0.mirrorCommit,
      expectedRef: m0.mirrorCommit,
      dryRun: false,
    });

    assert.equal(output(fixture.repo, ['merge-base', bridge, m1.mirrorCommit]), m0.mirrorCommit);
    assert.equal(output(fixture.repo, ['show', `${bridge}:product-only.txt`]), 'AIBuddy product patch');
  } finally {
    assert.equal(existsSync(join(fixture.repo, '.git')), true);
  }
});

test('dry-run tree hashing matches Git for nested, Unicode, executable, symlink, and data entries', async (t) => {
  const fixture = makeRepositoryWithSnapshots();
  t.after(() => cleanupRepository(fixture));
  mkdirSync(join(fixture.repo, 'nested'), { recursive: true });
  writeFileSync(join(fixture.repo, 'nested', 'unicodé.txt'), 'Unicode upstream content\n');
  writeFileSync(join(fixture.repo, 'bin-script'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(fixture.repo, 'bin-script'), 0o755);
  symlinkSync('../README.md', join(fixture.repo, 'nested', 'README-link'));
  writeFileSync(join(fixture.repo, 'thirdpartydata'), 'legitimate upstream data\n');
  const u2 = commit(fixture.repo, 'raw upstream U2 with tree edge cases');
  const snapshotDir = await generateUpstreamSnapshot(fixture.repo, u2, 'tree-edge-cases');
  t.after(() => rmSync(snapshotDir, { recursive: true, force: true }));

  const dryRun = await prepareMirror({
    cwd: fixture.repo,
    snapshotDir,
    branch: 'upstream/tree-dry-run',
  });
  const actual = await prepareMirror({
    cwd: fixture.repo,
    snapshotDir,
    branch: 'upstream/tree-actual',
    dryRun: false,
  });

  assert.equal(dryRun.mirrorTree, actual.mirrorTree);
  assert.equal(lsTree(fixture.repo, actual.mirrorCommit).includes('thirdpartydata'), true);
  const rawTree = output(fixture.repo, [
    '-c',
    'core.quotePath=false',
    'ls-tree',
    '-r',
    actual.mirrorCommit,
  ]);
  assert.match(rawTree, /100755 blob .*\tbin-script$/m);
  assert.match(rawTree, /120000 blob .*\tnested\/README-link$/m);
  assert.match(rawTree, /100644 blob .*\tnested\/unicodé\.txt$/m);
});

test('dry-run hashes a large binary without stdin Git process stalls', async (t) => {
  const fixture = makeRepositoryWithSnapshots();
  t.after(() => cleanupRepository(fixture));
  const largeContent = Buffer.alloc(20 * 1024 * 1024);
  for (let index = 0; index < largeContent.length; index += 1) {
    largeContent[index] = index % 251;
  }
  writeFileSync(join(fixture.repo, 'large-binary.dat'), largeContent);
  const sourceCommit = commit(fixture.repo, 'raw upstream large binary');
  const snapshotDir = await generateUpstreamSnapshot(fixture.repo, sourceCommit, 'large-binary');
  t.after(() => rmSync(snapshotDir, { recursive: true, force: true }));

  const dryRun = await prepareMirror({
    cwd: fixture.repo,
    snapshotDir,
    branch: 'upstream/large-binary-dry-run',
  });
  const actual = await prepareMirror({
    cwd: fixture.repo,
    snapshotDir,
    branch: 'upstream/large-binary-actual',
    dryRun: false,
  });

  assert.equal(dryRun.mirrorTree, actual.mirrorTree);
  assert.equal(tree(fixture.repo, actual.mirrorCommit), dryRun.mirrorTree);
});

test('establishBridge binds an external proof artifact and only creates an explicitly approved bridge', async (t) => {
  const fixture = makeRepositoryWithSnapshots();
  t.after(() => cleanupRepository(fixture));
  const proofDirectory = mkdtempSync(join(tmpdir(), 'aibuddy-mirror-proof-'));
  t.after(() => rmSync(proofDirectory, { recursive: true, force: true }));
  const snapshotDir = await generateUpstreamSnapshot(fixture.repo, fixture.u0, 'bridge-proof');
  t.after(() => rmSync(snapshotDir, { recursive: true, force: true }));

  const mirror = await prepareMirror({
    cwd: fixture.repo,
    snapshotDir,
    dryRun: false,
  });
  git(fixture.repo, ['checkout', '--detach', '--force', fixture.u0]);
  writeFileSync(join(fixture.repo, 'product-input.txt'), 'raw product input\n');
  const h0 = commit(fixture.repo, 'raw product input H0');
  git(fixture.repo, ['checkout', '--detach', '--force', mirror.mirrorCommit]);
  writeFileSync(join(fixture.repo, 'product-only.txt'), 'AIBuddy product patch\n');
  const p0 = commit(fixture.repo, 'transformed product baseline P0');
  const productBranch = 'sync/aibuddy-upstream-test';
  git(fixture.repo, ['checkout', '-B', productBranch]);
  const p0Tree = tree(fixture.repo, p0);
  const proof = {
    expectedProductCommit: p0,
    expectedProductTree: p0Tree,
    initialRename: true,
    knownProductPatches: ['product-only'],
    mirrorInput: {
      productInputCommit: h0,
      upstreamCommit: fixture.u0,
    },
    schemaVersion: 1,
  };
  const proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`);
  const proofPath = join(proofDirectory, 'migration-proof.json');
  writeFileSync(proofPath, proofBytes, { mode: 0o600 });
  const proofDigest = createHash('sha256').update(proofBytes).digest('hex');

  const review = await establishBridge({
    branch: productBranch,
    cwd: fixture.repo,
    expectedProductCommit: p0,
    migrationProofPath: proofPath,
    mirrorCommit: mirror.mirrorCommit,
  });
  assert.equal(review.action, 'review');
  assert.equal(review.bridgeCommit, undefined);
  assert.equal(review.proofDigest, proofDigest);
  assert.deepEqual(review.reviewedInputs, {
    knownProductPatchesDigest: createHash('sha256')
      .update(JSON.stringify(proof.knownProductPatches))
      .digest('hex'),
    productInputCommit: h0,
    upstreamCommit: fixture.u0,
  });

  const bridge = await establishBridge({
    approve: true,
    branch: productBranch,
    cwd: fixture.repo,
    dryRun: false,
    expectedProductCommit: p0,
    expectedTree: p0Tree,
    migrationProofPath: proofPath,
    mirrorCommit: mirror.mirrorCommit,
  });
  assert.deepEqual(parents(fixture.repo, bridge.bridgeCommit), [p0, mirror.mirrorCommit]);
  assert.equal(tree(fixture.repo, bridge.bridgeCommit), p0Tree);
  const bridgeMessage = output(fixture.repo, ['show', '-s', '--format=%B', bridge.bridgeCommit]);
  assert.match(bridgeMessage, new RegExp(`Bridge-Proof-SHA256: ${proofDigest}`));
  assert.match(bridgeMessage, new RegExp(`Bridge-Upstream-Commit: ${fixture.u0}`));
  assert.match(bridgeMessage, new RegExp(`Bridge-Product-Input-Commit: ${h0}`));
});
