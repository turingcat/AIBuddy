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
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { applySnapshot } from '../src/apply-snapshot.mjs';
import { generateSnapshot } from '../src/generate.mjs';

const BRANCH = 'feat/aibuddy-branding';

function gitEnvironment() {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
    ),
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: process.platform === 'win32' ? 'NUL' : '/dev/null',
  };
}

function git(root, args, input) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: gitEnvironment(),
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

function createFixture({ branch = BRANCH, controlCommit = false, nestedWorkspaceFile = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aibuddy-rebrand-apply-'));
  git(root, ['init', '--quiet', `--initial-branch=${branch}`]);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Fixture']);

  writeFixtureFile(root, 'src/goose.txt', 'Goose source\n');
  writeFixtureFile(root, 'keep.txt', 'keep source\n');
  writeFixtureFile(root, 'obsolete.txt', 'obsolete source\n');
  writeFixtureFile(root, 'bin/run', '#!/bin/sh\nexit 0\n', 0o755);
  writeFixtureFile(root, 'readonly/second.txt', 'second source\n');
  writeFixtureFile(root, 'product-only.txt', 'product customization\n');
  if (nestedWorkspaceFile) writeFixtureFile(root, 'crates/goose/Cargo.toml', '[package]\n');
  mkdirSync(join(root, 'links'));
  symlinkSync('../keep.txt', join(root, 'links/keep'));
  git(root, ['add', '--all']);
  git(root, ['commit', '-qm', 'source baseline']);
  const sourceCommit = git(root, ['rev-parse', 'HEAD']);

  if (controlCommit) {
    writeFixtureFile(root, 'docs/superpowers/specs/design.md', 'control baseline\n');
    git(root, ['add', '--all']);
    git(root, ['commit', '-qm', 'product control baseline']);
  }

  return {
    head: git(root, ['rev-parse', 'HEAD']),
    root,
    sourceCommit,
    cleanup() {
      rmSync(root, { force: true, recursive: true });
    },
  };
}

function createOutputLocation() {
  const parent = mkdtempSync(join(tmpdir(), 'aibuddy-rebrand-output-'));
  return {
    outputDir: join(parent, 'snapshot'),
    cleanup() {
      rmSync(parent, { force: true, recursive: true });
    },
  };
}

async function createSnapshot(fixture, { targetPath = 'src/aibuddy.txt', deletePaths = [] } = {}) {
  const output = createOutputLocation();
  await generateSnapshot({
    cwd: fixture.root,
    outputDir: output.outputDir,
    sourceRef: fixture.sourceCommit,
    transform: async (entries) => {
      const reportEntries = [];
      const transformed = [];
      for (const entry of entries) {
        if (entry.path === 'obsolete.txt' || deletePaths.includes(entry.path)) {
          reportEntries.push({ inputPath: entry.path });
          continue;
        }

        const outputPath = entry.path === 'src/goose.txt' ? targetPath : entry.path;
        let content = Buffer.from(entry.content);
        if (entry.path === 'src/goose.txt') {
          content = Buffer.from('AIBuddy source\n');
        } else if (entry.path === 'keep.txt') {
          content = Buffer.from('keep transformed\n');
        } else if (entry.path === 'readonly/second.txt') {
          content = Buffer.from('second transformed\n');
        }
        transformed.push({ ...entry, content, path: outputPath });
        reportEntries.push({ inputPath: entry.path, outputPath });
      }
      return {
        entries: transformed,
        report: { entries: reportEntries, unresolved: [] },
      };
    },
    transformIdentity: 'sha256:apply-snapshot-fixture',
  });
  return output;
}

test('dry-run reports changes without touching the feature worktree', async (t) => {
  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  writeFixtureFile(fixture.root, 'tools/rebrand/local-note.txt', 'keep tooling\n');
  writeFixtureFile(fixture.root, 'docs/local-note.md', 'keep docs\n');

  const result = await applySnapshot({ cwd: fixture.root, outputDir: output.outputDir });

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.changed, ['keep.txt', 'readonly/second.txt']);
  assert.deepEqual(result.renamed, [{ from: 'src/goose.txt', to: 'src/aibuddy.txt' }]);
  assert.deepEqual(result.added, ['src/aibuddy.txt']);
  assert.deepEqual(result.deleted, ['obsolete.txt', 'src/goose.txt']);
  assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep source\n');
  assert.equal(existsSync(join(fixture.root, 'src/aibuddy.txt')), false);
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
  assert.equal(readFileSync(join(fixture.root, 'tools/rebrand/local-note.txt'), 'utf8'), 'keep tooling\n');
  assert.equal(readFileSync(join(fixture.root, 'docs/local-note.md'), 'utf8'), 'keep docs\n');
});


test('accepts an explicitly selected sync branch', async (t) => {
  const branch = 'sync/aibuddy-upstream-test';
  const fixture = createFixture({ branch });
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  const result = await applySnapshot({
    cwd: fixture.root,
    outputDir: output.outputDir,
    expectedBranch: branch,
  });

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.renamed, [{ from: 'src/goose.txt', to: 'src/aibuddy.txt' }]);
});

test('applies output files atomically and preserves unrelated product files and symlinks', async (t) => {
  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  const refsBefore = git(fixture.root, ['for-each-ref', '--format=%(refname)=%(objectname)']);
  const result = await applySnapshot({ cwd: fixture.root, outputDir: output.outputDir, dryRun: false });

  assert.equal(result.dryRun, false);
  assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep transformed\n');
  assert.equal(readFileSync(join(fixture.root, 'readonly/second.txt'), 'utf8'), 'second transformed\n');
  assert.equal(readFileSync(join(fixture.root, 'src/aibuddy.txt'), 'utf8'), 'AIBuddy source\n');
  assert.equal(existsSync(join(fixture.root, 'src/goose.txt')), false);
  assert.equal(existsSync(join(fixture.root, 'obsolete.txt')), false);
  assert.equal(readFileSync(join(fixture.root, 'product-only.txt'), 'utf8'), 'product customization\n');
  assert.equal(readlinkSync(join(fixture.root, 'links/keep')), '../keep.txt');
  assert.equal(lstatSync(join(fixture.root, 'bin/run')).mode & 0o111, 0o111);
  assert.deepEqual(
    JSON.parse(readFileSync(join(fixture.root, '.aibuddy-rebrand.json'), 'utf8')),
    JSON.parse(readFileSync(join(output.outputDir, '.aibuddy-rebrand.json'), 'utf8')),
  );
  assert.equal(git(fixture.root, ['rev-parse', '--abbrev-ref', 'HEAD']), BRANCH);
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD']), fixture.head);
  assert.equal(git(fixture.root, ['for-each-ref', '--format=%(refname)=%(objectname)']), refsBefore);
});

test('prunes empty parent directories of deleted original paths', async (t) => {
  const fixture = createFixture({ nestedWorkspaceFile: true });
  const output = await createSnapshot(fixture, { deletePaths: ['crates/goose/Cargo.toml'] });
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  await applySnapshot({ cwd: fixture.root, outputDir: output.outputDir, dryRun: false });

  assert.equal(existsSync(join(fixture.root, 'crates/goose/Cargo.toml')), false);
  assert.equal(existsSync(join(fixture.root, 'crates/goose')), false);
});

test('preserves nonempty parent directories of deleted original paths', async (t) => {
  const fixture = createFixture({ nestedWorkspaceFile: true });
  const output = await createSnapshot(fixture, { deletePaths: ['crates/goose/Cargo.toml'] });
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  writeFixtureFile(fixture.root, 'crates/goose/local-note.txt', 'preserve me\n');
  await applySnapshot({ cwd: fixture.root, outputDir: output.outputDir, dryRun: false });

  assert.equal(existsSync(join(fixture.root, 'crates/goose')), true);
  assert.equal(readFileSync(join(fixture.root, 'crates/goose/local-note.txt'), 'utf8'), 'preserve me\n');
});

test('aborts before writing when a tracked baseline path is dirty', async (t) => {
  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  writeFixtureFile(fixture.root, 'keep.txt', 'user change\n');

  await assert.rejects(
    applySnapshot({ cwd: fixture.root, outputDir: output.outputDir }),
    /baseline|dirty|modified|worktree/i,
  );
  assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'user change\n');
  assert.equal(existsSync(join(fixture.root, 'src/aibuddy.txt')), false);
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
});

test('preserves explicitly allowlisted tracked control paths', async (t) => {
  const fixture = createFixture({ controlCommit: true });
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  const controlPath = 'docs/superpowers/specs/design.md';
  writeFixtureFile(fixture.root, controlPath, 'controller edit\n');

  const result = await applySnapshot({
    cwd: fixture.root,
    outputDir: output.outputDir,
    dryRun: false,
    preservedControlPaths: [controlPath],
  });

  assert.equal(result.changed.includes(controlPath), false);
  assert.equal(readFileSync(join(fixture.root, controlPath), 'utf8'), 'controller edit\n');
  assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep transformed\n');
});

test('rejects an existing non-baseline destination and symlink ancestors', async (t) => {
  const fixture = createFixture();
  const collisionOutput = await createSnapshot(fixture);
  const symlinkOutput = await createSnapshot(fixture, { targetPath: 'new/nested/aibuddy.txt' });
  const outside = mkdtempSync(join(tmpdir(), 'aibuddy-rebrand-outside-'));
  t.after(() => {
    collisionOutput.cleanup();
    symlinkOutput.cleanup();
    rmSync(outside, { force: true, recursive: true });
    fixture.cleanup();
  });

  writeFixtureFile(fixture.root, 'src/aibuddy.txt', 'unrelated collision\n');
  await assert.rejects(
    applySnapshot({ cwd: fixture.root, outputDir: collisionOutput.outputDir }),
    /collision|destination/i,
  );
  assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep source\n');
  rmSync(join(fixture.root, 'src/aibuddy.txt'));

  symlinkSync(outside, join(fixture.root, 'new'), 'dir');
  await assert.rejects(
    applySnapshot({ cwd: fixture.root, outputDir: symlinkOutput.outputDir }),
    /symlink.*ancestor|ancestor.*symlink/i,
  );
  assert.equal(existsSync(join(fixture.root, 'new/nested/aibuddy.txt')), false);
});

test('rejects main even when it is supplied as the expected branch', async (t) => {
  const fixture = createFixture({ branch: 'main' });
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  await assert.rejects(
    applySnapshot({ cwd: fixture.root, outputDir: output.outputDir, expectedBranch: 'main' }),
    /expectedBranch must start.*feat\/.*sync\//i,
  );
  assert.equal(git(fixture.root, ['rev-parse', '--abbrev-ref', 'HEAD']), 'main');
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
});

test('rejects non-feature expected and actual branches', async (t) => {
  const fixture = createFixture({ branch: 'release/1.0' });
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  await assert.rejects(
    applySnapshot({ cwd: fixture.root, outputDir: output.outputDir, expectedBranch: 'release/1.0' }),
    /feat\//i,
  );
});

test('rejects same-size snapshot changes after initial verification', async (t) => {
  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  await assert.rejects(
    applySnapshot({
      cwd: fixture.root,
      outputDir: output.outputDir,
      beforeMutation: ({ kind }) => {
        if (kind === 'capture') writeFileSync(join(output.outputDir, 'keep.txt'), 'keep edited\n');
      },
    }),
    /changed while applying|digest/i,
  );
  assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep source\n');
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
});

test('rejects a competing cooperative apply lock', async (t) => {
  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  const lockPath = join(fixture.root, '.aibuddy-rebrand.apply.lock');
  t.after(() => {
    rmSync(lockPath, { force: true });
    output.cleanup();
    fixture.cleanup();
  });

  writeFileSync(lockPath, 'held\n');
  await assert.rejects(
    applySnapshot({ cwd: fixture.root, outputDir: output.outputDir }),
    /cooperative apply lock|EEXIST/i,
  );
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
});

test('preserves a changed earlier write while rolling back later writes', async (t) => {
  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  await assert.rejects(
    applySnapshot({
      cwd: fixture.root,
      outputDir: output.outputDir,
      dryRun: false,
      beforeMutation: ({ kind, path }) => {
        if (kind === 'write' && path === 'src/aibuddy.txt') {
          writeFileSync(
            join(fixture.root, 'keep.txt'),
            Buffer.alloc(readFileSync(join(output.outputDir, 'keep.txt')).length, 0x58),
          );
          throw new Error('forced later write failure');
        }
      },
    }),
    /forced later write failure|rollback preserved external changes/i,
  );
  assert.equal(
    readFileSync(join(fixture.root, 'keep.txt')).equals(
      Buffer.alloc(readFileSync(join(output.outputDir, 'keep.txt')).length, 0x58),
    ),
    true,
  );
  assert.equal(readFileSync(join(fixture.root, 'readonly/second.txt'), 'utf8'), 'second source\n');
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
});

test('rolls back earlier atomic writes when a later output cannot be staged', async (t) => {
  if (process.platform === 'win32') {
    t.skip('directory permission fixture is POSIX-specific');
    return;
  }

  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  const readonlyDirectory = join(fixture.root, 'readonly');
  t.after(() => {
    chmodSync(readonlyDirectory, 0o755);
    output.cleanup();
    fixture.cleanup();
  });

  chmodSync(readonlyDirectory, 0o555);
  await assert.rejects(
    applySnapshot({ cwd: fixture.root, outputDir: output.outputDir, dryRun: false }),
    /permission|read-only|denied|rename|open/i,
  );
  assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep source\n');
  assert.equal(readFileSync(join(fixture.root, 'readonly/second.txt'), 'utf8'), 'second source\n');
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
});

test('rejects a destination that appears after the initial destination check', async (t) => {
  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  const collisionPath = join(fixture.root, 'src/aibuddy.txt');
  await assert.rejects(
    applySnapshot({
      cwd: fixture.root,
      outputDir: output.outputDir,
      beforeMutation: async ({ kind }) => {
        if (kind === 'capture') writeFileSync(collisionPath, 'external collision\n');
      },
    }),
    /destination collision/i,
  );
  assert.equal(readFileSync(collisionPath, 'utf8'), 'external collision\n');
  assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep source\n');
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
});

test('does not overwrite an external same-length edit during rollback', async (t) => {
  const fixture = createFixture();
  const output = await createSnapshot(fixture);
  t.after(() => {
    output.cleanup();
    fixture.cleanup();
  });

  const externalKeep = Buffer.alloc(readFileSync(join(fixture.root, 'keep.txt')).length, 0x59);
  await assert.rejects(
    applySnapshot({
      cwd: fixture.root,
      outputDir: output.outputDir,
      dryRun: false,
      beforeMutation: async ({ kind, path }) => {
        if (kind === 'write' && path === 'readonly/second.txt') {
          writeFileSync(join(fixture.root, 'keep.txt'), externalKeep);
          throw new Error('forced later write failure');
        }
      },
    }),
    (error) => {
      assert.match(error.message, /forced later write failure/);
      assert.match(error.message, /rollback preserved external changes.*keep\.txt/);
      return true;
    },
  );
  assert.deepEqual(readFileSync(join(fixture.root, 'keep.txt')), externalKeep);
  assert.equal(readFileSync(join(fixture.root, 'readonly/second.txt'), 'utf8'), 'second source\n');
  assert.equal(existsSync(join(fixture.root, '.aibuddy-rebrand.json')), false);
});
