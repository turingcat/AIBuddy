import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { TextDecoder } from 'node:util';

import {
  PROVENANCE_PATH,
  PROVENANCE_SCHEMA_VERSION,
} from './generate.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true });

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function casefoldPath(path) {
  return path.toLocaleLowerCase('en-US');
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
  return !path.split('/').some((component) =>
    component.length === 0 || component === '.' || component === '..');
}

function symlinkTargetFor(path, target) {
  if (
    typeof target !== 'string' ||
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

function assertSafeOutputPath(outputDir) {
  const absolutePath = resolve(outputDir);
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`snapshot path does not exist: ${absolutePath}`);
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`snapshot output must not be a symlink: ${absolutePath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`snapshot output must be a directory: ${absolutePath}`);
  }
  return absolutePath;
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

function validateManifest(provenance) {
  if (provenance === null || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new Error('provenance marker must contain an object');
  }
  const expectedKeys = [
    'entries',
    'inputDigest',
    'outputDigest',
    'report',
    'schemaVersion',
    'source',
    'transformIdentity',
  ];
  if (compareStrings(Object.keys(provenance).sort(compareStrings).join('\0'), expectedKeys.sort(compareStrings).join('\0')) !== 0) {
    throw new Error('provenance marker has an unexpected schema');
  }
  if (provenance.schemaVersion !== PROVENANCE_SCHEMA_VERSION) {
    throw new Error(`unsupported provenance schema version: ${provenance.schemaVersion}`);
  }
  if (
    provenance.source === null ||
    typeof provenance.source !== 'object' ||
    Array.isArray(provenance.source) ||
    Object.keys(provenance.source).sort(compareStrings).join('\0') !== 'commit\0tree' ||
    !/^[0-9a-f]{40,64}$/u.test(provenance.source.commit ?? '') ||
    !/^[0-9a-f]{40,64}$/u.test(provenance.source.tree ?? '')
  ) {
    throw new Error('provenance source commit and tree are required Git object IDs');
  }
  if (typeof provenance.transformIdentity !== 'string' || provenance.transformIdentity.length === 0) {
    throw new Error('provenance transform identity is required');
  }
  for (const [name, digest] of [
    ['inputDigest', provenance.inputDigest],
    ['outputDigest', provenance.outputDigest],
  ]) {
    if (!/^[0-9a-f]{64}$/u.test(digest ?? '')) {
      throw new Error(`provenance ${name} must be a lowercase SHA-256 digest`);
    }
  }
  if (
    provenance.report === null ||
    typeof provenance.report !== 'object' ||
    Array.isArray(provenance.report) ||
    Object.getPrototypeOf(provenance.report) !== Object.prototype ||
    !Object.hasOwn(provenance.report, 'unresolved') ||
    !Array.isArray(provenance.report.unresolved)
  ) {
    throw new Error('provenance report must be an object with an unresolved array');
  }
  if (provenance.report.unresolved.length > 0) {
    throw new Error('provenance report contains unresolved entries');
  }
  canonicalJsonValue(provenance.report, 'provenance report');
  if (!Array.isArray(provenance.entries)) {
    throw new Error('provenance entries must be an array');
  }

  const paths = new Map();
  const symlinks = new Set();
  for (const [index, entry] of provenance.entries.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`provenance entries[${index}] must be an object`);
    }
    const expectedEntryKeys = ['digest', 'kind', 'mode', 'path', 'size'];
    if (Object.keys(entry).sort(compareStrings).join('\0') !== expectedEntryKeys.join('\0')) {
      throw new Error(`provenance entries[${index}] has an unexpected schema`);
    }
    if (!isSafeRelativePath(entry.path) || casefoldPath(entry.path) === casefoldPath(PROVENANCE_PATH)) {
      throw new Error(`provenance entries[${index}] has an unsafe path`);
    }
    if (!['100644', '100755', '120000'].includes(entry.mode)) {
      throw new Error(`provenance entries[${index}] has an unsupported mode`);
    }
    const expectedKind = entry.mode === '120000' ? 'symlink' : 'file';
    if (entry.kind !== expectedKind) {
      throw new Error(`provenance entries[${index}] has an invalid kind`);
    }
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      throw new Error(`provenance entries[${index}] has an invalid size`);
    }
    if (!/^[0-9a-f]{64}$/u.test(entry.digest ?? '')) {
      throw new Error(`provenance entries[${index}] has an invalid digest`);
    }
    const folded = casefoldPath(entry.path);
    if (paths.has(folded)) {
      throw new Error(`provenance entries contain a case-insensitive collision: ${entry.path}`);
    }
    paths.set(folded, entry.path);
    if (entry.mode === '120000') {
      symlinks.add(folded);
    }
  }

  for (const entry of provenance.entries) {
    const components = casefoldPath(entry.path).split('/');
    for (let length = 1; length < components.length; length += 1) {
      const prefix = components.slice(0, length).join('/');
      if (paths.has(prefix)) {
        throw new Error(`provenance entries contain a file-directory prefix collision: ${entry.path}`);
      }
      if (symlinks.has(prefix)) {
        throw new Error(`provenance entries contain a symlink ancestor: ${entry.path}`);
      }
    }
  }
}

function modeForFile(stat, path) {
  const permissions = stat.mode & 0o777;
  if (permissions === 0o644) {
    return '100644';
  }
  if (permissions === 0o755) {
    return '100755';
  }
  throw new Error(`snapshot file has unexpected permissions for ${path}`);
}

function collectTree(root, current = '', directories = new Set()) {
  const entries = [];
  for (const name of readdirSync(join(root, ...(current ? current.split('/') : [])))) {
    const relativePath = current ? `${current}/${name}` : name;
    const absolutePath = join(root, ...relativePath.split('/'));
    const stat = lstatSync(absolutePath);
    if (stat.isDirectory()) {
      directories.add(relativePath);
      entries.push(...collectTree(root, relativePath, directories));
    } else if (stat.isSymbolicLink()) {
      const target = readlinkSync(absolutePath);
      symlinkTargetFor(relativePath, target);
      entries.push({
        content: Buffer.from(target, 'utf8'),
        mode: '120000',
        path: relativePath,
      });
    } else if (stat.isFile()) {
      entries.push({
        content: readFileSync(absolutePath),
        mode: modeForFile(stat, relativePath),
        path: relativePath,
      });
    } else {
      throw new Error(`snapshot contains unsupported filesystem entry: ${relativePath}`);
    }
  }
  return entries;
}

function expectedDirectories(entries) {
  const directories = new Set();
  for (const entry of entries) {
    const components = entry.path.split('/');
    for (let length = 1; length < components.length; length += 1) {
      directories.add(components.slice(0, length).join('/'));
    }
  }
  return directories;
}

function compareDirectorySets(actual, expected) {
  if (actual.size !== expected.size) {
    throw new Error('snapshot contains additional or missing directories');
  }
  for (const path of expected) {
    if (!actual.has(path)) {
      throw new Error(`snapshot is missing directory ${path}`);
    }
  }
}

function compareEntries(actualEntries, expectedEntries) {
  const actualByPath = new Map(actualEntries.map((entry) => [entry.path, entry]));
  const expectedByPath = new Map(expectedEntries.map((entry) => [entry.path, entry]));
  for (const path of actualByPath.keys()) {
    if (!expectedByPath.has(path)) {
      throw new Error(`snapshot contains an additional file: ${path}`);
    }
  }
  for (const path of expectedByPath.keys()) {
    if (!actualByPath.has(path)) {
      throw new Error(`snapshot is missing a file: ${path}`);
    }
  }
  for (const expected of expectedEntries) {
    const actual = actualByPath.get(expected.path);
    if (
      actual.mode !== expected.mode ||
      actual.content.length !== expected.size ||
      digestBytes(actual.content) !== expected.digest
    ) {
      throw new Error(`snapshot entry content, mode, or digest does not match provenance: ${expected.path}`);
    }
  }
}

export async function verifySnapshot(outputDir) {
  const absoluteOutput = assertSafeOutputPath(outputDir);
  const markerPath = join(absoluteOutput, PROVENANCE_PATH);
  const markerStat = lstatSync(markerPath);
  if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
    throw new Error(`provenance marker must be a regular file: ${markerPath}`);
  }
  if ((markerStat.mode & 0o777) !== 0o644) {
    throw new Error(`provenance marker has unexpected permissions: ${markerPath}`);
  }

  let provenance;
  let markerText;
  try {
    markerText = readFileSync(markerPath, 'utf8');
    provenance = JSON.parse(markerText);
  } catch (error) {
    throw new Error(`invalid provenance marker: ${error.message}`);
  }
  validateManifest(provenance);
  const canonicalMarker = `${JSON.stringify(provenance, null, 2)}\n`;
  if (markerText !== canonicalMarker) {
    throw new Error('provenance marker is not canonically serialized');
  }

  const directories = new Set();
  const actualEntries = collectTree(absoluteOutput, '', directories)
    .filter((entry) => entry.path !== PROVENANCE_PATH)
    .sort((left, right) => compareStrings(left.path, right.path));
  compareDirectorySets(directories, expectedDirectories(actualEntries));
  compareEntries(actualEntries, provenance.entries);

  if (digestEntries(actualEntries) !== provenance.outputDigest) {
    throw new Error('snapshot output digest does not match provenance');
  }

  return {
    outputDir: absoluteOutput,
    provenance,
    valid: true,
  };
}
