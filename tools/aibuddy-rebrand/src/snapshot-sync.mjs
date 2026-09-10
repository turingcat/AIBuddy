import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const UPSTREAM_STATE_PATH = '.aibuddy-upstream.json';
const PENDING_NAME = 'aibuddy-snapshot-sync.json';
const OBJECT_ID = /^[0-9a-f]{40,64}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;

function git(cwd, args, { input, allowFailure = false } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const result = spawnSync('git', args, { cwd, env, input, maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.toString().trim()}`);
  }
  return result;
}
function gitText(cwd, args) {
  return git(cwd, args).stdout.toString().trim();
}
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function gitPath(cwd, name) {
  return resolve(cwd, gitText(cwd, ['rev-parse', '--git-path', name]));
}
function productHead(cwd, { clean = false } = {}) {
  if (realpathSync(cwd) !== realpathSync(gitText(cwd, ['rev-parse', '--show-toplevel']))) {
    throw new Error('run snapshot synchronization from the product repository root');
  }
  const branch = gitText(cwd, ['symbolic-ref', '--short', 'HEAD']);
  if (!branch.startsWith('sync/')) throw new Error('snapshot synchronization requires a sync branch');
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (existsSync(gitPath(cwd, name))) throw new Error(`finish the existing Git operation: ${name}`);
  }
  if (clean && gitText(cwd, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('snapshot synchronization requires a clean worktree and index');
  }
  return gitText(cwd, ['rev-parse', 'HEAD']);
}
function validateState(state) {
  if (state?.schemaVersion !== 1 || state.mode !== 'snapshot-delta') throw new Error('invalid snapshot baseline mode');
  for (const name of ['sourceCommit', 'sourceTree', 'snapshotTree']) {
    if (!OBJECT_ID.test(state[name])) throw new Error(`invalid baseline ${name}`);
  }
  if (!DIGEST.test(state.outputDigest)) throw new Error('invalid baseline outputDigest');
  for (const name of ['sourceRepository', 'sourceRef', 'transformIdentity']) {
    if (typeof state[name] !== 'string' || !state[name]) throw new Error(`missing baseline ${name}`);
  }
  return state;
}
function stateBytes(cwd) {
  const file = join(cwd, UPSTREAM_STATE_PATH);
  if (!lstatSync(file).isFile()) throw new Error('snapshot baseline must be a regular file');
  return readFileSync(file);
}
function snapshotState(previous, snapshot) {
  return {
    schemaVersion: 1, mode: 'snapshot-delta', sourceRepository: previous.sourceRepository,
    sourceRef: previous.sourceRef, sourceCommit: snapshot.sourceCommit,
    sourceTree: snapshot.sourceTree, snapshotTree: snapshot.tree,
    outputDigest: snapshot.outputDigest, transformIdentity: snapshot.transformIdentity,
  };
}
function assertBaseline(state, snapshot) {
  for (const [field, source] of [['sourceCommit', 'sourceCommit'], ['sourceTree', 'sourceTree'], ['snapshotTree', 'tree'], ['outputDigest', 'outputDigest']]) {
    if (state[field] !== snapshot[source]) throw new Error(`previous snapshot does not match recorded baseline: ${field}`);
  }
}
function assertExternalOutput(cwd, outputDir) {
  const target = resolve(outputDir);
  if (existsSync(target)) throw new Error('review output directory already exists');
  const canonical = join(realpathSync(dirname(target)), target.slice(dirname(target).length + 1));
  const distance = relative(realpathSync(cwd), canonical);
  if (!distance.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(distance)) {
    throw new Error('review output must be outside the product worktree');
  }
  return target;
}

export async function prepareSnapshotSync({ cwd = process.cwd(), previousSnapshot, nextSnapshot, outputDir } = {}) {
  cwd = resolve(cwd);
  const expectedHead = productHead(cwd, { clean: true });
  if (existsSync(gitPath(cwd, PENDING_NAME))) throw new Error('finish the pending snapshot synchronization');
  const output = assertExternalOutput(cwd, outputDir);
  const bytes = stateBytes(cwd);
  const state = validateState(JSON.parse(bytes));
  if (!git(cwd, ['show', `HEAD:${UPSTREAM_STATE_PATH}`]).stdout.equals(bytes)) {
    throw new Error('baseline must be committed before synchronization');
  }
  const { materializeSnapshotTree } = await import('./mirror.mjs');
  const previous = await materializeSnapshotTree({ cwd, snapshotDir: previousSnapshot });
  const next = await materializeSnapshotTree({ cwd, snapshotDir: nextSnapshot });
  assertBaseline(state, previous);
  if (git(cwd, ['merge-base', '--is-ancestor', previous.sourceCommit, next.sourceCommit], { allowFailure: true }).status !== 0) {
    throw new Error('next upstream source must be the same commit or a descendant of the baseline source');
  }
  const oldTree = await materializeSnapshotTree({ cwd, snapshotDir: previousSnapshot, writeObjects: true });
  const newTree = await materializeSnapshotTree({ cwd, snapshotDir: nextSnapshot, writeObjects: true });
  if (oldTree.tree !== previous.tree || newTree.tree !== next.tree) throw new Error('snapshot changed during preparation');
  const changedPaths = git(cwd, ['diff', '--name-only', '-z', previous.tree, next.tree]).stdout.toString().split('\0').filter(Boolean);
  if (changedPaths.some((path) => path.toLowerCase() === UPSTREAM_STATE_PATH)) {
    throw new Error('upstream snapshots may not modify the product baseline file');
  }
  const patch = git(cwd, ['diff', '--binary', '--full-index', '--find-renames', '--no-ext-diff', '--no-textconv', previous.tree, next.tree, '--']).stdout;
  const plan = {
    schemaVersion: 1, mode: 'snapshot-delta', expectedHead,
    baselineDigest: digest(bytes), patchDigest: digest(patch),
    previous: state, next: snapshotState(state, next), changedPaths,
  };
  if (productHead(cwd, { clean: true }) !== expectedHead || !stateBytes(cwd).equals(bytes)) {
    throw new Error('product HEAD or baseline changed during preparation');
  }
  mkdirSync(output);
  writeFileSync(join(output, 'upstream.patch'), patch, { flag: 'wx' });
  writeFileSync(join(output, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  return { outputDir: output, changedPaths, sourceCommit: next.sourceCommit, expectedHead };
}

function readPlan(cwd, planDir) {
  const directory = realpathSync(planDir);
  const raw = readFileSync(join(directory, 'plan.json'));
  const plan = JSON.parse(raw);
  if (plan.schemaVersion !== 1 || plan.mode !== 'snapshot-delta' || !OBJECT_ID.test(plan.expectedHead)) {
    throw new Error('invalid snapshot sync plan');
  }
  validateState(plan.previous);
  validateState(plan.next);
  if (!DIGEST.test(plan.baselineDigest) || !DIGEST.test(plan.patchDigest)) throw new Error('invalid plan digest');
  const patch = readFileSync(join(directory, 'upstream.patch'));
  if (digest(patch) !== plan.patchDigest) throw new Error('patch digest does not match the reviewed plan');
  if (productHead(cwd) !== plan.expectedHead) throw new Error('product HEAD changed since preparation');
  if (digest(stateBytes(cwd)) !== plan.baselineDigest) throw new Error('baseline changed since preparation');
  return { directory, plan, patch, planDigest: digest(raw) };
}
function unresolved(cwd) {
  return git(cwd, ['diff', '--name-only', '--diff-filter=U', '-z']).stdout.toString().split('\0').filter(Boolean);
}

export function applySnapshotSync({ cwd = process.cwd(), planDir } = {}) {
  cwd = resolve(cwd);
  const review = readPlan(cwd, planDir);
  productHead(cwd, { clean: true });
  const pendingPath = gitPath(cwd, PENDING_NAME);
  const pending = { directory: review.directory, planDigest: review.planDigest, phase: 'applying' };
  writeFileSync(pendingPath, JSON.stringify(pending), { flag: 'wx' });
  const applied = review.patch.length === 0 ? { status: 0 } : git(cwd,
    ['apply', '--3way', '--index', '--binary', '--whitespace=nowarn', '-'],
    { input: review.patch, allowFailure: true });
  const conflicts = unresolved(cwd);
  pending.phase = applied.status === 0 ? 'applied' : conflicts.length ? 'conflicts' : 'failed';
  writeFileSync(pendingPath, JSON.stringify(pending));
  if (pending.phase === 'failed') throw new Error(`patch application failed; baseline unchanged: ${applied.stderr.toString().trim()}`);
  if (conflicts.length) return { status: 'conflicts', conflicts, sourceCommit: review.plan.previous.sourceCommit };
  return recordSnapshotSync({ cwd, planDir: review.directory });
}

export function recordSnapshotSync({ cwd = process.cwd(), planDir } = {}) {
  cwd = resolve(cwd);
  const review = readPlan(cwd, planDir);
  const pendingPath = gitPath(cwd, PENDING_NAME);
  if (!existsSync(pendingPath)) throw new Error('no pending snapshot application to record');
  const pending = JSON.parse(readFileSync(pendingPath));
  if (pending.directory !== review.directory || pending.planDigest !== review.planDigest || !['applied', 'conflicts'].includes(pending.phase)) {
    throw new Error('pending application does not match the reviewed plan');
  }
  if (unresolved(cwd).length) throw new Error('resolve and stage all unresolved conflicts before recording the baseline');
  if (git(cwd, ['diff', '--quiet'], { allowFailure: true }).status !== 0) {
    throw new Error('stage all resolutions before recording the baseline');
  }
  const file = join(cwd, UPSTREAM_STATE_PATH);
  const previousBytes = stateBytes(cwd);
  try {
    writeFileSync(file, JSON.stringify(review.plan.next, null, 2) + '\n');
    git(cwd, ['add', '--', UPSTREAM_STATE_PATH]);
  } catch (error) {
    writeFileSync(file, previousBytes);
    throw error;
  }
  unlinkSync(pendingPath);
  return { status: 'ready', sourceCommit: review.plan.next.sourceCommit, message: 'Review staged changes, verify product boundaries, then create a normal single-parent commit.' };
}

export function checkSyncHistory({ cwd = process.cwd(), base, head = 'HEAD' } = {}) {
  const baseCommit = gitText(cwd, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]);
  const headCommit = gitText(cwd, ['rev-parse', '--verify', '--end-of-options', `${head}^{commit}`]);
  if (git(cwd, ['merge-base', '--is-ancestor', baseCommit, headCommit], { allowFailure: true }).status !== 0) {
    throw new Error('product base must be an ancestor of the synchronization head');
  }
  const rows = gitText(cwd, ['rev-list', '--parents', `${baseCommit}..${headCommit}`]).split('\n').filter(Boolean);
  for (const row of rows) {
    if (row.split(' ').length !== 2) throw new Error(`synchronization adds a non-single-parent commit: ${row.split(' ')[0]}`);
  }
  return { valid: true, base: baseCommit, head: headCommit, commits: rows.length };
}
