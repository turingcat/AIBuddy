import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { generateSnapshot } from '../src/generate.mjs';
import { transformSnapshot } from '../src/transform.mjs';
import { prepareMirror } from '../src/mirror.mjs';
import { applySnapshotSync, checkSyncHistory, prepareSnapshotSync, recordSnapshotSync } from '../src/snapshot-sync.mjs';

const STATE = '.aibuddy-upstream.json';
const original = { 'README.md': 'HeyBuddy engine v0\n', 'auth.json': '{"host":"upstream"}\n' };
function git(cwd, args, { input, env = {} } = {}) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return execFileSync('git', args, {
    cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...environment, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env },
  }).trim();
}
function write(root, name, bytes) {
  mkdirSync(dirname(join(root, name)), { recursive: true });
  writeFileSync(join(root, name), bytes);
}
function commit(cwd, message = 'AIBuddy change') {
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}
async function fixture(t, initial = original) {
  const root = mkdtempSync(join(tmpdir(), 'aibuddy-snapshot-sync-'));
  const cwd = join(root, 'product');
  mkdirSync(cwd);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(cwd, ['init', '-q', '--initial-branch=sync/test']);
  git(cwd, ['config', 'user.name', 'AIBuddy Maintainer']);
  git(cwd, ['config', 'user.email', 'product@example.invalid']);
  let sequence = 0;
  async function snapshot(files, parent) {
    const env = { GIT_INDEX_FILE: join(root, `source-index-${sequence}`) };
    git(cwd, ['read-tree', '--empty'], { env });
    for (const [name, value] of Object.entries(files)) {
      const bytes = value?.bytes ?? value;
      const blob = git(cwd, ['hash-object', '-w', '--stdin'], { input: bytes });
      git(cwd, ['update-index', '--add', '--cacheinfo', `${value?.mode ?? '100644'},${blob},${name}`], { env });
    }
    const tree = git(cwd, ['write-tree'], { env });
    const source = git(cwd, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Community update ${sequence}`], {
      env: { GIT_AUTHOR_NAME: 'Community Contributor', GIT_AUTHOR_EMAIL: 'community@example.invalid' },
    });
    const output = join(root, `snapshot-${sequence++}`);
    await generateSnapshot({ cwd, sourceRef: source, outputDir: output, transformIdentity: 'test-transform',
      transform: (entries) => transformSnapshot(entries, { input: 'upstream' }) });
    return { output, source };
  }
  const previous = await snapshot(initial);
  const info = await prepareMirror({ cwd, snapshotDir: previous.output });
  const state = { schemaVersion: 1, mode: 'snapshot-delta', sourceRepository: 'https://github.com/turingcat/HeyBuddy.git', sourceRef: 'main',
    sourceCommit: info.sourceCommit, sourceTree: info.sourceTree, snapshotTree: info.tree,
    outputDigest: info.outputDigest, transformIdentity: info.transformIdentity };
  for (const [name, value] of Object.entries(initial)) {
    const bytes = value?.bytes ?? value;
    write(cwd, name, typeof bytes === 'string' ? bytes.replaceAll('HeyBuddy', 'AIBuddy') : bytes);
    if (value?.mode === '100755') chmodSync(join(cwd, name), 0o755);
  }
  write(cwd, 'auth.json', '{"host":"https://tflow.online"}\n');
  write(cwd, 'local-only.txt', 'desktop customization\n');
  write(cwd, STATE, JSON.stringify(state, null, 2) + '\n');
  const base = commit(cwd);
  const plan = async (next, name = `plan-${sequence}`) => {
    const outputDir = join(root, name);
    const result = await prepareSnapshotSync({ cwd, previousSnapshot: previous.output, nextSnapshot: next.output, outputDir });
    return { ...result, outputDir };
  };
  return { root, cwd, previous, state, base, snapshot, plan };
}

test('two consecutive snapshot deltas keep product ancestry independent and preserve customizations', async (t) => {
  const f = await fixture(t);
  const next = await f.snapshot({ ...original, 'README.md': 'HeyBuddy engine v1\n', 'docs/new.md': 'new feature\n' }, f.previous.source);
  const first = await f.plan(next);
  assert.equal(git(f.cwd, ['status', '--porcelain']), '');
  assert.equal(git(f.cwd, ['rev-parse', 'HEAD']), f.base);
  const result = applySnapshotSync({ cwd: f.cwd, planDir: first.outputDir });
  assert.equal(result.status, 'ready');
  assert.equal(existsSync(join(f.cwd, '.git', 'MERGE_HEAD')), false);
  assert.equal(readFileSync(join(f.cwd, 'auth.json'), 'utf8'), '{"host":"https://tflow.online"}\n');
  assert.equal(readFileSync(join(f.cwd, 'local-only.txt'), 'utf8'), 'desktop customization\n');
  const c1 = commit(f.cwd);
  assert.equal(git(f.cwd, ['show', '-s', '--format=%P', c1]), f.base);
  assert.equal(checkSyncHistory({ cwd: f.cwd, base: f.base }).commits, 1);
  const newer = await f.snapshot({ ...original, 'README.md': 'HeyBuddy engine v2\n', 'docs/new.md': 'new feature\n' }, next.source);
  const planDir = join(f.root, 'second-plan');
  await prepareSnapshotSync({ cwd: f.cwd, previousSnapshot: next.output, nextSnapshot: newer.output, outputDir: planDir });
  assert.equal(applySnapshotSync({ cwd: f.cwd, planDir }).status, 'ready');
  const c2 = commit(f.cwd);
  assert.equal(git(f.cwd, ['show', '-s', '--format=%P', c2]), c1);
  assert.equal(checkSyncHistory({ cwd: f.cwd, base: f.base }).commits, 2);
  const history = git(f.cwd, ['rev-list', 'HEAD']);
  for (const source of [f.previous.source, next.source, newer.source]) assert.ok(!history.includes(source));
  assert.equal(git(f.cwd, ['log', '--format=%ae', `${f.base}..HEAD`]), 'product@example.invalid\nproduct@example.invalid');
  assert.equal(readFileSync(join(f.cwd, 'README.md'), 'utf8'), 'AIBuddy engine v2\n');
});

test('binary, executable mode, rename and deletion changes survive a delta', async (t) => {
  const initial = { ...original, 'assets/data.bin': Buffer.from([0, 1, 2]), 'docs/before.md': 'retained document\n', 'old.txt': 'remove\n', 'run.sh': 'exit 0\n' };
  const f = await fixture(t, initial);
  const { 'docs/before.md': renamed, 'old.txt': deleted, ...files } = initial;
  const next = await f.snapshot({ ...files, 'assets/data.bin': Buffer.from([0, 9, 2]), 'docs/after.md': renamed, 'run.sh': { bytes: 'exit 0\n', mode: '100755' } }, f.previous.source);
  const plan = await f.plan(next);
  assert.equal(applySnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }).status, 'ready');
  assert.deepEqual(readFileSync(join(f.cwd, 'assets/data.bin')), Buffer.from([0, 9, 2]));
  assert.equal(existsSync(join(f.cwd, 'old.txt')), false);
  assert.equal(existsSync(join(f.cwd, 'docs/before.md')), false);
  assert.equal(readFileSync(join(f.cwd, 'docs/after.md'), 'utf8'), renamed);
  assert.match(git(f.cwd, ['ls-files', '--stage', 'run.sh']), /^100755 /);
});

test('conflicts do not advance the source baseline until staged resolution', async (t) => {
  const f = await fixture(t);
  write(f.cwd, 'README.md', 'AIBuddy customized engine\n');
  commit(f.cwd);
  const next = await f.snapshot({ ...original, 'README.md': 'HeyBuddy engine v1\n' }, f.previous.source);
  const plan = await f.plan(next);
  const result = applySnapshotSync({ cwd: f.cwd, planDir: plan.outputDir });
  assert.equal(result.status, 'conflicts');
  assert.deepEqual(result.conflicts, ['README.md']);
  assert.equal(JSON.parse(readFileSync(join(f.cwd, STATE))).sourceCommit, f.previous.source);
  assert.throws(() => recordSnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /unresolved/);
  write(f.cwd, 'README.md', 'AIBuddy customized engine v1\n');
  git(f.cwd, ['add', 'README.md']);
  assert.equal(recordSnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }).status, 'ready');
  assert.equal(JSON.parse(readFileSync(join(f.cwd, STATE))).sourceCommit, next.source);
  assert.equal(existsSync(join(f.cwd, '.git', 'MERGE_HEAD')), false);
});

test('rejects a wrong baseline, backwards source, and product input snapshot', async (t) => {
  const f = await fixture(t);
  const next = await f.snapshot({ ...original, 'README.md': 'HeyBuddy v1\n' }, f.previous.source);
  await assert.rejects(prepareSnapshotSync({ cwd: f.cwd, previousSnapshot: next.output, nextSnapshot: f.previous.output, outputDir: join(f.root, 'wrong') }), /baseline/);
  const unrelated = await f.snapshot({ ...original, 'README.md': 'unrelated\n' });
  await assert.rejects(f.plan(unrelated), /descendant/);
  const product = join(f.root, 'product-snapshot');
  await generateSnapshot({ cwd: f.cwd, sourceRef: f.previous.source, outputDir: product, transformIdentity: 'product',
    transform: (entries) => transformSnapshot(entries, { input: 'product' }) });
  await assert.rejects(prepareSnapshotSync({ cwd: f.cwd, previousSnapshot: f.previous.output, nextSnapshot: product, outputDir: join(f.root, 'product-plan') }), /upstream/);
});

test('requires a clean sync branch and an external new output directory', async (t) => {
  const f = await fixture(t);
  const next = await f.snapshot(original, f.previous.source);
  git(f.cwd, ['switch', '-c', 'main']);
  await assert.rejects(f.plan(next), /sync branch/);
  git(f.cwd, ['switch', 'sync/test']);
  write(f.cwd, 'dirty.txt', 'untracked');
  await assert.rejects(f.plan(next), /clean/);
  rmSync(join(f.cwd, 'dirty.txt'));
  await assert.rejects(prepareSnapshotSync({ cwd: f.cwd, previousSnapshot: f.previous.output, nextSnapshot: next.output, outputDir: join(f.cwd, 'plan') }), /outside/);
  await f.plan(next, 'once');
  await assert.rejects(f.plan(next, 'once'), /exist/);
});

test('apply refuses a stale HEAD or modified patch and record requires an apply operation', async (t) => {
  const f = await fixture(t);
  const next = await f.snapshot({ ...original, 'README.md': 'HeyBuddy v1\n' }, f.previous.source);
  const plan = await f.plan(next);
  assert.throws(() => recordSnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /pending/);
  write(f.cwd, 'local-only.txt', 'changed\n');
  commit(f.cwd);
  assert.throws(() => applySnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /HEAD/);
  const fresh = await f.plan(next, 'fresh');
  writeFileSync(join(fresh.outputDir, 'upstream.patch'), 'modified');
  assert.throws(() => applySnapshotSync({ cwd: f.cwd, planDir: fresh.outputDir }), /digest/);
  assert.equal(git(f.cwd, ['status', '--porcelain']), '');
});

test('same-source rule refresh can be recorded without adding ancestors', async (t) => {
  const f = await fixture(t);
  const plan = await f.plan(f.previous);
  assert.equal(applySnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }).status, 'ready');
  assert.equal(git(f.cwd, ['rev-parse', 'HEAD']), f.base);
});

test('history check rejects merge ancestry and a base outside the product history', async (t) => {
  const f = await fixture(t);
  assert.throws(() => checkSyncHistory({ cwd: f.cwd, base: f.previous.source }), /ancestor/);
  const tree = git(f.cwd, ['rev-parse', 'HEAD^{tree}']);
  const merged = git(f.cwd, ['commit-tree', tree, '-p', f.base, '-p', f.previous.source, '-m', 'bad upstream merge']);
  git(f.cwd, ['update-ref', 'HEAD', merged]);
  assert.throws(() => checkSyncHistory({ cwd: f.cwd, base: f.base }), /single.parent/);
});

test('apply rejects dirty worktrees and modified baselines after preparation', async (t) => {
  const f = await fixture(t);
  const next = await f.snapshot({ ...original, 'README.md': 'HeyBuddy v1\n' }, f.previous.source);
  const plan = await f.plan(next);
  write(f.cwd, 'untracked.txt', 'local work');
  assert.throws(() => applySnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /clean/);
  rmSync(join(f.cwd, 'untracked.txt'));
  write(f.cwd, STATE, JSON.stringify({ ...f.state, sourceRef: 'changed' }));
  assert.throws(() => applySnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /baseline/);
  assert.equal(existsSync(join(f.cwd, '.git', 'aibuddy-snapshot-sync.json')), false);
});

test('failed patch application never advances the baseline or permits record', async (t) => {
  const f = await fixture(t);
  rmSync(join(f.cwd, 'README.md'));
  commit(f.cwd, 'Deliberately remove the product README');
  const next = await f.snapshot({ ...original, 'README.md': 'HeyBuddy v1\n' }, f.previous.source);
  const plan = await f.plan(next);
  assert.throws(() => applySnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /application failed/);
  assert.equal(JSON.parse(readFileSync(join(f.cwd, STATE))).sourceCommit, f.previous.source);
  assert.throws(() => recordSnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /pending application/);
  await assert.rejects(f.plan(next, 'retry'), /pending/);
});

test('record rejects changed plans and unstaged resolutions', async (t) => {
  const f = await fixture(t);
  write(f.cwd, 'README.md', 'product change\n');
  commit(f.cwd);
  const next = await f.snapshot({ ...original, 'README.md': 'HeyBuddy v1\n' }, f.previous.source);
  const plan = await f.plan(next);
  applySnapshotSync({ cwd: f.cwd, planDir: plan.outputDir });
  const planFile = join(plan.outputDir, 'plan.json');
  const originalPlan = readFileSync(planFile);
  writeFileSync(planFile, originalPlan + ' ');
  assert.throws(() => recordSnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /pending application/);
  writeFileSync(planFile, originalPlan);
  write(f.cwd, 'README.md', 'resolved\n');
  git(f.cwd, ['add', 'README.md']);
  write(f.cwd, 'README.md', 'unstaged resolution\n');
  assert.throws(() => recordSnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }), /stage all/);
  git(f.cwd, ['add', 'README.md']);
  assert.equal(recordSnapshotSync({ cwd: f.cwd, planDir: plan.outputDir }).status, 'ready');
});

test('rejects tampered snapshots and attempts to overwrite the product state file', async (t) => {
  const f = await fixture(t);
  const next = await f.snapshot({ ...original, 'README.md': 'HeyBuddy v1\n' }, f.previous.source);
  writeFileSync(join(next.output, 'README.md'), 'tampered');
  await assert.rejects(f.plan(next), /digest|size/);
  const reserved = await f.snapshot({ ...original, [STATE]: JSON.stringify(f.state) }, f.previous.source);
  await assert.rejects(f.plan(reserved, 'reserved'), /baseline file/);
});
