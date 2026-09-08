import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  posix,
  relative,
  resolve,
} from 'node:path';
import { TextDecoder } from 'node:util';
import { CANDIDATE_TERMS } from './brand-map.mjs';

export { CANDIDATE_TERMS };

const DEFAULT_GIT_MAX_BUFFER = 64 * 1024 * 1024;
const TREE_MAX_BUFFER = 256 * 1024 * 1024;
const MAX_BLOB_BATCH_OBJECTS = 256;
const MAX_BLOB_BATCH_BYTES = 32 * 1024 * 1024;
const GIT_NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';

const EXCLUDED_ROOT_DIRECTORY_RULES = new Map([
  ['.cache', 'cache'],
  ['.git', 'git-metadata'],
  ['.git-worktrees', 'worktree'],
  ['.pnpm-store', 'dependency-cache'],
  ['.worktrees', 'worktree'],
  ['cache', 'cache'],
  ['dependencies', 'dependency'],
  ['deps', 'dependency'],
  ['node_modules', 'dependency'],
  ['target', 'build-output'],
  ['worktrees', 'worktree'],
]);

const decoder = new TextDecoder('utf-8', { fatal: true });

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isolatedGitEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith('GIT_')) {
      delete environment[key];
    }
  }
  environment.GIT_CONFIG_GLOBAL = GIT_NULL_DEVICE;
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_SYSTEM = GIT_NULL_DEVICE;
  return environment;
}

function runGit(cwd, args, input, { maxBuffer = DEFAULT_GIT_MAX_BUFFER } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'buffer',
    env: isolatedGitEnvironment(),
    input,
    maxBuffer,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`Unable to run git: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = result.stderr?.toString('utf8').trim();
    throw new Error(`git ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function runGitText(cwd, args) {
  return runGit(cwd, args).toString('utf8').trim();
}

function requireObjectId(value, label) {
  if (!/^[0-9a-f]{40,64}$/.test(value)) {
    throw new Error(`git returned an invalid ${label}: ${value}`);
  }
  return value;
}

function resolveSourceCommit(cwd, sourceRef) {
  if (typeof sourceRef !== 'string' || sourceRef.length === 0 || sourceRef.startsWith('-')) {
    throw new Error('sourceRef must be a non-empty Git ref');
  }
  return requireObjectId(
    runGitText(cwd, ['rev-parse', '--verify', '--end-of-options', `${sourceRef}^{commit}`]),
    'commit ID',
  );
}

function lstatIfExists(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function parseTreeEntries(treeOutput) {
  const entries = [];
  let start = 0;

  while (start < treeOutput.length) {
    const end = treeOutput.indexOf(0, start);
    const recordEnd = end === -1 ? treeOutput.length : end;
    const record = treeOutput.subarray(start, recordEnd);
    start = recordEnd + 1;
    if (record.length === 0) {
      continue;
    }

    const tab = record.indexOf(0x09);
    if (tab === -1) {
      throw new Error('git ls-tree returned a malformed entry');
    }

    const metadata = record.subarray(0, tab).toString('ascii').trim().split(/\s+/);
    if (metadata.length !== 4) {
      throw new Error('git ls-tree returned an entry with unexpected metadata');
    }

    const [mode, gitType, objectId, sizeText] = metadata;
    const size = sizeText === '-' ? null : Number(sizeText);
    if (size !== null && (!Number.isSafeInteger(size) || size < 0)) {
      throw new Error(`git ls-tree returned an invalid size for ${objectId}`);
    }
    entries.push({
      gitType,
      mode,
      objectId: requireObjectId(objectId, 'object ID'),
      path: record.subarray(tab + 1).toString('utf8'),
      size,
    });
  }

  return entries;
}

function readBlobBatch(cwd, objectIds, expectedSize = 0) {
  if (objectIds.length === 0) {
    return new Map();
  }

  const input = Buffer.from(`${objectIds.join('\n')}\n`, 'ascii');
  const outputBuffer = expectedSize + objectIds.length * 128 + input.length + 1;
  if (!Number.isSafeInteger(outputBuffer)) {
    throw new Error('git cat-file batch is too large to read safely');
  }
  const output = runGit(cwd, ['cat-file', '--batch'], input, {
    maxBuffer: Math.max(DEFAULT_GIT_MAX_BUFFER, outputBuffer),
  });
  const blobs = new Map();
  let offset = 0;

  for (const objectId of objectIds) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd === -1) {
      throw new Error(`git cat-file returned no header for ${objectId}`);
    }

    const header = output.subarray(offset, headerEnd).toString('ascii').split(/\s+/);
    const [returnedId, type, sizeText] = header;
    if (returnedId !== objectId || type !== 'blob') {
      throw new Error(`git cat-file returned an unexpected object for ${objectId}`);
    }

    const size = Number(sizeText);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      contentEnd >= output.length ||
      output[contentEnd] !== 0x0a
    ) {
      throw new Error(`git cat-file returned an invalid blob size for ${objectId}`);
    }

    blobs.set(objectId, output.subarray(contentStart, contentEnd));
    offset = contentEnd + 1;
  }

  return blobs;
}

function exclusionForPath(path) {
  const separator = path.indexOf('/');
  if (separator === -1) {
    return null;
  }

  const directory = path.slice(0, separator);
  const category = EXCLUDED_ROOT_DIRECTORY_RULES.get(directory.toLowerCase());
  if (category) {
    return { category, directory };
  }
  return null;
}

function pathCollisions(entries) {
  const pathsByNormalizedPath = new Map();
  for (const entry of entries) {
    const normalizedPath = entry.path.toLowerCase();
    const paths = pathsByNormalizedPath.get(normalizedPath) ?? [];
    paths.push(entry.path);
    pathsByNormalizedPath.set(normalizedPath, paths);
  }

  const caseInsensitivePaths = [...pathsByNormalizedPath.entries()]
    .filter(([, paths]) => new Set(paths).size > 1)
    .map(([normalizedPath, paths]) => ({
      normalizedPath,
      paths: [...new Set(paths)].sort(),
    }))
    .sort((left, right) => compareStrings(left.normalizedPath, right.normalizedPath));

  const fileDirectoryPrefixes = [];
  for (const entry of entries) {
    const components = entry.path.toLowerCase().split('/');
    for (let length = 1; length < components.length; length += 1) {
      const normalizedPrefix = components.slice(0, length).join('/');
      const prefixPaths = pathsByNormalizedPath.get(normalizedPrefix);
      if (!prefixPaths) {
        continue;
      }
      for (const filePath of new Set(prefixPaths)) {
        fileDirectoryPrefixes.push({
          descendantPath: entry.path,
          filePath,
          normalizedPrefix,
        });
      }
    }
  }

  fileDirectoryPrefixes.sort((left, right) => (
    compareStrings(left.normalizedPrefix, right.normalizedPrefix) ||
    compareStrings(left.filePath, right.filePath) ||
    compareStrings(left.descendantPath, right.descendantPath)
  ));

  return { caseInsensitivePaths, fileDirectoryPrefixes };
}

function nextEntryBatch(entries, start) {
  const batch = [];
  const objectIds = new Set();
  let expectedSize = 0;

  for (let index = start; index < entries.length; index += 1) {
    if (batch.length >= MAX_BLOB_BATCH_OBJECTS) {
      break;
    }

    const entry = entries[index];
    if (entry.gitType === 'blob' && !objectIds.has(entry.objectId)) {
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
        throw new Error(`git ls-tree returned an invalid blob size for ${entry.path}`);
      }
      if (batch.length > 0 && expectedSize + entry.size > MAX_BLOB_BATCH_BYTES) {
        break;
      }
      objectIds.add(entry.objectId);
      expectedSize += entry.size;
    }
    batch.push(entry);
  }

  return {
    entries: batch,
    expectedSize,
    objectIds: [...objectIds].sort(),
  };
}

function containsAsciiCaseInsensitive(buffer, term) {
  const expected = Buffer.from(term, 'ascii');
  if (expected.length > buffer.length) {
    return false;
  }

  for (let offset = 0; offset <= buffer.length - expected.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < expected.length; index += 1) {
      let actual = buffer[offset + index];
      if (actual >= 0x41 && actual <= 0x5a) {
        actual += 0x20;
      }
      if (actual !== expected[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return true;
    }
  }
  return false;
}

function matchingTermsForPath(path) {
  const lowerPath = path.toLowerCase();
  return CANDIDATE_TERMS.filter((term) => lowerPath.includes(term));
}

function matchingTermsForContent(content) {
  return CANDIDATE_TERMS.filter((term) => containsAsciiCaseInsensitive(content, term));
}

function isUtf8Text(content) {
  if (content.includes(0)) {
    return false;
  }
  try {
    decoder.decode(content);
    return true;
  } catch {
    return false;
  }
}

function classifySymlink(path, target) {
  if (target.length === 0 || target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target)) {
    return 'unsafe';
  }
  const resolvedTarget = posix.normalize(posix.join(posix.dirname(path), target));
  return resolvedTarget === '..' || resolvedTarget.startsWith('../') ? 'unsafe' : 'safe';
}

function classifyEntry(entry, content) {
  if (entry.mode === '120000') {
    const symlinkTarget = content.toString('utf8');
    return {
      classification: 'symlink',
      symlinkSafety: classifySymlink(entry.path, symlinkTarget),
      symlinkTarget,
    };
  }
  if (entry.mode === '160000' || entry.gitType === 'commit') {
    return { classification: 'submodule' };
  }
  if (entry.gitType !== 'blob') {
    return { classification: 'special' };
  }
  return { classification: isUtf8Text(content) ? 'text' : 'binary' };
}

function sortEntries(entries) {
  return entries.sort((left, right) => compareStrings(left.path, right.path));
}

function canonicalizePath(path) {
  let current = resolve(path);
  const missingComponents = [];
  while (true) {
    const stat = lstatIfExists(current);
    if (stat) {
      return resolve(realpathSync(current), ...missingComponents);
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    missingComponents.unshift(basename(current));
    current = parent;
  }
  return resolve(current, ...missingComponents);
}

function assertSafeReportDirectory(reportDir) {
  const absolutePath = resolve(reportDir);
  const stat = lstatIfExists(absolutePath);
  if (!stat) {
    return;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`report directory path must not contain a symlink: ${absolutePath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`report directory path is not a directory: ${absolutePath}`);
  }
}

function candidateForEntry(entry) {
  const candidate = {
    path: entry.path,
    objectId: entry.objectId,
    mode: entry.mode,
    classification: entry.classification,
    evidence: entry.candidate,
    semanticSymbolsResolved: false,
  };
  return candidate;
}

export function gitRepositoryRoot(cwd = process.cwd()) {
  return runGitText(cwd, ['rev-parse', '--show-toplevel']);
}

export function inventoryGitTree({ cwd = process.cwd(), sourceRef }) {
  const commit = resolveSourceCommit(cwd, sourceRef);
  const tree = requireObjectId(runGitText(cwd, ['rev-parse', `${commit}^{tree}`]), 'tree ID');
  const rawEntries = parseTreeEntries(
    runGit(cwd, ['ls-tree', '--full-tree', '-r', '-z', '-l', commit], undefined, {
      maxBuffer: TREE_MAX_BUFFER,
    }),
  );
  const includedRawEntries = [];
  const excluded = [];

  for (const entry of rawEntries) {
    const exclusion = exclusionForPath(entry.path);
    if (exclusion) {
      excluded.push({
        classification: 'excluded',
        exclusion,
        executable: entry.mode.endsWith('755'),
        gitType: entry.gitType,
        mode: entry.mode,
        objectId: entry.objectId,
        path: entry.path,
        size: entry.size,
      });
    } else {
      includedRawEntries.push(entry);
    }
  }

  const entries = [];
  for (let offset = 0; offset < includedRawEntries.length;) {
    const batch = nextEntryBatch(includedRawEntries, offset);
    const blobs = readBlobBatch(cwd, batch.objectIds, batch.expectedSize);
    for (const entry of batch.entries) {
      const content = entry.gitType === 'blob' ? blobs.get(entry.objectId) : undefined;
      if (entry.gitType === 'blob' && !content) {
        throw new Error(`git cat-file did not return blob ${entry.objectId}`);
      }

      const classified = classifyEntry(entry, content);
      const contentTerms = entry.gitType === 'blob' ? matchingTermsForContent(content) : [];
      entries.push({
        ...entry,
        ...classified,
        executable: entry.mode.endsWith('755'),
        candidate: {
          contentTerms,
          pathTerms: matchingTermsForPath(entry.path),
        },
      });
    }
    offset += batch.entries.length;
  }

  sortEntries(entries);
  sortEntries(excluded);
  const candidates = entries
    .filter((entry) => entry.candidate.pathTerms.length > 0 || entry.candidate.contentTerms.length > 0)
    .map(candidateForEntry);
  const pathCandidates = entries.filter((entry) => entry.candidate.pathTerms.length > 0).length;
  const contentCandidates = entries.filter((entry) => entry.candidate.contentTerms.length > 0).length;
  const collisions = pathCollisions(rawEntries);

  return {
    schemaVersion: 1,
    source: {
      commit,
      ref: sourceRef,
      tree,
    },
    analysis: {
      candidateTerms: [...CANDIDATE_TERMS],
      candidateType: 'case-insensitive lexical path and blob-content evidence',
      excludedContentScanned: false,
      inventoryScope: 'tracked Git tree excluding explicit artifact roots',
      semanticSymbolsResolved: false,
    },
    counts: {
      contentCandidates,
      excluded: excluded.length,
      included: entries.length,
      lexicalCandidates: candidates.length,
      pathCandidates,
      caseInsensitivePathCollisions: collisions.caseInsensitivePaths.length,
      fileDirectoryPrefixCollisions: collisions.fileDirectoryPrefixes.length,
      tracked: rawEntries.length,
    },
    entries,
    candidates,
    collisions,
    excluded,
  };
}

export function serializeInventory(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function assertReportDirectoryOutsideSource(reportDir, sourceRoot) {
  const reportPath = canonicalizePath(reportDir);
  const sourcePath = canonicalizePath(sourceRoot);
  const relativePath = relative(sourcePath, reportPath);
  if (
    relativePath === '' ||
    (!isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
  ) {
    throw new Error(`report directory must be outside the source tree: ${reportDir}`);
  }
}

export function writeInventoryReport(reportDir, report, { sourceRoot } = {}) {
  if (sourceRoot) {
    assertReportDirectoryOutsideSource(reportDir, sourceRoot);
  }
  assertSafeReportDirectory(reportDir);
  mkdirSync(reportDir, { recursive: true });
  assertSafeReportDirectory(reportDir);
  const reportPath = resolve(reportDir, 'inventory.json');
  const existingReport = lstatIfExists(reportPath);
  if (existingReport) {
    const reason = existingReport.isSymbolicLink()
      ? 'must not be a symlink'
      : existingReport.isFile()
        ? 'already exists'
        : 'must be a regular file path';
    throw new Error(`inventory report ${reason}: ${reportPath}`);
  }
  writeFileSync(reportPath, serializeInventory(report), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o644,
  });
  return reportPath;
}
