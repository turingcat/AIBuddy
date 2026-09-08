import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
} from 'node:path';
import { tmpdir } from 'node:os';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

export const PROVENANCE_PATH = '.aibuddy-rebrand.json';
export const PROVENANCE_SCHEMA_VERSION = 1;

const GIT_TREE_MAX_BUFFER = 256 * 1024 * 1024;
const MAX_BLOB_BATCH_OBJECTS = 256;
const MAX_BLOB_BATCH_BYTES = 32 * 1024 * 1024;
const GIT_BATCH_MAX_BUFFER = 64 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const NATIVE_PUBLISH_SOURCE = fileURLToPath(new URL('./native-publish.rs', import.meta.url));

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function casefoldPath(path) {
  return path.toLocaleLowerCase('en-US');
}

function isolatedGitEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith('GIT_')) {
      delete environment[key];
    }
  }
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_SYSTEM = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return environment;
}

function runGit(cwd, args, input, maxBuffer = GIT_BATCH_MAX_BUFFER) {
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
  const text = runGit(cwd, args).toString('utf8');
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

function requireObjectId(value, label) {
  if (!/^[0-9a-f]{40,64}$/u.test(value)) {
    throw new Error(`git returned an invalid ${label}: ${value}`);
  }
  return value;
}

function resolveSource(cwd, sourceRef) {
  if (typeof sourceRef !== 'string' || sourceRef.length === 0 || sourceRef.startsWith('-')) {
    throw new Error('sourceRef must be a non-empty Git ref');
  }

  const commit = requireObjectId(
    runGitText(cwd, ['rev-parse', '--verify', '--end-of-options', `${sourceRef}^{commit}`]),
    'commit ID',
  );
  const tree = requireObjectId(runGitText(cwd, ['rev-parse', `${commit}^{tree}`]), 'tree ID');
  const sourceRoot = resolve(runGitText(cwd, ['rev-parse', '--show-toplevel']));
  const gitDirectoryText = runGitText(cwd, ['rev-parse', '--git-dir']);
  const gitDirectory = resolve(cwd, gitDirectoryText);
  const gitCommonDirectoryText = runGitText(cwd, ['rev-parse', '--git-common-dir']);
  const gitCommonDirectory = resolve(cwd, gitCommonDirectoryText);

  return {
    commit,
    gitCommonDirectory,
    gitDirectory,
    sourceRoot,
    tree,
  };
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

function assertDirectoryPath(path, label) {
  const stat = lstatIfExists(path);
  if (!stat) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink: ${path}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label} must be a directory: ${path}`);
  }
}

function assertSafeParents(path, label) {
  let current = resolve(path);
  while (true) {
    const stat = lstatIfExists(current);
    if (stat) {
      if (stat.isSymbolicLink()) {
        throw new Error(`${label} path must not contain a symlink: ${current}`);
      }
      if (!stat.isDirectory() && current !== resolve(path)) {
        throw new Error(`${label} parent must be a directory: ${current}`);
      }
      return;
    }
    const parent = dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}

function canonicalPath(path) {
  const absolutePath = resolve(path);
  let current = absolutePath;
  const missing = [];

  while (true) {
    const stat = lstatIfExists(current);
    if (stat) {
      if (stat.isSymbolicLink()) {
        throw new Error(`path must not contain a symlink: ${current}`);
      }
      if (!stat.isDirectory() && missing.length > 0) {
        throw new Error(`path parent must be a directory: ${current}`);
      }
      return resolve(realpathSync(current), ...missing);
    }
    missing.unshift(basename(current));
    const parent = dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
}

function isWithin(path, root) {
  const child = relative(root, path);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${pathSeparator()}`));
}

function pathSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}

function assertOutputLocation(outputDir, source) {
  const absoluteOutput = resolve(outputDir);
  const existingOutput = lstatIfExists(absoluteOutput);
  if (existingOutput) {
    throw new Error(`output directory already exists: ${absoluteOutput}`);
  }
  assertSafeParents(absoluteOutput, 'output');

  const comparisonPath = canonicalPath(absoluteOutput);
  const forbiddenRoots = [
    canonicalPath(source.sourceRoot),
    canonicalPath(source.gitCommonDirectory),
    canonicalPath(source.gitDirectory),
    canonicalPath(join(source.sourceRoot, '.git')),
  ];
  if (forbiddenRoots.some((root) => isWithin(comparisonPath, root))) {
    throw new Error(`output directory must be outside the source worktree and Git metadata: ${absoluteOutput}`);
  }
  return absoluteOutput;
}

function ensureDirectoryPath(path) {
  const absolutePath = resolve(path);
  assertSafeParents(absolutePath, 'output');

  const missing = [];
  let current = absolutePath;
  while (!lstatIfExists(current)) {
    missing.unshift(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  for (const directory of missing) {
    try {
      mkdirSync(directory, { mode: 0o755 });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
    assertDirectoryPath(directory, 'output parent');
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
    const metadata = record.subarray(0, tab).toString('ascii').trim().split(/\s+/u);
    if (metadata.length !== 4) {
      throw new Error('git ls-tree returned an entry with unexpected metadata');
    }
    const [mode, gitType, objectId, sizeText] = metadata;
    const size = sizeText === '-' ? null : Number(sizeText);
    if (size !== null && (!Number.isSafeInteger(size) || size < 0)) {
      throw new Error(`git ls-tree returned an invalid size for ${objectId}`);
    }
    let path;
    try {
      path = decoder.decode(record.subarray(tab + 1));
    } catch (error) {
      throw new Error(`git returned a non-UTF-8 path: ${error.message}`);
    }
    entries.push({
      gitType,
      mode,
      objectId: requireObjectId(objectId, 'object ID'),
      path,
      size,
    });
  }
  return entries;
}

function nextBlobBatch(entries, start, maxBytes, maxObjects) {
  const batch = [];
  const objectIds = new Set();
  let expectedSize = 0;

  for (let index = start; index < entries.length; index += 1) {
    if (batch.length >= maxObjects) {
      break;
    }

    const entry = entries[index];
    if (entry.gitType === 'blob' && !objectIds.has(entry.objectId)) {
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
        throw new Error(`git ls-tree returned an invalid blob size for ${entry.path}`);
      }
      if (entry.size > maxBytes && batch.length === 0) {
        throw new Error(
          `blob ${entry.path} is ${entry.size} bytes, exceeding the bounded read batch limit of `
          + `${maxBytes} bytes; split the blob or increase the configured limit`,
        );
      }
      if (batch.length > 0 && expectedSize + entry.size > maxBytes) {
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

export function planBlobBatches(
  entries,
  { maxBytes = MAX_BLOB_BATCH_BYTES, maxObjects = MAX_BLOB_BATCH_OBJECTS } = {},
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('maxBytes must be a positive safe integer');
  }
  if (!Number.isSafeInteger(maxObjects) || maxObjects <= 0) {
    throw new Error('maxObjects must be a positive safe integer');
  }

  const batches = [];
  for (let offset = 0; offset < entries.length;) {
    const batch = nextBlobBatch(entries, offset, maxBytes, maxObjects);
    if (batch.entries.length === 0) {
      throw new Error('unable to plan a non-empty Git blob batch');
    }
    batches.push(batch);
    offset += batch.entries.length;
  }
  return batches;
}

function readBlobBatch(cwd, objectIds) {
  if (objectIds.length === 0) {
    return new Map();
  }
  const output = runGit(
    cwd,
    ['cat-file', '--batch'],
    Buffer.from(`${objectIds.join('\n')}\n`, 'ascii'),
    GIT_BATCH_MAX_BUFFER,
  );
  const blobs = new Map();
  let offset = 0;
  for (const objectId of objectIds) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd === -1) {
      throw new Error(`git cat-file returned no header for ${objectId}`);
    }
    const [returnedId, type, sizeText] = output.subarray(offset, headerEnd).toString('ascii').split(/\s+/u);
    if (returnedId !== objectId || type !== 'blob') {
      throw new Error(`git cat-file returned an unexpected object for ${objectId}`);
    }
    const size = Number(sizeText);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (!Number.isSafeInteger(size) || size < 0 || contentEnd >= output.length || output[contentEnd] !== 0x0a) {
      throw new Error(`git cat-file returned an invalid blob size for ${objectId}`);
    }
    blobs.set(objectId, Buffer.from(output.subarray(contentStart, contentEnd)));
    offset = contentEnd + 1;
  }
  return blobs;
}

function isSafeRelativePath(path) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.startsWith('/') ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.includes(':')
  ) {
    return false;
  }
  const components = path.split('/');
  return !components.some((component) => component.length === 0 || component === '.' || component === '..');
}

function symlinkTargetFor(path, content) {
  let target;
  try {
    target = decoder.decode(content);
  } catch (error) {
    throw new Error(`symlink target must be valid UTF-8 for ${path}: ${error.message}`);
  }
  if (
    target.length === 0 ||
    target.includes('\0') ||
    target.includes('\\') ||
    target.includes(':') ||
    target.startsWith('/') ||
    /^[A-Za-z]:/u.test(target)
  ) {
    throw new Error(`symlink target escapes the snapshot: ${path}`);
  }
  const resolvedTarget = posix.normalize(posix.join(posix.dirname(path), target));
  if (resolvedTarget === '..' || resolvedTarget.startsWith('../')) {
    throw new Error(`symlink target escapes the snapshot: ${path}`);
  }
  return target;
}

function validateEntries(entries, label) {
  if (!Array.isArray(entries)) {
    throw new Error(`${label} must be an array`);
  }

  const exactPaths = new Set();
  const foldedPaths = new Map();
  const normalized = entries.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const { content, mode, path } = entry;
    if (!isSafeRelativePath(path)) {
      throw new Error(`${label}[${index}] has an unsafe relative path: ${path}`);
    }
    if (casefoldPath(path) === casefoldPath(PROVENANCE_PATH)) {
      throw new Error(`${label} must not contain reserved provenance path ${PROVENANCE_PATH}`);
    }
    if (!['100644', '100755', '120000'].includes(mode)) {
      if (mode === '160000') {
        throw new Error(`${label} contains unsupported submodule entry: ${path}`);
      }
      throw new Error(`${label}[${index}] has unsupported mode ${mode}: ${path}`);
    }
    if (!(Buffer.isBuffer(content) || content instanceof Uint8Array)) {
      throw new Error(`${label}[${index}] content must be a Buffer`);
    }

    const copied = {
      content: Buffer.from(content),
      mode,
      path,
    };
    if (exactPaths.has(path)) {
      throw new Error(`${label} contains duplicate path: ${path}`);
    }
    exactPaths.add(path);
    const folded = casefoldPath(path);
    const previous = foldedPaths.get(folded);
    if (previous && previous !== path) {
      throw new Error(`${label} contains a case-insensitive path collision: ${previous} and ${path}`);
    }
    foldedPaths.set(folded, path);
    if (mode === '120000') {
      symlinkTargetFor(path, copied.content);
    }
    return copied;
  });

  for (const entry of normalized) {
    const components = casefoldPath(entry.path).split('/');
    for (let length = 1; length < components.length; length += 1) {
      const prefix = components.slice(0, length).join('/');
      const filePath = foldedPaths.get(prefix);
      if (filePath) {
        throw new Error(`${label} contains a file-directory prefix collision: ${filePath} and ${entry.path}`);
      }
    }
  }

  const symlinkPaths = new Set(
    normalized.filter((entry) => entry.mode === '120000').map((entry) => casefoldPath(entry.path)),
  );
  for (const entry of normalized) {
    const components = casefoldPath(entry.path).split('/');
    for (let length = 1; length < components.length; length += 1) {
      if (symlinkPaths.has(components.slice(0, length).join('/'))) {
        throw new Error(`${label} contains a symlink ancestor: ${entry.path}`);
      }
    }
  }

  return normalized.sort((left, right) => compareStrings(left.path, right.path));
}

function readGitEntries(cwd, source) {
  const rawEntries = parseTreeEntries(
    runGit(cwd, ['ls-tree', '--full-tree', '-r', '-z', '-l', source.commit], undefined, GIT_TREE_MAX_BUFFER),
  );
  for (const entry of rawEntries) {
    if (casefoldPath(entry.path) === casefoldPath(PROVENANCE_PATH)) {
      throw new Error(`source is already transformed; found provenance marker ${PROVENANCE_PATH}`);
    }
    if (entry.mode === '160000' || entry.gitType === 'commit') {
      throw new Error(`unsupported submodule entry in source tree: ${entry.path}`);
    }
  }

  const blobs = new Map();
  for (const batch of planBlobBatches(rawEntries)) {
    const batchBlobs = readBlobBatch(cwd, batch.objectIds);
    for (const [objectId, content] of batchBlobs) {
      blobs.set(objectId, content);
    }
  }
  const entries = rawEntries.map((entry) => {
    const content = blobs.get(entry.objectId);
    if (!content) {
      throw new Error(`git cat-file did not return blob ${entry.objectId}`);
    }
    return {
      content,
      mode: entry.mode,
      path: entry.path,
    };
  });
  return validateEntries(entries, 'source entries');
}

export function readSnapshot({ cwd = process.cwd(), sourceRef }) {
  const source = resolveSource(cwd, sourceRef);
  return {
    commit: source.commit,
    entries: readGitEntries(cwd, source),
    tree: source.tree,
  };
}

function updateLengthPrefixedHash(hash, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  hash.update(Buffer.from(`${bytes.length}:`, 'ascii'));
  hash.update(bytes);
  hash.update(Buffer.from([0]));
}

function digestBytes(content) {
  return createHash('sha256').update(content).digest('hex');
}

function digestEntries(entries) {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((left, right) => compareStrings(left.path, right.path))) {
    updateLengthPrefixedHash(hash, entry.path);
    updateLengthPrefixedHash(hash, entry.mode);
    updateLengthPrefixedHash(hash, entry.content);
  }
  return hash.digest('hex');
}

function canonicalJsonValue(value, location = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${location} must contain only JSON values`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalJsonValue(item, `${location}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${location} must contain only JSON values`);
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareStrings)
        .map((key) => [key, canonicalJsonValue(value[key], `${location}.${key}`)]),
    );
  }
  throw new Error(`${location} must contain only JSON values`);
}

function validateTransformReport(report) {
  if (
    report === null ||
    typeof report !== 'object' ||
    Array.isArray(report) ||
    Object.getPrototypeOf(report) !== Object.prototype ||
    !Object.hasOwn(report, 'unresolved') ||
    !Array.isArray(report.unresolved)
  ) {
    throw new Error('transform report must be an object with an unresolved array');
  }
  if (report.unresolved.length > 0) {
    throw new Error('transform report contains unresolved entries');
  }
  return canonicalJsonValue(report, 'transform report');
}

function provenanceEntries(entries) {
  return entries.map((entry) => ({
    digest: digestBytes(entry.content),
    kind: entry.mode === '120000' ? 'symlink' : 'file',
    mode: entry.mode,
    path: entry.path,
    size: entry.content.length,
  }));
}

function createProvenance({ inputEntries, outputEntries, report, source, transformIdentity }) {
  return {
    entries: provenanceEntries(outputEntries),
    inputDigest: digestEntries(inputEntries),
    outputDigest: digestEntries(outputEntries),
    report: canonicalJsonValue(report, 'transform report'),
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    source: {
      commit: source.commit,
      tree: source.tree,
    },
    transformIdentity,
  };
}

function writeAll(fd, content) {
  let offset = 0;
  while (offset < content.length) {
    offset += writeSync(fd, content, offset, content.length - offset);
  }
}

function writeRegularFile(path, content, mode) {
  const permissions = mode === '100755' ? 0o755 : 0o644;
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, permissions);
  try {
    writeAll(fd, content);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, permissions);
}

function ensureStageParent(stage, entryPath) {
  const parent = dirname(join(stage, ...entryPath.split('/')));
  const relativeParent = relative(stage, parent);
  if (relativeParent === '') {
    return;
  }
  let current = stage;
  for (const component of relativeParent.split(/[\\/]/u)) {
    current = join(current, component);
    const stat = lstatIfExists(current);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`staging path parent is unsafe: ${current}`);
      }
      continue;
    }
    mkdirSync(current, { mode: 0o755 });
  }
}

function writeStage(stage, entries, provenance) {
  for (const entry of entries) {
    ensureStageParent(stage, entry.path);
    const destination = join(stage, ...entry.path.split('/'));
    if (entry.mode === '120000') {
      symlinkSync(symlinkTargetFor(entry.path, entry.content), destination);
    } else {
      writeRegularFile(destination, entry.content, entry.mode);
    }
  }

  const marker = Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  writeRegularFile(join(stage, PROVENANCE_PATH), marker, '100644');
}

function acquirePublishLock(outputDir) {
  const lockPath = `${outputDir}.publish-lock`;
  let fd;
  try {
    fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  } catch (error) {
    throw new Error(`could not acquire output publication lock ${lockPath}: ${error.message}`);
  }
  return { fd, lockPath };
}

function runNativePublisher(stage, outputDir) {
  const helperDirectory = mkdtempSync(join(tmpdir(), 'aibuddy-rebrand-native-publish-'));
  const binaryName = process.platform === 'win32' ? 'native-publish.exe' : 'native-publish';
  const binaryPath = join(helperDirectory, binaryName);
  try {
    const compilation = spawnSync(
      'rustc',
      ['--edition=2021', NATIVE_PUBLISH_SOURCE, '-o', binaryPath],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    if (compilation.error) {
      throw new Error(`unable to compile native publisher: ${compilation.error.message}`);
    }
    if (compilation.status !== 0) {
      const details = compilation.stderr?.trim();
      throw new Error(`unable to compile native publisher${details ? `: ${details}` : ''}`);
    }

    const publication = spawnSync(binaryPath, [stage, outputDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (publication.error) {
      throw new Error(`native publisher failed to start: ${publication.error.message}`);
    }
    if (publication.status !== 0) {
      const details = publication.stderr?.trim();
      throw new Error(`native publisher refused publication${details ? `: ${details}` : ''}`);
    }
  } finally {
    rmSync(helperDirectory, { force: true, recursive: true });
  }
}

function releasePublishLock(lock) {
  try {
    closeSync(lock.fd);
  } finally {
    unlinkSync(lock.lockPath);
  }
}

export async function generateSnapshot({
  cwd = process.cwd(),
  outputDir,
  sourceRef,
  transform,
  transformIdentity,
}) {
  if (typeof transform !== 'function') {
    throw new Error('transform must be a function');
  }
  if (typeof transformIdentity !== 'string' || transformIdentity.length === 0) {
    throw new Error('transformIdentity must be a non-empty string');
  }
  if (typeof outputDir !== 'string' || outputDir.length === 0) {
    throw new Error('outputDir must be a non-empty path');
  }

  const source = resolveSource(cwd, sourceRef);
  const absoluteOutput = assertOutputLocation(outputDir, source);
  const inputEntries = readGitEntries(cwd, source);
  const transformInput = inputEntries.map((entry) => ({
    content: Buffer.from(entry.content),
    mode: entry.mode,
    path: entry.path,
  }));

  const parent = dirname(absoluteOutput);
  ensureDirectoryPath(parent);
  const lock = acquirePublishLock(absoluteOutput);
  let stage;
  try {
    if (lstatIfExists(absoluteOutput)) {
      throw new Error(`output directory appeared during generation: ${absoluteOutput}`);
    }
    stage = mkdtempSync(join(parent, `.${basename(absoluteOutput)}.stage-`));
    assertDirectoryPath(stage, 'staging directory');

    const transformed = await transform(transformInput);
    if (transformed === null || typeof transformed !== 'object') {
      throw new Error('transform must return an object');
    }
    const report = validateTransformReport(transformed.report);
    const outputEntries = validateEntries(transformed.entries, 'transformed entries');
    const provenance = createProvenance({
      inputEntries,
      outputEntries,
      report,
      source,
      transformIdentity,
    });

    writeStage(stage, outputEntries, provenance);
    assertSafeParents(absoluteOutput, 'output');
    runNativePublisher(stage, absoluteOutput);
    stage = undefined;
    return {
      outputDir: absoluteOutput,
      provenance,
      report,
    };
  } finally {
    if (stage) {
      rmSync(stage, { force: true, recursive: true });
    }
    releasePublishLock(lock);
  }
}
