import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { generateSnapshot, planBlobBatches, readSnapshot } from '../src/generate.mjs';
import { verifySnapshot } from '../src/verify.mjs';

const TRANSFORM_IDENTITY = 'sha256:fixture-transform-v1';

function gitEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function git(root, args, input) {
  return execFileSync('git', ['-C', root, ...args], {
    env: gitEnvironment(),
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function writeFixtureFile(root, relativePath, content, mode) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  if (mode !== undefined) {
    chmodSync(filePath, mode);
  }
}

function createFixture({ marker = false, submodule = false, trailingSpace = false } = {}) {
  let root = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-generate-'));
  if (trailingSpace) {
    const renamedRoot = `${root} `;
    renameSync(root, renamedRoot);
    root = renamedRoot;
  }
  writeFixtureFile(root, 'README.md', 'committed source\n');
  writeFixtureFile(root, 'assets/blob.bin', Buffer.from([0, 1, 2, 0xff, 0x00]));
  writeFixtureFile(root, 'bin/run', '#!/bin/sh\nexit 0\n', 0o755);
  mkdirSync(join(root, 'links'));
  symlinkSync('../README.md', join(root, 'links/readme'));
  if (marker) {
    writeFixtureFile(root, '.heybuddy-rebrand.json', '{"valid":true}\n');
  }

  git(root, ['init', '--quiet', '--initial-branch=fixture']);
  const hooksPath = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-hooks-'));
  git(root, ['config', 'core.hooksPath', hooksPath]);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['add', '--all']);

  if (submodule) {
    const nested = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-submodule-'));
    git(nested, ['init', '--quiet', '--initial-branch=submodule']);
    git(nested, ['config', 'user.email', 'fixture@example.invalid']);
    git(nested, ['config', 'user.name', 'Fixture']);
    writeFixtureFile(nested, 'submodule.txt', 'submodule\n');
    git(nested, ['add', '--all']);
    git(nested, ['commit', '-qm', 'submodule']);
    const submoduleCommit = git(nested, ['rev-parse', 'HEAD']);
    git(root, [
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${submoduleCommit},vendor/submodule`,
    ]);
    rmSync(nested, { recursive: true, force: true });
  }

  git(root, ['commit', '-qm', 'fixture']);
  return {
    commit: git(root, ['rev-parse', 'HEAD']),
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
      rmSync(hooksPath, { recursive: true, force: true });
    },
  };
}

function cloneEntries(entries) {
  return entries.map((entry) => ({
    content: Buffer.from(entry.content),
    mode: entry.mode,
    path: entry.path,
  }));
}

function identityTransform(entries) {
  return {
    entries: cloneEntries(entries),
    report: { unresolved: [] },
  };
}

function collectTree(root, current = '') {
  const entries = [];
  for (const name of readdirSync(join(root, current))) {
    const relativePath = current ? `${current}/${name}` : name;
    const absolutePath = join(root, relativePath);
    const stat = lstatSync(absolutePath);
    if (stat.isDirectory()) {
      entries.push(...collectTree(root, relativePath));
      continue;
    }
    if (stat.isSymbolicLink()) {
      entries.push({
        content: readlinkSync(absolutePath),
        mode: '120000',
        path: relativePath,
      });
      continue;
    }
    entries.push({
      content: readFileSync(absolutePath),
      mode: stat.mode & 0o111 ? '100755' : '100644',
      path: relativePath,
    });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function createOutputLocation(label) {
  const parent = mkdtempSync(join(tmpdir(), `heybuddy-rebrand-output-${label}-`));
  return {
    cleanup() {
      rmSync(parent, { recursive: true, force: true });
    },
    outputDir: join(parent, 'output'),
  };
}

test('plans bounded blob batches with per-batch deduplication and actionable oversize errors', () => {
  const objectA = 'a'.repeat(40);
  const objectB = 'b'.repeat(40);
  const entries = [
    { gitType: 'blob', objectId: objectA, path: 'first.bin', size: 6 },
    { gitType: 'blob', objectId: objectA, path: 'duplicate.bin', size: 6 },
    { gitType: 'blob', objectId: objectB, path: 'second.bin', size: 5 },
  ];

  assert.deepEqual(
    planBlobBatches(entries, { maxBytes: 8, maxObjects: 2 }),
    [
      {
        entries: entries.slice(0, 2),
        expectedSize: 6,
        objectIds: [objectA],
      },
      {
        entries: [entries[2]],
        expectedSize: 5,
        objectIds: [objectB],
      },
    ],
  );

  assert.throws(
    () => planBlobBatches([
      { gitType: 'blob', objectId: objectA, path: 'large.bin', size: 20 * 1024 * 1024 },
    ], { maxBytes: 16 * 1024 * 1024 }),
    /large\.bin.*20971520 bytes.*16777216 bytes/i,
  );
});

test('generates from the pinned Git tree and returns a serializable verified report', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  writeFixtureFile(fixture.root, 'README.md', 'dirty working tree\n');
  writeFixtureFile(fixture.root, 'untracked.txt', 'must not be read\n');
  const output = createOutputLocation('pinned');
  t.after(output.cleanup);
  const { outputDir } = output;
  const beforeBranch = git(fixture.root, ['symbolic-ref', '--short', 'HEAD']);
  const beforeRefs = git(fixture.root, ['for-each-ref', '--format=%(refname)=%(objectname)']);
  const snapshot = readSnapshot({ cwd: fixture.root, sourceRef: fixture.commit });
  assert.equal(snapshot.commit, fixture.commit);
  assert.equal(snapshot.tree.length, 40);
  assert.equal(snapshot.entries.some((entry) => entry.path === 'untracked.txt'), false);

  const result = await generateSnapshot({
    cwd: fixture.root,
    outputDir,
    sourceRef: fixture.commit,
    transform: identityTransform,
    transformIdentity: TRANSFORM_IDENTITY,
  });

  assert.equal(readFileSync(join(outputDir, 'README.md'), 'utf8'), 'committed source\n');
  assert.deepEqual(readFileSync(join(outputDir, 'assets/blob.bin')), Buffer.from([0, 1, 2, 0xff, 0x00]));
  assert.equal(existsSync(join(outputDir, 'untracked.txt')), false);
  assert.equal(lstatSync(join(outputDir, 'bin/run')).mode & 0o111, 0o111);
  assert.equal(readlinkSync(join(outputDir, 'links/readme')), '../README.md');
  assert.equal(result.provenance.source.commit, fixture.commit);
  assert.equal(typeof result.provenance.outputDigest, 'string');

  const report = await verifySnapshot(outputDir);
  assert.equal(report.valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.equal(git(fixture.root, ['symbolic-ref', '--short', 'HEAD']), beforeBranch);
  assert.equal(git(fixture.root, ['for-each-ref', '--format=%(refname)=%(objectname)']), beforeRefs);
});

test('repeated generation into fresh destinations is byte-for-byte reproducible', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  const first = createOutputLocation('first');
  const second = createOutputLocation('second');
  t.after(first.cleanup);
  t.after(second.cleanup);
  const firstDir = first.outputDir;
  const secondDir = second.outputDir;
  await generateSnapshot({
    cwd: fixture.root,
    outputDir: firstDir,
    sourceRef: fixture.commit,
    transform: identityTransform,
    transformIdentity: TRANSFORM_IDENTITY,
  });
  await generateSnapshot({
    cwd: fixture.root,
    outputDir: secondDir,
    sourceRef: fixture.commit,
    transform: identityTransform,
    transformIdentity: TRANSFORM_IDENTITY,
  });

  assert.deepEqual(collectTree(firstDir), collectTree(secondDir));
  assert.deepEqual(
    JSON.parse(readFileSync(join(firstDir, '.heybuddy-rebrand.json'), 'utf8')),
    JSON.parse(readFileSync(join(secondDir, '.heybuddy-rebrand.json'), 'utf8')),
  );
});

test('refuses an existing destination without changing it', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  const output = createOutputLocation('existing');
  t.after(output.cleanup);
  const { outputDir } = output;
  mkdirSync(outputDir);
  writeFixtureFile(outputDir, 'sentinel.txt', 'keep me\n');

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir,
      sourceRef: fixture.commit,
      transform: identityTransform,
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /output directory.*already exists|must not exist/i,
  );
  assert.equal(readFileSync(join(outputDir, 'sentinel.txt'), 'utf8'), 'keep me\n');
});

test('refuses a competing publication lock without removing it', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  const output = createOutputLocation('locked');
  t.after(output.cleanup);
  const lockPath = `${output.outputDir}.publish-lock`;
  writeFileSync(lockPath, 'another generator owns this\n');

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir: output.outputDir,
      sourceRef: fixture.commit,
      transform: identityTransform,
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /publication lock/i,
  );
  assert.equal(readFileSync(lockPath, 'utf8'), 'another generator owns this\n');
});

test('rejects destinations inside the source worktree and unsafe parent symlinks', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir: join(fixture.root, 'generated-inside-source'),
      sourceRef: fixture.commit,
      transform: identityTransform,
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /outside.*source|source.*directory/i,
  );

  const outside = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-parent-'));
  const realParent = join(outside, 'real-parent');
  const linkedParent = join(outside, 'linked-parent');
  mkdirSync(realParent);
  symlinkSync(realParent, linkedParent, 'dir');
  t.after(() => rmSync(outside, { recursive: true, force: true }));

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir: join(linkedParent, 'generated'),
      sourceRef: fixture.commit,
      transform: identityTransform,
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /symlink.*parent|path.*symlink/i,
  );
  assert.equal(existsSync(join(realParent, 'generated')), false);
});

test('preserves trailing whitespace in Git source-root safety checks', async (t) => {
  const fixture = createFixture({ trailingSpace: true });
  t.after(fixture.cleanup);

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir: join(fixture.root, 'generated-inside-source'),
      sourceRef: fixture.commit,
      transform: identityTransform,
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /outside.*source|source.*directory/i,
  );
});

test('does not clobber an empty destination created after initial preflight', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  const output = createOutputLocation('race');
  t.after(output.cleanup);
  const { outputDir } = output;

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir,
      sourceRef: fixture.commit,
      transform: async (entries) => {
        mkdirSync(outputDir);
        return { entries: cloneEntries(entries), report: { unresolved: [] } };
      },
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /output directory.*(appeared|exists)|publication/i,
  );
  assert.deepEqual(readdirSync(outputDir), []);
});

test('rejects transformed output with casefold or file-directory prefix collisions', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  for (const entries of [
    [
      { content: Buffer.from('one'), mode: '100644', path: 'docs/Name.txt' },
      { content: Buffer.from('two'), mode: '100644', path: 'docs/name.txt' },
    ],
    [
      { content: Buffer.from('one'), mode: '100644', path: 'docs/name' },
      { content: Buffer.from('two'), mode: '100644', path: 'docs/name/child.txt' },
    ],
  ]) {
    const output = createOutputLocation('collision');
    t.after(output.cleanup);
    const { outputDir } = output;
    await assert.rejects(
      generateSnapshot({
        cwd: fixture.root,
        outputDir,
        sourceRef: fixture.commit,
        transform: async () => ({ entries, report: { unresolved: [] } }),
        transformIdentity: TRANSFORM_IDENTITY,
      }),
      /collision|prefix/i,
    );
    assert.equal(existsSync(outputDir), false);
  }
});

test('rejects symlink escapes before publishing output', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  const output = createOutputLocation('symlink-escape');
  t.after(output.cleanup);
  const { outputDir } = output;

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir,
      sourceRef: fixture.commit,
      transform: async (entries) => ({
        entries: [
          ...cloneEntries(entries),
          { content: Buffer.from('../../outside'), mode: '120000', path: 'escape' },
        ],
        report: { unresolved: [] },
      }),
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /symlink.*(escape|confine)|outside/i,
  );
  assert.equal(existsSync(outputDir), false);
});

test('cleans staging after transform and report failures', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  const output = createOutputLocation('failed');
  t.after(output.cleanup);
  const { outputDir } = output;
  const parentBefore = readdirSync(dirname(outputDir)).filter((name) =>
    name.startsWith('.failed-generation.stage-') || name === 'failed-generation.publish-lock');

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir,
      sourceRef: fixture.commit,
      transform: async () => {
        throw new Error('transform stopped');
      },
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /transform stopped/,
  );
  assert.equal(existsSync(outputDir), false);
  assert.deepEqual(
    readdirSync(dirname(outputDir)).filter((name) =>
      name.startsWith('.failed-generation.stage-') || name === 'failed-generation.publish-lock'),
    parentBefore,
  );

  await assert.rejects(
    generateSnapshot({
      cwd: fixture.root,
      outputDir,
      sourceRef: fixture.commit,
      transform: async (entries) => ({
        entries: cloneEntries(entries),
        report: { unresolved: ['README.md'] },
      }),
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /unresolved/i,
  );
  assert.equal(existsSync(outputDir), false);
});

test('requires an explicit unresolved array in the transform report', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  for (const report of [{}, { unresolved: 'unknown' }, { unresolved: null }]) {
    const output = createOutputLocation('report-shape');
    t.after(output.cleanup);
    await assert.rejects(
      generateSnapshot({
        cwd: fixture.root,
        outputDir: output.outputDir,
        sourceRef: fixture.commit,
        transform: async (entries) => ({
          entries: cloneEntries(entries),
          report,
        }),
        transformIdentity: TRANSFORM_IDENTITY,
      }),
      /report.*unresolved.*array/i,
    );
    assert.equal(existsSync(output.outputDir), false);
  }
});

test('rejects already transformed input and unsupported submodules explicitly', async (t) => {
  const markedFixture = createFixture({ marker: true });
  t.after(markedFixture.cleanup);
  const markedOutput = createOutputLocation('marked');
  t.after(markedOutput.cleanup);
  await assert.rejects(
    generateSnapshot({
      cwd: markedFixture.root,
      outputDir: markedOutput.outputDir,
      sourceRef: markedFixture.commit,
      transform: identityTransform,
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /already transformed|provenance marker/i,
  );

  const submoduleFixture = createFixture({ submodule: true });
  t.after(submoduleFixture.cleanup);
  const submoduleOutput = createOutputLocation('submodule');
  t.after(submoduleOutput.cleanup);
  await assert.rejects(
    generateSnapshot({
      cwd: submoduleFixture.root,
      outputDir: submoduleOutput.outputDir,
      sourceRef: submoduleFixture.commit,
      transform: identityTransform,
      transformIdentity: TRANSFORM_IDENTITY,
    }),
    /submodule/i,
  );
});

test('verifySnapshot detects content, mode, deletion, and additional-file corruption', async (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  const output = createOutputLocation('corrupt');
  t.after(output.cleanup);
  const { outputDir } = output;
  await generateSnapshot({
    cwd: fixture.root,
    outputDir,
    sourceRef: fixture.commit,
    transform: identityTransform,
    transformIdentity: TRANSFORM_IDENTITY,
  });

  writeFileSync(join(outputDir, 'README.md'), 'corrupted\n');
  await assert.rejects(verifySnapshot(outputDir), /digest|content|manifest/i);
  writeFileSync(join(outputDir, 'README.md'), 'committed source\n');

  chmodSync(join(outputDir, 'bin/run'), 0o644);
  await assert.rejects(verifySnapshot(outputDir), /mode|manifest/i);
  chmodSync(join(outputDir, 'bin/run'), 0o755);

  rmSync(join(outputDir, 'README.md'));
  await assert.rejects(verifySnapshot(outputDir), /missing|deleted|manifest/i);
  writeFixtureFile(outputDir, 'README.md', 'committed source\n');

  writeFixtureFile(outputDir, 'extra.txt', 'unexpected\n');
  await assert.rejects(verifySnapshot(outputDir), /additional|extra|manifest/i);
});
