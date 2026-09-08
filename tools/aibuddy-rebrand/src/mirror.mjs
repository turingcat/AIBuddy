import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { verifySnapshot } from './verify.mjs';

const PROVENANCE_PATH = '.aibuddy-rebrand.json';
const DEFAULT_BRANCH = 'upstream/aibuddy-mirror';
const BRIDGE_BRANCH = 'feat/aibuddy-branding';
const HASH_PATTERN = /^[0-9a-f]{40,64}$/u;

function gitEnvironment(indexPath) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith('GIT_')) {
      delete environment[key];
    }
  }
  if (indexPath) {
    environment.GIT_INDEX_FILE = indexPath;
  }
  return environment;
}

function runGit(cwd, args, { allowFailure = false, indexPath, input } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitEnvironment(indexPath),
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`unable to run git: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`git command failed: ${args.join(' ')}${details ? `\n${details}` : ''}`);
  }
  return {
    status: result.status,
    stderr: result.stderr?.trimEnd() ?? '',
    stdout: result.stdout?.trimEnd() ?? '',
  };
}

function gitText(cwd, args, options) {
  return runGit(cwd, args, options).stdout;
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireObjectId(value, name) {
  if (!HASH_PATTERN.test(value ?? '')) {
    throw new Error(`${name} must be a full Git object ID`);
  }
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`);
  }
  return value;
}

function normalizeBranch(branch) {
  requireString(branch, 'branch');
  if (branch.startsWith('refs/') && !branch.startsWith('refs/heads/')) {
    throw new Error('branch must be a local branch name');
  }
  const ref = branch.startsWith('refs/heads/') ? branch : `refs/heads/${branch}`;
  if (!ref.startsWith('refs/heads/')) {
    throw new Error('branch must be a local branch name');
  }
  return {
    name: ref.slice('refs/heads/'.length),
    ref,
  };
}

function validateBranch(cwd, branch) {
  const normalized = normalizeBranch(branch);
  const result = runGit(cwd, ['check-ref-format', normalized.ref], { allowFailure: true });
  if (result.status !== 0) {
    throw new Error(`invalid mirror branch: ${branch}`);
  }
  return normalized;
}

function refExists(cwd, ref) {
  const result = runGit(cwd, ['show-ref', '--verify', '--quiet', ref], { allowFailure: true });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`could not inspect ref ${ref}`);
}

function refCommit(cwd, ref) {
  return requireObjectId(
    gitText(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]),
    `${ref} commit`,
  );
}

function resolveCommit(cwd, commit, name) {
  requireObjectId(commit, name);
  const resolved = requireObjectId(
    gitText(cwd, ['rev-parse', '--verify', '--end-of-options', `${commit}^{commit}`]),
    `${name} resolution`,
  );
  if (resolved !== commit) {
    throw new Error(`${name} is not a full, exact commit ID`);
  }
  return resolved;
}

function commitTree(cwd, commit, name) {
  return requireObjectId(
    gitText(cwd, ['rev-parse', '--verify', '--end-of-options', `${commit}^{tree}`]),
    `${name} tree`,
  );
}

function sourceFromProvenance(cwd, provenance) {
  const sourceCommit = resolveCommit(cwd, provenance.source.commit, 'snapshot source commit');
  const sourceTree = commitTree(cwd, sourceCommit, 'snapshot source commit');
  if (sourceTree !== provenance.source.tree) {
    throw new Error(
      `snapshot provenance source tree does not match ${sourceCommit}: ` +
        `${provenance.source.tree} != ${sourceTree}`,
    );
  }
  return { sourceCommit, sourceTree };
}

async function validateUpstreamSnapshot(cwd, snapshotDir) {
  const verified = await verifySnapshot(resolve(cwd, requireString(snapshotDir, 'snapshotDir')));
  const { provenance } = verified;
  if (provenance.report.input !== 'upstream' || provenance.report.provenance?.input !== 'upstream') {
    throw new Error('mirror snapshot provenance input must be upstream');
  }
  const source = sourceFromProvenance(cwd, provenance);
  return {
    ...source,
    outputDigest: provenance.outputDigest,
    provenance,
    snapshotDir: verified.outputDir,
    transformIdentity: provenance.transformIdentity,
  };
}

function isProvenancePath(path) {
  return path.toLowerCase() === PROVENANCE_PATH.toLowerCase();
}

function rejectForbiddenMirrorPath(path) {
  const components = path.split('/');
  if (components[0].toLowerCase() === '.git') {
    throw new Error(`snapshot contains a forbidden .git path: ${path}`);
  }
}

function readSnapshotEntry(snapshotDir, entry) {
  const entryPath = join(snapshotDir, ...entry.path.split('/'));
  const stat = lstatSync(entryPath);
  if (entry.mode === '120000') {
    if (!stat.isSymbolicLink()) {
      throw new Error(`snapshot entry changed after verification: ${entry.path}`);
    }
    const content = Buffer.from(readlinkSync(entryPath), 'utf8');
    verifySnapshotEntryBytes(entry, content);
    return content;
  }
  if (!stat.isFile()) {
    throw new Error(`snapshot entry changed after verification: ${entry.path}`);
  }
  const content = readFileSync(entryPath);
  verifySnapshotEntryBytes(entry, content);
  return content;
}

function verifySnapshotEntryBytes(entry, content) {
  const digest = createHash('sha256').update(content).digest('hex');
  if (content.length !== entry.size || digest !== entry.digest) {
    throw new Error(`snapshot entry changed after verification: ${entry.path}`);
  }
}

function snapshotEntries(snapshot) {
  return snapshot.provenance.entries
    .filter((entry) => !isProvenancePath(entry.path))
    .map((entry) => {
      rejectForbiddenMirrorPath(entry.path);
      return {
        ...entry,
        content: readSnapshotEntry(snapshot.snapshotDir, entry),
      };
    });
}

function hashObjectFromFile(cwd, filePath) {
  return requireObjectId(
    gitText(cwd, ['hash-object', '-w', '--', filePath]),
    'mirror blob',
  );
}

function gitObjectHash(objectType, content, objectFormat) {
  const header = Buffer.from(`${objectType} ${content.length}\0`, 'ascii');
  const hash = createHash(objectFormat === 'sha256' ? 'sha256' : 'sha1');
  hash.update(header);
  hash.update(content);
  return hash.digest('hex');
}

function treeHash(entries, objectFormat) {
  const root = { files: new Map(), directories: new Map() };
  for (const entry of entries) {
    const components = entry.path.split('/');
    let directory = root;
    for (const component of components.slice(0, -1)) {
      if (!directory.directories.has(component)) {
        directory.directories.set(component, { files: new Map(), directories: new Map() });
      }
      directory = directory.directories.get(component);
    }
    const name = components.at(-1);
    if (directory.files.has(name) || directory.directories.has(name)) {
      throw new Error(`snapshot entries collide while building a Git tree: ${entry.path}`);
    }
    directory.files.set(name, entry);
  }

  function hashDirectory(directory) {
    const records = [];
    for (const [name, entry] of directory.files) {
      records.push({
        key: Buffer.from(name),
        mode: entry.mode,
        name,
        objectId: Buffer.from(entry.blob, 'hex'),
      });
    }
    for (const [name, child] of directory.directories) {
      records.push({
        key: Buffer.concat([Buffer.from(name), Buffer.from('/')]),
        mode: '40000',
        name,
        objectId: Buffer.from(hashDirectory(child), 'hex'),
      });
    }
    records.sort((left, right) => Buffer.compare(left.key, right.key));
    const body = Buffer.concat(
      records.map((record) => Buffer.concat([
        Buffer.from(`${record.mode} ${record.name}\0`, 'utf8'),
        record.objectId,
      ])),
    );
    return gitObjectHash('tree', body, objectFormat);
  }

  return hashDirectory(root);
}

function writeSnapshotTree(cwd, snapshot, { writeObjects }) {
  const entries = snapshotEntries(snapshot);
  const objectFormat = gitText(cwd, ['rev-parse', '--show-object-format']);
  if (!writeObjects) {
    for (const entry of entries) {
      entry.blob = gitObjectHash('blob', entry.content, objectFormat);
    }
    return treeHash(entries, objectFormat);
  }

  const blobDirectory = mkdtempSync(join(tmpdir(), 'aibuddy-mirror-blobs-'));
  const indexDirectory = mkdtempSync(join(tmpdir(), 'aibuddy-mirror-index-'));
  const indexPath = join(indexDirectory, 'index');
  try {
    runGit(cwd, ['read-tree', '--empty'], { indexPath });
    for (const [index, entry] of entries.entries()) {
      const blobPath = join(blobDirectory, `blob-${index}`);
      writeFileSync(blobPath, entry.content, { mode: 0o600 });
      const objectId = hashObjectFromFile(cwd, blobPath);
      runGit(cwd, [
        'update-index',
        '--add',
        '--cacheinfo',
        `${entry.mode},${objectId},${entry.path}`,
      ], { indexPath });
    }
    return requireObjectId(gitText(cwd, ['write-tree'], { indexPath }), 'mirror tree');
  } finally {
    rmSync(indexDirectory, { force: true, recursive: true });
    rmSync(blobDirectory, { force: true, recursive: true });
  }
}

function commitMessage(snapshot, tree, parent) {
  const { provenance } = snapshot;
  const lines = [
    'Transformed upstream mirror',
    '',
    'Mirror-Input: upstream',
    `Upstream-Commit: ${provenance.source.commit}`,
    `Upstream-Tree: ${provenance.source.tree}`,
    `Mirror-Source-Commit: ${provenance.source.commit}`,
    `Mirror-Source-Tree: ${provenance.source.tree}`,
    `Mirror-Tree: ${tree}`,
    `Mirror-Output-Digest: ${provenance.outputDigest}`,
    `Mirror-Transform-Identity: ${provenance.transformIdentity}`,
  ];
  if (parent) {
    lines.push(`Mirror-Parent: ${parent.commit}`);
    lines.push(`Mirror-Parent-Source-Commit: ${parent.sourceCommit}`);
  }
  return `${lines.join('\n')}\n`;
}

function createCommit(cwd, tree, parents, message) {
  return requireObjectId(
    gitText(cwd, [
      'commit-tree',
      tree,
      ...parents.flatMap((parent) => ['-p', parent]),
      '-F',
      '-',
    ], { input: message }),
    'mirror commit',
  );
}

function commitMessageText(cwd, commit) {
  return gitText(cwd, ['show', '-s', '--format=%B', '--no-renames', commit]);
}

function trailer(message, name) {
  const match = message.match(new RegExp(`^${name}: ([0-9a-f]+)$`, 'mu'));
  return match?.[1];
}

function inspectMirrorCommit(cwd, commit) {
  const exactCommit = resolveCommit(cwd, commit, 'mirror parent');
  if (gitText(cwd, ['cat-file', '-t', exactCommit]) !== 'commit') {
    throw new Error(`mirror parent is not a commit: ${exactCommit}`);
  }
  const message = commitMessageText(cwd, exactCommit);
  const sourceCommit = trailer(message, 'Mirror-Source-Commit');
  const sourceTree = trailer(message, 'Mirror-Source-Tree');
  if (!sourceCommit || !sourceTree || !message.includes('Mirror-Input: upstream')) {
    throw new Error(`mirror parent has no upstream provenance trailers: ${exactCommit}`);
  }
  const exactSourceCommit = resolveCommit(cwd, sourceCommit, 'mirror parent source commit');
  const exactSourceTree = commitTree(cwd, exactSourceCommit, 'mirror parent source commit');
  if (exactSourceTree !== sourceTree) {
    throw new Error(`mirror parent source tree does not match its source commit: ${exactCommit}`);
  }
  return {
    commit: exactCommit,
    sourceCommit: exactSourceCommit,
    sourceTree: requireObjectId(sourceTree, 'mirror parent source tree'),
    tree: commitTree(cwd, exactCommit, 'mirror parent'),
  };
}

function assertAncestor(cwd, oldCommit, newCommit) {
  const result = runGit(cwd, ['merge-base', '--is-ancestor', oldCommit, newCommit], {
    allowFailure: true,
  });
  if (result.status !== 0) {
    throw new Error(`upstream source commit ${oldCommit} is not an ancestor of ${newCommit}`);
  }
}

function updateRefCas(cwd, ref, commit, expected) {
  const objectFormat = gitText(cwd, ['rev-parse', '--show-object-format']);
  const zero = '0'.repeat(objectFormat === 'sha256' ? 64 : 40);
  try {
    runGit(cwd, ['update-ref', '--no-deref', ref, commit, expected ?? zero]);
  } catch (error) {
    throw new Error(`CAS ref update refused for ${ref}: ${error.message}`);
  }
}

function baseResult({ branch, dryRun, mirrorCommit, tree: mirrorTree, snapshot, message }) {
  return {
    branch,
    commit: mirrorCommit,
    dryRun,
    message,
    mirrorCommit,
    mirrorTree,
    outputDigest: snapshot.outputDigest,
    sourceCommit: snapshot.sourceCommit,
    sourceTree: snapshot.sourceTree,
    transformIdentity: snapshot.transformIdentity,
    tree: mirrorTree,
  };
}

export async function prepareMirror({
  cwd = process.cwd(),
  snapshotDir,
  branch = DEFAULT_BRANCH,
  dryRun = true,
} = {}) {
  requireBoolean(dryRun, 'dryRun');
  const normalizedBranch = validateBranch(cwd, branch);
  if (refExists(cwd, normalizedBranch.ref)) {
    throw new Error(`mirror branch already exists; refusing overwrite: ${normalizedBranch.ref}`);
  }
  const snapshot = await validateUpstreamSnapshot(cwd, snapshotDir);
  const mirrorTree = writeSnapshotTree(cwd, snapshot, { writeObjects: !dryRun });
  const message = commitMessage(snapshot, mirrorTree);
  const mirrorCommit = dryRun ? null : createCommit(cwd, mirrorTree, [], message);
  if (mirrorCommit) {
    updateRefCas(cwd, normalizedBranch.ref, mirrorCommit);
  }
  return baseResult({
    branch: normalizedBranch.name,
    dryRun,
    mirrorCommit,
    message,
    snapshot,
    tree: mirrorTree,
  });
}

export async function appendMirror({
  cwd = process.cwd(),
  snapshotDir,
  branch = DEFAULT_BRANCH,
  parentMirror,
  parentCommit,
  previousMirror,
  expectedRef,
  dryRun = true,
  sameVersionRuleUpdate = false,
} = {}) {
  requireBoolean(dryRun, 'dryRun');
  requireBoolean(sameVersionRuleUpdate, 'sameVersionRuleUpdate');
  const normalizedBranch = validateBranch(cwd, branch);
  if (!refExists(cwd, normalizedBranch.ref)) {
    throw new Error(`mirror branch does not exist: ${normalizedBranch.ref}`);
  }
  const parent = parentMirror ?? parentCommit ?? previousMirror;
  requireString(parent, 'parentMirror');
  const parentInfo = inspectMirrorCommit(cwd, parent);
  const currentRef = refCommit(cwd, normalizedBranch.ref);
  const expected = expectedRef ?? parentInfo.commit;
  if (expected !== currentRef || currentRef !== parentInfo.commit) {
    throw new Error(
      `mirror branch tip does not match expected previous mirror: ` +
        `${currentRef} != ${expected} != ${parentInfo.commit}`,
    );
  }
  resolveCommit(cwd, expected, 'expectedRef');

  const snapshot = await validateUpstreamSnapshot(cwd, snapshotDir);
  if (snapshot.sourceCommit === parentInfo.sourceCommit) {
    if (!sameVersionRuleUpdate) {
      throw new Error('same upstream source commit requires sameVersionRuleUpdate=true');
    }
  } else {
    assertAncestor(cwd, parentInfo.sourceCommit, snapshot.sourceCommit);
  }

  const mirrorTree = writeSnapshotTree(cwd, snapshot, { writeObjects: !dryRun });
  const message = commitMessage(snapshot, mirrorTree, parentInfo);
  const mirrorCommit = dryRun ? null : createCommit(cwd, mirrorTree, [parentInfo.commit], message);
  if (mirrorCommit) {
    updateRefCas(cwd, normalizedBranch.ref, mirrorCommit, expected);
  }
  return {
    ...baseResult({
      branch: normalizedBranch.name,
      dryRun,
      mirrorCommit,
      message,
      snapshot,
      tree: mirrorTree,
    }),
    parentCommit: parentInfo.commit,
    parentSourceCommit: parentInfo.sourceCommit,
  };
}

function assertCleanBridgeWorktree(cwd) {
  for (const args of [
    ['diff', '--quiet'],
    ['diff', '--cached', '--quiet'],
  ]) {
    if (runGit(cwd, args, { allowFailure: true }).status !== 0) {
      throw new Error('bridge requires a clean tracked worktree and index');
    }
  }
  const untracked = gitText(cwd, ['ls-files', '--others', '--exclude-standard']);
  if (untracked) {
    throw new Error('bridge refuses untracked files, including tooling and documentation');
  }
}

function pathIsInside(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`));
}

function readMigrationProof(cwd, migrationProofPath) {
  const requestedPath = requireString(migrationProofPath, 'migrationProofPath');
  if (!isAbsolute(requestedPath)) {
    throw new Error('migrationProofPath must be absolute');
  }
  const proofPath = resolve(requestedPath);
  const repositoryRoot = resolve(gitText(cwd, ['rev-parse', '--show-toplevel']));
  const stat = lstatSync(proofPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('migration proof must be a regular file, not a symlink');
  }
  const realProofPath = realpathSync(proofPath);
  if (pathIsInside(repositoryRoot, proofPath) || pathIsInside(repositoryRoot, realProofPath)) {
    throw new Error('migration proof must be outside the repository worktree');
  }
  const content = readFileSync(proofPath);
  const digest = createHash('sha256').update(content).digest('hex');
  let proof;
  try {
    proof = JSON.parse(content);
  } catch (error) {
    throw new Error(`migration proof is invalid JSON: ${error.message}`);
  }
  return { digest, path: proofPath, proof };
}

function validateProofKeys(proof) {
  const expectedKeys = [
    'expectedProductCommit',
    'expectedProductTree',
    'initialRename',
    'knownProductPatches',
    'mirrorInput',
    'schemaVersion',
  ];
  if (
    proof === null ||
    typeof proof !== 'object' ||
    Array.isArray(proof) ||
    Object.keys(proof).sort().join('\0') !== expectedKeys.sort().join('\0')
  ) {
    throw new Error('migration proof has an unexpected schema or possible secret-bearing fields');
  }
  if (
    proof.mirrorInput === null ||
    typeof proof.mirrorInput !== 'object' ||
    Array.isArray(proof.mirrorInput) ||
    Object.keys(proof.mirrorInput).sort().join('\0') !== 'productInputCommit\0upstreamCommit'
  ) {
    throw new Error('migration proof mirrorInput has an unexpected schema');
  }
  if (
    proof.schemaVersion !== 1 ||
    proof.initialRename !== true ||
    !Array.isArray(proof.knownProductPatches) ||
    proof.knownProductPatches.some(
      (patch) => typeof patch !== 'string' || patch.length === 0 || /[\u0000-\u001f\u007f]/u.test(patch),
    )
  ) {
    throw new Error('migration proof must record the initial rename and safe known product patches');
  }
}

function validateMigrationProof(cwd, proofArtifact, expectedProductCommit, productTree, mirrorInfo) {
  const { proof } = proofArtifact;
  validateProofKeys(proof);
  if (proof.expectedProductCommit !== expectedProductCommit || proof.expectedProductTree !== productTree) {
    throw new Error('migration proof does not match the expected product baseline commit and tree');
  }
  const upstreamCommit = proof.mirrorInput.upstreamCommit;
  const productInputCommit = proof.mirrorInput.productInputCommit;
  requireObjectId(upstreamCommit, 'migration proof upstream input commit');
  requireObjectId(productInputCommit, 'migration proof product input commit');
  resolveCommit(cwd, upstreamCommit, 'migration proof upstream input commit');
  resolveCommit(cwd, productInputCommit, 'migration proof product input commit');
  assertAncestor(cwd, upstreamCommit, productInputCommit);
  if (mirrorInfo.sourceCommit !== upstreamCommit) {
    throw new Error('migration proof upstream input does not match mirror provenance');
  }
  return {
    knownProductPatchesDigest: createHash('sha256')
      .update(JSON.stringify(proof.knownProductPatches))
      .digest('hex'),
    productInputCommit,
    upstreamCommit,
  };
}

export async function establishBridge({
  cwd = process.cwd(),
  mirrorCommit,
  expectedProductCommit,
  dryRun = true,
  approve = false,
  expectedTree,
  migrationProofPath,
} = {}) {
  requireBoolean(dryRun, 'dryRun');
  requireBoolean(approve, 'approve');
  const currentBranch = gitText(cwd, ['branch', '--show-current']);
  if (currentBranch !== BRIDGE_BRANCH) {
    throw new Error(`bridge is restricted to ${BRIDGE_BRANCH}; current branch is ${currentBranch || 'detached'}`);
  }
  assertCleanBridgeWorktree(cwd);
  const productCommit = resolveCommit(cwd, requireString(expectedProductCommit, 'expectedProductCommit'), 'expectedProductCommit');
  if (refCommit(cwd, 'HEAD') !== productCommit) {
    throw new Error('bridge HEAD must equal expectedProductCommit');
  }
  const mirrorInfo = inspectMirrorCommit(cwd, requireString(mirrorCommit, 'mirrorCommit'));
  const productTree = commitTree(cwd, productCommit, 'expected product commit');
  const proofArtifact = readMigrationProof(cwd, migrationProofPath);
  const reviewedInputs = validateMigrationProof(cwd, proofArtifact, productCommit, productTree, {
    ...mirrorInfo,
  });

  const review = {
    action: approve && !dryRun ? 'create' : 'review',
    branch: BRIDGE_BRANCH,
    dryRun,
    expectedProductCommit: productCommit,
    mirrorCommit: mirrorInfo.commit,
    mirrorTree: mirrorInfo.tree,
    parentTree: productTree,
    parents: [productCommit, mirrorInfo.commit],
    proofDigest: proofArtifact.digest,
    productTree,
    reviewedInputs,
    tree: productTree,
  };
  if (!approve || dryRun) {
    return review;
  }
  if (expectedTree !== productTree) {
    throw new Error(`bridge approval expected tree ${expectedTree}, actual product tree is ${productTree}`);
  }

  const bridgeCommit = createCommit(
    cwd,
    productTree,
    [productCommit, mirrorInfo.commit],
    [
      'Reviewed transformed-upstream bootstrap bridge',
      '',
      `Bridge-Product-Commit: ${productCommit}`,
      `Bridge-Mirror-Commit: ${mirrorInfo.commit}`,
      `Bridge-Tree: ${productTree}`,
      `Bridge-Proof-SHA256: ${proofArtifact.digest}`,
      `Bridge-Upstream-Commit: ${reviewedInputs.upstreamCommit}`,
      `Bridge-Product-Input-Commit: ${reviewedInputs.productInputCommit}`,
      'Bridge-Initial-Rename: true',
      `Bridge-Known-Product-Patches-SHA256: ${reviewedInputs.knownProductPatchesDigest}`,
    ].join('\n') + '\n',
  );
  const branchRef = `refs/heads/${BRIDGE_BRANCH}`;
  updateRefCas(cwd, branchRef, bridgeCommit, productCommit);
  return {
    ...review,
    action: 'created',
    bridgeCommit,
  };
}

export const mirrorConstants = Object.freeze({
  BRIDGE_BRANCH,
  DEFAULT_BRANCH,
  PROVENANCE_PATH,
});
