import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { BRAND_MAP } from './brand-map.mjs';
import { PROVENANCE_PATH, readSnapshot } from './generate.mjs';
import { verifySnapshot } from './verify.mjs';

const DEFAULT_BRANCH = 'feat/aibuddy-branding';
const APPLY_LOCK_PATH = '.aibuddy-rebrand.apply.lock';
const MODES = new Set(['100644', '100755', '120000']);

function gitEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith('GIT_')) delete environment[key];
  }
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_SYSTEM = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_TERMINAL_PROMPT = '0';
  return environment;
}

function runGit(cwd, args, input) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'buffer',
    env: gitEnvironment(),
    input,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw new Error(`unable to run git: ${result.error.message}`);
  if (result.status !== 0) {
    const details = result.stderr?.toString('utf8').trim();
    throw new Error(`git ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function gitText(cwd, args) {
  const text = runGit(cwd, args).toString('utf8');
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

function isAncestor(cwd, ancestor, descendant) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd,
    env: gitEnvironment(),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (result.error) throw new Error(`unable to run git merge-base: ${result.error.message}`);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const details = result.stderr?.toString('utf8').trim();
  throw new Error(`git merge-base --is-ancestor failed${details ? `: ${details}` : ''}`);
}

function lstatIfExists(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function safePath(path) {
  return typeof path === 'string'
    && path.length > 0
    && !path.startsWith('/')
    && !/^[A-Za-z]:/u.test(path)
    && !path.includes('\\')
    && !path.includes('\0')
    && !path.includes(':')
    && !path.split('/').some((part) => part.length === 0 || part === '.' || part === '..');
}

function pathKey(path) {
  return path.toLocaleLowerCase('en-US');
}

function validateControlPaths(paths) {
  if (!Array.isArray(paths)) throw new Error('preservedControlPaths must be an array');
  const result = new Set();
  for (const path of paths) {
    if (!safePath(path)) throw new Error(`preserved control path is unsafe: ${path}`);
    const key = pathKey(path);
    if (result.has(key)) throw new Error(`duplicate preserved control path: ${path}`);
    result.add(key);
  }
  return new Set(paths);
}

function modeForStat(stat, path) {
  if (stat.isSymbolicLink()) return '120000';
  const permissions = stat.mode & 0o777;
  if (permissions === 0o644) return '100644';
  if (permissions === 0o755) return '100755';
  throw new Error(`unsupported file mode for ${path}: ${permissions.toString(8)}`);
}

function cloneEntry(entry) {
  return entry && {
    content: Buffer.from(entry.content),
    mode: entry.mode,
    path: entry.path,
  };
}

function entriesEqual(left, right) {
  if (left === null || right === null) return left === right;
  return Boolean(left && right)
    && left.mode === right.mode
    && Buffer.from(left.content).equals(Buffer.from(right.content));
}

function digestBytes(content) {
  return createHash('sha256').update(content).digest('hex');
}

function parseGitTree(output) {
  const records = [];
  let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(0, offset);
    const recordEnd = end === -1 ? output.length : end;
    const record = output.subarray(offset, recordEnd);
    offset = recordEnd + 1;
    if (record.length === 0) continue;
    const tab = record.indexOf(0x09);
    if (tab === -1) throw new Error('git ls-tree returned a malformed entry');
    const metadata = record.subarray(0, tab).toString('ascii').trim().split(/\s+/u);
    if (metadata.length !== 4) throw new Error('git ls-tree returned an unexpected entry');
    const [mode, type, objectId] = metadata;
    if (!MODES.has(mode) || type !== 'blob') {
      throw new Error(`unsupported baseline Git entry: ${record.toString('utf8')}`);
    }
    const path = record.subarray(tab + 1).toString('utf8');
    if (!safePath(path)) throw new Error(`unsafe baseline Git path: ${path}`);
    records.push({ mode, objectId, path });
  }
  return records;
}

function readGitBlobs(cwd, records) {
  if (records.length === 0) return [];
  const output = runGit(
    cwd,
    ['cat-file', '--batch'],
    Buffer.from(`${records.map((record) => record.objectId).join('\n')}\n`, 'ascii'),
  );
  const entries = [];
  let offset = 0;
  for (const record of records) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd === -1) throw new Error(`git cat-file returned no header for ${record.path}`);
    const [objectId, type, sizeText] = output.subarray(offset, headerEnd).toString('ascii').split(/\s+/u);
    const size = Number(sizeText);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (objectId !== record.objectId || type !== 'blob' || !Number.isSafeInteger(size)
      || size < 0 || contentEnd >= output.length || output[contentEnd] !== 0x0a) {
      throw new Error(`git cat-file returned an invalid blob for ${record.path}`);
    }
    entries.push({
      content: Buffer.from(output.subarray(contentStart, contentEnd)),
      mode: record.mode,
      path: record.path,
    });
    offset = contentEnd + 1;
  }
  return entries;
}

function readGitTree(cwd, commit) {
  const records = parseGitTree(runGit(cwd, ['ls-tree', '--full-tree', '-r', '-z', '-l', commit]));
  return readGitBlobs(cwd, records);
}

function workingEntry(root, relativePath) {
  let current = root;
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    const stat = lstatIfExists(current);
    if (!stat) return null;
    if (index < parts.length - 1 && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new Error(`path has an unsafe ancestor: ${relativePath}`);
    }
    if (index === parts.length - 1) {
      if (stat.isSymbolicLink()) {
        return { content: Buffer.from(readlinkSync(current), 'utf8'), mode: '120000', path: relativePath };
      }
      if (!stat.isFile()) throw new Error(`path is not a regular file or symlink: ${relativePath}`);
      return { content: readFileSync(current), mode: modeForStat(stat, relativePath), path: relativePath };
    }
  }
  return null;
}

function assertSafeParents(root, relativePath) {
  let current = root;
  const parts = relativePath.split('/').slice(0, -1);
  for (const part of parts) {
    current = join(current, part);
    const stat = lstatIfExists(current);
    if (stat?.isSymbolicLink()) {
      throw new Error(`path has a symlink ancestor: ${relativePath}`);
    }
    if (stat && !stat.isDirectory()) {
      throw new Error(`path has an unsafe ancestor: ${relativePath}`);
    }
  }
}

function ensureParents(root, relativePath) {
  let current = root;
  const parts = relativePath.split('/').slice(0, -1);
  for (const part of parts) {
    current = join(current, part);
    const stat = lstatIfExists(current);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`path has an unsafe ancestor: ${relativePath}`);
      }
    } else {
      mkdirSync(current, { mode: 0o755 });
    }
  }
}

function captureSnapshotOutput(outputDir, provenance) {
  const entries = provenance.entries.map((manifestEntry) => {
    const entry = workingEntry(outputDir, manifestEntry.path);
    if (!entry) throw new Error(`verified snapshot entry disappeared: ${manifestEntry.path}`);
    if (entry.mode !== manifestEntry.mode
      || entry.content.length !== manifestEntry.size
      || digestBytes(entry.content) !== manifestEntry.digest) {
      throw new Error(`verified snapshot entry changed while applying: ${manifestEntry.path}`);
    }
    return entry;
  });
  const markerContent = readFileSync(join(outputDir, PROVENANCE_PATH));
  const markerText = markerContent.toString('utf8');
  const canonicalMarker = `${JSON.stringify(provenance, null, 2)}\n`;
  if (markerText !== canonicalMarker) {
    throw new Error('snapshot provenance marker changed while applying');
  }
  return {
    entries,
    marker: { content: markerContent, mode: '100644', path: PROVENANCE_PATH },
  };
}

function buildMapping(sourceEntries, outputEntries, report) {
  const sourcePaths = new Set(sourceEntries.map((entry) => entry.path));
  const outputByPath = new Map(outputEntries.map((entry) => [entry.path, entry]));
  const mapping = new Map();
  const owners = new Map();
  const reportEntries = report?.entries;

  if (reportEntries !== undefined && !Array.isArray(reportEntries)) {
    throw new Error('snapshot provenance report entries must be an array');
  }

  for (const reportEntry of reportEntries ?? []) {
    if (!reportEntry || typeof reportEntry !== 'object' || !safePath(reportEntry.inputPath)) {
      throw new Error('snapshot provenance contains an invalid input path mapping');
    }
    if (!sourcePaths.has(reportEntry.inputPath) || mapping.has(reportEntry.inputPath)) {
      throw new Error(`snapshot provenance contains a duplicate or unknown input path: ${reportEntry.inputPath}`);
    }
    const outputPath = reportEntry.outputPath ?? null;
    if (outputPath !== null && !safePath(outputPath)) {
      throw new Error(`snapshot provenance contains an unsafe output path: ${outputPath}`);
    }
    if (outputPath !== null) {
      if (!outputByPath.has(outputPath)) {
        throw new Error(`snapshot provenance output path is missing: ${outputPath}`);
      }
      if (owners.has(outputPath)) {
        throw new Error(`snapshot provenance maps multiple inputs to ${outputPath}`);
      }
      owners.set(outputPath, reportEntry.inputPath);
    }
    mapping.set(reportEntry.inputPath, outputPath);
  }

  for (const sourceEntry of sourceEntries) {
    if (!mapping.has(sourceEntry.path)) {
      mapping.set(sourceEntry.path, outputByPath.has(sourceEntry.path) ? sourceEntry.path : null);
    }
  }

  for (const outputEntry of outputEntries) {
    if (!owners.has(outputEntry.path)) {
      const inferred = mapping.get(outputEntry.path);
      if (inferred !== outputEntry.path) {
        throw new Error(`snapshot output path is not mapped from the verified source: ${outputEntry.path}`);
      }
      owners.set(outputEntry.path, outputEntry.path);
    }
  }
  return { mapping, outputByPath, sourcePaths };
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function makePlan({ baselineByPath, mapping, outputByPath, sourcePaths, controlPaths }) {
  const changed = [];
  const renamed = [];
  const added = [];
  const deleted = [];
  const writes = [];
  const deletes = [];

  for (const [sourcePath, targetPath] of mapping) {
    if (controlPaths.has(sourcePath)) continue;
    if (targetPath === null) {
      if (baselineByPath.has(sourcePath)) {
        deleted.push(sourcePath);
        deletes.push(sourcePath);
      }
      continue;
    }
    if (controlPaths.has(targetPath)) {
      throw new Error(`snapshot output targets preserved control path: ${targetPath}`);
    }
    const outputEntry = outputByPath.get(targetPath);
    if (!outputEntry) throw new Error(`snapshot output is missing mapped path: ${targetPath}`);
    const baselineEntry = baselineByPath.get(targetPath);
    if (!baselineEntry) {
      if (!baselineByPath.has(sourcePath)) {
        throw new Error(`snapshot would resurrect a path absent from H0: ${sourcePath}`);
      }
      renamed.push({ from: sourcePath, to: targetPath });
      added.push(targetPath);
      deleted.push(sourcePath);
      writes.push(outputEntry);
      deletes.push(sourcePath);
      continue;
    }
    if (targetPath !== sourcePath) {
      if (!sourcePaths.has(targetPath)) {
        renamed.push({ from: sourcePath, to: targetPath });
        added.push(targetPath);
      } else {
        renamed.push({ from: sourcePath, to: targetPath });
      }
      if (baselineByPath.has(sourcePath)) deleted.push(sourcePath);
      if (!entriesEqual(baselineEntry, outputEntry)) writes.push(outputEntry);
      if (baselineByPath.has(sourcePath)) deletes.push(sourcePath);
      continue;
    }
    if (!entriesEqual(baselineEntry, outputEntry)) {
      changed.push(targetPath);
      writes.push(outputEntry);
    }
  }

  return {
    added: sorted(new Set(added)),
    changed: sorted(new Set(changed)),
    deleted: sorted(new Set(deleted)),
    deletes: [...new Set(deletes)],
    renamed: renamed.sort((left, right) => left.from.localeCompare(right.from)),
    writes,
  };
}

function assertDestinations(root, plan, baselineByPath, sourcePaths) {
  for (const entry of plan.writes) {
    assertSafeParents(root, entry.path);
    const existing = workingEntry(root, entry.path);
    if (existing && (!baselineByPath.has(entry.path) || !sourcePaths.has(entry.path))) {
      throw new Error(`destination collision: ${entry.path}`);
    }
  }
  for (const path of plan.deletes) assertSafeParents(root, path);
  const marker = join(root, PROVENANCE_PATH);
  if (lstatIfExists(marker)) throw new Error(`destination collision: ${PROVENANCE_PATH}`);
}

function writeAll(fd, content) {
  let offset = 0;
  while (offset < content.length) offset += writeSync(fd, content, offset, content.length - offset);
}

function temporaryName(parent, name) {
  return join(parent, `.${name}.aibuddy-rebrand-${randomBytes(8).toString('hex')}`);
}

function writeAtomic(root, entry, { replaceExisting }) {
  ensureParents(root, entry.path);
  const destination = join(root, ...entry.path.split('/'));
  const parent = dirname(destination);
  let temporary;
  let fd;
  try {
    temporary = temporaryName(parent, entry.path.split('/').at(-1));
    if (entry.mode === '120000') {
      symlinkSync(entry.content.toString('utf8'), temporary);
    } else {
      const permissions = entry.mode === '100755' ? 0o755 : 0o644;
      fd = openSync(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        permissions,
      );
      writeAll(fd, entry.content);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      chmodSync(temporary, permissions);
    }
    if (replaceExisting) {
      renameSync(temporary, destination);
    } else {
      linkSync(temporary, destination);
      unlinkSync(temporary);
    }
    temporary = undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (temporary) {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
}

function removeFile(root, relativePath) {
  const absolutePath = join(root, ...relativePath.split('/'));
  const stat = lstatIfExists(absolutePath);
  if (!stat) return;
  if (stat.isDirectory()) throw new Error(`refusing to delete directory: ${relativePath}`);
  unlinkSync(absolutePath);
}

function pruneEmptyParents(root, deletedPaths) {
  const directories = new Set();
  for (const relativePath of deletedPaths) {
    let current = dirname(join(root, ...relativePath.split('/')));
    while (current !== root) {
      directories.add(current);
      current = dirname(current);
    }
  }

  const deepestFirst = [...directories].sort(
    (left, right) => right.split('/').length - left.split('/').length,
  );
  for (const directory of deepestFirst) {
    try {
      rmdirSync(directory);
    } catch (error) {
      if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error;
    }
  }
}

function restore(root, backups, writtenVersions) {
  const errors = [];
  const preserved = [];
  for (const [path, entry] of [...backups.entries()].reverse()) {
    if (!writtenVersions.has(path)) continue;
    try {
      const current = workingEntry(root, path);
      if (!entriesEqual(current, writtenVersions.get(path))) {
        preserved.push(path);
        continue;
      }
      if (entry === null) removeFile(root, path);
      else writeAtomic(root, entry, { replaceExisting: current !== null });
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`rollback failed: ${errors.join('; ')}`
      + (preserved.length > 0 ? `; preserved external changes at: ${preserved.join(', ')}` : ''));
  }
  return preserved;
}

function acquireApplyLock(root) {
  const path = join(root, APPLY_LOCK_PATH);
  let fd;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  } catch (error) {
    throw new Error(`could not acquire cooperative apply lock ${path}: ${error.message}`);
  }
  return { fd, path };
}

function releaseApplyLock(lock) {
  closeSync(lock.fd);
  unlinkSync(lock.path);
}

function assertCurrent(root, path, expected, operation) {
  const actual = workingEntry(root, path);
  if (!entriesEqual(actual, expected)) {
    throw new Error(`worktree changed during apply before ${operation}: ${path}`);
  }
}

function assertWrittenVersions(root, writtenVersions, operation) {
  for (const [path, expected] of writtenVersions) {
    assertCurrent(root, path, expected, operation);
  }
}

export async function applySnapshot({
  cwd = process.cwd(),
  outputDir,
  dryRun = true,
  expectedBranch = DEFAULT_BRANCH,
  preservedControlPaths = [],
  beforeMutation,
} = {}) {
  const verified = await verifySnapshot(outputDir);
  if (typeof dryRun !== 'boolean') throw new Error('dryRun must be a boolean');
  if (typeof expectedBranch !== 'string' || expectedBranch.length === 0) {
    throw new Error('expectedBranch must be a non-empty branch name');
  }
  if (
    !BRAND_MAP.allowedApplyBranchPrefixes.some(
      (prefix) => expectedBranch.startsWith(prefix) && expectedBranch.length > prefix.length,
    )
  ) {
    throw new Error(
      `expectedBranch must start with ${BRAND_MAP.allowedApplyBranchPrefixes.join(' or ')}`,
    );
  }
  if (beforeMutation !== undefined && typeof beforeMutation !== 'function') {
    throw new Error('beforeMutation must be a function');
  }

  const controlPaths = validateControlPaths(preservedControlPaths);
  const root = realpathSync(resolve(cwd));
  const gitRoot = realpathSync(gitText(root, ['rev-parse', '--show-toplevel']));
  if (gitRoot !== root) throw new Error(`cwd must be the Git worktree root: ${root}`);

  const lock = acquireApplyLock(root);
  try {
    try {
      let actualBranch;
      try {
        actualBranch = gitText(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
      } catch {
        throw new Error('applySnapshot requires a named feature branch');
      }
      if (
        !BRAND_MAP.allowedApplyBranchPrefixes.some(
          (prefix) => actualBranch.startsWith(prefix) && actualBranch.length > prefix.length,
        )
      ) {
        throw new Error(`applySnapshot refuses unsupported branch ${actualBranch}`);
      }
      if (actualBranch !== expectedBranch) {
        throw new Error(`current branch ${actualBranch} does not match expected branch ${expectedBranch}`);
      }

      const headCommit = gitText(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
      const headTree = gitText(root, ['rev-parse', '--verify', `${headCommit}^{tree}`]);
      const sourceCommit = verified.provenance.source.commit;
      const sourceTree = verified.provenance.source.tree;
      const source = readSnapshot({ cwd: root, sourceRef: sourceCommit });
      if (source.commit !== sourceCommit || source.tree !== sourceTree) {
        throw new Error('snapshot provenance source no longer resolves to the recorded Git tree');
      }
      if (!isAncestor(root, sourceCommit, headCommit)) {
        throw new Error(`snapshot source commit ${sourceCommit} is not an ancestor of HEAD ${headCommit}`);
      }

      const baseline = source.entries;
      const baselineByPath = new Map(baseline.map((entry) => [entry.path, entry]));
      for (const entry of baseline) {
        if (controlPaths.has(entry.path)) continue;
        const actual = workingEntry(root, entry.path);
        if (!entriesEqual(actual, entry)) {
          throw new Error(`tracked baseline path changed from H0: ${entry.path}`);
        }
      }

      for (const entry of readGitTree(root, headCommit)) {
        if (!baselineByPath.has(entry.path) && !controlPaths.has(entry.path)) {
          throw new Error(`tracked path is outside H0 and not an explicitly preserved control path: ${entry.path}`);
        }
      }

      if (beforeMutation) await beforeMutation({ kind: 'capture' });
      const capturedOutput = captureSnapshotOutput(verified.outputDir, verified.provenance);
      const { mapping, outputByPath, sourcePaths } = buildMapping(
        source.entries,
        capturedOutput.entries,
        verified.provenance.report,
      );
      const plan = makePlan({ baselineByPath, controlPaths, mapping, outputByPath, sourcePaths });
      assertDestinations(root, plan, baselineByPath, sourcePaths);

      const result = {
        added: plan.added,
        baselineCommit: sourceCommit,
        baselineTree: sourceTree,
        changed: plan.changed,
        deleted: plan.deleted,
        dryRun,
        headCommit,
        headTree,
        renamed: plan.renamed,
        sourceCommit,
        sourceTree,
      };
      if (dryRun) return result;

      const affectedPaths = new Set([
        ...plan.writes.map((entry) => entry.path),
        ...plan.deletes,
        PROVENANCE_PATH,
      ]);
      const backups = new Map(
        [...affectedPaths].map((path) => [path, cloneEntry(workingEntry(root, path))]),
      );
      const writtenVersions = new Map();
      try {
        for (const entry of plan.writes) {
          if (beforeMutation) await beforeMutation({ kind: 'write', path: entry.path });
          assertWrittenVersions(root, writtenVersions, `write ${entry.path}`);
          const original = backups.get(entry.path);
          assertCurrent(root, entry.path, original, 'write');
          writeAtomic(root, entry, { replaceExisting: original !== null });
          writtenVersions.set(entry.path, cloneEntry(entry));
        }
        for (const path of plan.deletes) {
          if (beforeMutation) await beforeMutation({ kind: 'delete', path });
          assertWrittenVersions(root, writtenVersions, `delete ${path}`);
          const original = backups.get(path);
          assertCurrent(root, path, original, 'delete');
          removeFile(root, path);
          writtenVersions.set(path, null);
        }
        if (beforeMutation) await beforeMutation({ kind: 'write', path: PROVENANCE_PATH });
        assertWrittenVersions(root, writtenVersions, 'write marker');
        const originalMarker = backups.get(PROVENANCE_PATH);
        assertCurrent(root, PROVENANCE_PATH, originalMarker, 'write marker');
        writeAtomic(root, capturedOutput.marker, { replaceExisting: originalMarker !== null });
        writtenVersions.set(PROVENANCE_PATH, cloneEntry(capturedOutput.marker));
        pruneEmptyParents(root, plan.deletes);
      } catch (error) {
        try {
          const preserved = restore(root, backups, writtenVersions);
          if (preserved.length > 0) {
            throw new Error(`${error.message}; rollback preserved external changes at: ${preserved.join(', ')}`);
          }
        } catch (rollbackError) {
          throw new Error(`${error.message}; ${rollbackError.message}`);
        }
        throw error;
      }
      return result;
    } finally {
      // This lock coordinates cooperating apply callers; it cannot defend against arbitrary writers.
    }
  } finally {
    releaseApplyLock(lock);
  }
}
