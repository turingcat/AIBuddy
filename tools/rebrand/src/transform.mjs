import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformJson } from './adapters/json.mjs';
import { transformRust } from './adapters/rust.mjs';
import {
  applyEdits,
  findBrandOccurrences,
  pathReplacement,
  pathMappings,
  preservedValueSpans,
  policyPreservesPath,
  textHasBrand,
} from './adapters/shared.mjs';
import { transformToml } from './adapters/toml.mjs';
import { transformTypeScript } from './adapters/typescript.mjs';
import { transformYaml } from './adapters/yaml.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER_DIRECTORY = resolve(ROOT, 'src/adapters');
const IDENTITY_STATIC_FILES = ['package-lock.json', 'production-policy.json', 'text-policy.json'];
const TEXT_EXTENSIONS = new Map([
  ['.js', 'typescript'],
  ['.jsx', 'typescript'],
  ['.mjs', 'typescript'],
  ['.cjs', 'typescript'],
  ['.mts', 'typescript'],
  ['.cts', 'typescript'],
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.json', 'json'],
  ['.jsonc', 'json'],
  ['.rs', 'rust'],
  ['.toml', 'toml'],
  ['.yaml', 'yaml'],
  ['.yml', 'yaml'],
]);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const MAPPING_SCHEMA = Object.freeze({
  version: 1,
  offsetEncoding: 'utf-16',
  fields: ['kind', 'original', 'replacement', 'start', 'end', 'offsetEncoding'],
});

function assertInput(input) {
  if (input !== 'upstream' && input !== 'product') {
    throw new TypeError('options.input must be upstream or product');
  }
}

function assertSafePath(path) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new TypeError(`entry path must be a safe relative path: ${JSON.stringify(path)}`);
  }
}

function cloneEntry(entry, path = entry.path, content = entry.content) {
  return {
    path,
    mode: entry.mode,
    content: Buffer.from(content),
  };
}

function isBinary(content) {
  return content.includes(0);
}

function decodeText(content) {
  return UTF8_DECODER.decode(content);
}

function preservedTextSpans(path, text, policy) {
  const spans = [...preservedValueSpans(text, { path, policy })];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd);
    if (
      textHasBrand(line) &&
      policy.preserve.legalLinePatterns?.some((pattern) => new RegExp(pattern, 'iu').test(line))
    ) {
      spans.push({
        start: lineStart,
        end: lineEnd,
        value: line,
        reason: 'explicit legal/authorship preservation policy',
      });
    }
    if (newline === -1) break;
    lineStart = newline + 1;
  }
  return spans;
}

function preservedRecordsForText(path, text, policy, wholeFile = false) {
  const spans = wholeFile
    ? [
        {
          start: 0,
          end: text.length,
          value: text,
          reason: 'explicit control-data exclusion policy',
        },
      ]
    : preservedTextSpans(path, text, policy);
  return spans
    .filter((span) => textHasBrand(text.slice(span.start, span.end)))
    .map((span) => ({
      path,
      start: span.start,
      end: span.end,
      value: span.value ?? text.slice(span.start, span.end),
      reason: span.reason,
    }));
}

function validateRange(path, text, start, end, label) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) {
    throw new Error(`${label} has invalid UTF-16 range ${start}:${end} in ${path}`);
  }
}

function normalizeEditMappings(path, text, edits) {
  return edits.map((edit) => {
    validateRange(path, text, edit.start, edit.end, 'adapter edit');
    const original = text.slice(edit.start, edit.end);
    if (edit.original !== undefined && edit.original !== original) {
      throw new Error(`adapter edit original text mismatch at ${edit.start}:${edit.end} in ${path}`);
    }
    if (typeof edit.replacement !== 'string') {
      throw new Error(`adapter edit replacement must be a string at ${edit.start}:${edit.end} in ${path}`);
    }
    return {
      kind: edit.kind ?? 'content-edit',
      original,
      replacement: edit.replacement,
      start: edit.start,
      end: edit.end,
      offsetEncoding: 'utf-16',
      scope: 'content',
      path,
      ...(edit.key ? { key: edit.key } : {}),
    };
  });
}

function normalizePreservedReferences(path, text, references) {
  return references.map((reference) => {
    validateRange(path, text, reference.start, reference.end, 'preserved reference');
    return {
      kind: 'preserved-reference',
      original: text.slice(reference.start, reference.end),
      replacement: text.slice(reference.start, reference.end),
      start: reference.start,
      end: reference.end,
      offsetEncoding: 'utf-16',
      scope: 'content',
      path,
      value: reference.value ?? text.slice(reference.start, reference.end),
      reason: reference.reason,
      ...(reference.key ? { key: reference.key } : {}),
      ...(reference.disposition ? { disposition: reference.disposition } : {}),
    };
  });
}

function normalizeSymbols(path, text, symbols) {
  return symbols.map((symbol) => {
    validateRange(path, text, symbol.start, symbol.end, 'symbol occurrence');
    const original = text.slice(symbol.start, symbol.end);
    if (symbol.original !== undefined && symbol.original !== original) {
      throw new Error(`symbol occurrence original text mismatch at ${symbol.start}:${symbol.end} in ${path}`);
    }
    if (typeof symbol.replacement !== 'string') {
      throw new Error(`symbol occurrence replacement must be a string at ${symbol.start}:${symbol.end} in ${path}`);
    }
    return {
      kind: 'symbol-occurrence',
      resolution: 'parser-token',
      original,
      replacement: symbol.replacement,
      start: symbol.start,
      end: symbol.end,
      offsetEncoding: 'utf-16',
      scope: 'content',
      path,
    };
  });
}

function auditBrandOccurrences(path, text, mappings, preserved) {
  const occurrences = findBrandOccurrences(text);
  const residuals = [];
  const accounting = occurrences.map((occurrence) => {
    const mapping = mappings.find(
      (candidate) =>
        candidate.scope !== 'path' &&
        candidate.start <= occurrence.start &&
        candidate.end >= occurrence.end,
    );
    if (mapping) {
      return { ...occurrence, accountedBy: 'mapping', mappingKind: mapping.kind };
    }
    const preservedReference = preserved.find(
      (candidate) => candidate.start <= occurrence.start && candidate.end >= occurrence.end,
    );
    if (preservedReference) {
      return { ...occurrence, accountedBy: 'preserved', reason: preservedReference.reason };
    }
    const residual = {
      path,
      kind: 'unaccounted-brand',
      reason: 'unaccounted first-party brand occurrence was not transformed or explicitly preserved',
      original: occurrence.original,
      start: occurrence.start,
      end: occurrence.end,
      offsetEncoding: 'utf-16',
    };
    residuals.push(residual);
    return { ...occurrence, accountedBy: 'unresolved' };
  });
  return { accounting, residuals };
}

function normalizeAdapterResult(path, text, result) {
  const mappings = normalizeEditMappings(path, text, result.edits ?? []);
  const preserved = normalizePreservedReferences(path, text, result.preserved ?? []);
  const symbols = normalizeSymbols(path, text, result.symbols ?? []);
  return { mappings, preserved, symbols };
}

function adapterFor(path, textAdapter) {
  if (/\.(?:ya?ml)\.disabled$/u.test(path)) return 'yaml';
  if (path === 'Cargo.lock' || path.endsWith('/Cargo.lock')) return 'toml';
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  return TEXT_EXTENSIONS.get(extension) ?? (textAdapter?.supportsText(path) ? 'text' : undefined);
}

function runAdapter(adapter, input, textAdapter) {
  switch (adapter) {
    case 'rust':
      return transformRust(input);
    case 'typescript':
      return transformTypeScript(input);
    case 'toml':
      return transformToml(input);
    case 'json':
      return transformJson(input);
    case 'yaml':
      return transformYaml(input);
    case 'text':
      return textAdapter.transformText(input);
    default:
      return undefined;
  }
}

function unresolvedForPath(path, kind, reason, extra = {}) {
  return { path, kind, reason, ...extra };
}

function collisionRecords(reportEntries) {
  const byPath = new Map();
  for (const entry of reportEntries) {
    const normalized = entry.outputPath.toLowerCase();
    const paths = byPath.get(normalized) ?? [];
    paths.push(entry.inputPath);
    byPath.set(normalized, paths);
  }
  return [...byPath.entries()]
    .filter(([, inputPaths]) => new Set(inputPaths).size > 1)
    .map(([normalizedPath, inputPaths]) => ({
      kind: 'path-collision',
      outputPath: reportEntries.find((entry) => entry.outputPath.toLowerCase() === normalizedPath).outputPath,
      normalizedPath,
      inputPaths: [...new Set(inputPaths)].sort(),
      reason: 'path collision: multiple input entries map to the same case-insensitive output path',
    }));
}

async function transformIdentity() {
  const adapterFiles = (await readdir(ADAPTER_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:mjs|json)$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const relativePaths = [
    ...IDENTITY_STATIC_FILES,
    ...adapterFiles.map((name) => `src/adapters/${name}`),
  ];
  const files = await Promise.all(
    relativePaths.map(async (relativePath) => ({
      path: relativePath,
      content: await readFile(resolve(ROOT, relativePath)),
    })),
  );
  const fileDigests = files.map(({ path, content }) => ({
    path,
    digest: createHash('sha256').update(content).digest('hex'),
  }));
  const hash = createHash('sha256');
  for (const { path, content } of files) {
    hash.update(path);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return {
    digest: hash.digest('hex'),
    inputs: relativePaths,
    fileDigests,
  };
}

async function loadOptionalTextAdapter() {
  try {
    return await import('./adapters/text.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('/adapters/text.mjs')) {
      return undefined;
    }
    throw error;
  }
}

async function loadPolicy() {
  return JSON.parse(await readFile(resolve(ROOT, 'production-policy.json'), 'utf8'));
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('entries must be an array');
  }
  const seen = new Set();
  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new TypeError('each snapshot entry must be an object');
    }
    assertSafePath(entry.path);
    if (seen.has(entry.path.toLowerCase())) {
      throw new TypeError(`duplicate case-insensitive snapshot path: ${entry.path}`);
    }
    seen.add(entry.path.toLowerCase());
    if (!(entry.content instanceof Uint8Array)) {
      throw new TypeError(`snapshot content must be a Buffer or Uint8Array: ${entry.path}`);
    }
    if (typeof entry.mode !== 'string') {
      throw new TypeError(`snapshot mode must be a string: ${entry.path}`);
    }
    return {
      path: entry.path,
      mode: entry.mode,
      content: Buffer.from(entry.content),
    };
  });
}

export async function transformSnapshot(entries, { input = 'product' } = {}) {
  assertInput(input);
  const identity = await transformIdentity();
  const policy = await loadPolicy();
  const sourceEntries = normalizeEntries(entries);
  const textAdapter = await loadOptionalTextAdapter();
  const transformed = [];
  const reportEntries = [];
  const unresolved = [];
  const preservedReferences = [];
  const legacyReferences = [];

  const addReferences = (references) => {
    preservedReferences.push(...references);
    legacyReferences.push(...references);
  };

  const entryReport = ({
    inputPath,
    outputPath,
    sourceEntry,
    disposition,
    adapter,
    mappings = [],
    symbols = [],
    accounting = [],
    preserved = [],
    editCount = 0,
    reason,
    diagnostics,
  }) => ({
    inputPath,
    outputPath,
    mode: sourceEntry.mode,
    disposition,
    adapter,
    editCount,
    mappings,
    symbols,
    brandOccurrences: accounting,
    ...(preserved.length > 0 ? { preservedReferences: preserved } : {}),
    ...(reason ? { reason } : {}),
    ...(diagnostics ? { diagnostics } : {}),
  });

  for (const sourceEntry of sourceEntries) {
    const inputPath = sourceEntry.path;
    const excluded = policyPreservesPath(inputPath, policy);
    if (excluded) {
      let preserved = [];
      let accounting = [];
      try {
        const text = decodeText(sourceEntry.content);
        preserved = normalizePreservedReferences(
          inputPath,
          text,
          preservedRecordsForText(inputPath, text, policy, true),
        );
        accounting = auditBrandOccurrences(inputPath, text, [], preserved).accounting;
        addReferences(preserved);
      } catch {
        // Excluded binary/control entries have no text spans to account for.
      }
      transformed.push(cloneEntry(sourceEntry));
      reportEntries.push(
        entryReport({
          inputPath,
          outputPath: inputPath,
          sourceEntry,
          disposition: 'preserved-control-data',
          adapter: 'policy',
          mappings: preserved,
          accounting,
          preserved,
          reason: 'explicit control-data exclusion policy',
        }),
      );
      continue;
    }

    const candidateOutputPath = pathReplacement(inputPath);
    const candidatePathMappings = pathMappings(inputPath, candidateOutputPath).map((mapping) => ({
      ...mapping,
      path: inputPath,
    }));

    if (isBinary(sourceEntry.content)) {
      transformed.push(cloneEntry(sourceEntry, candidateOutputPath));
      reportEntries.push(
        entryReport({
          inputPath,
          outputPath: candidateOutputPath,
          sourceEntry,
          disposition: candidateOutputPath === inputPath ? 'preserved-binary' : 'transformed-binary',
          adapter: 'binary',
          mappings: candidatePathMappings,
          reason: 'binary content is preserved byte-for-byte; first-party asset path mapping is explicit',
        }),
      );
      continue;
    }

    let text;
    try {
      text = decodeText(sourceEntry.content);
    } catch (error) {
      const item = unresolvedForPath(
        inputPath,
        'binary-decode',
        `non-UTF-8 text cannot be transformed: ${error.message}`,
      );
      unresolved.push(item);
      transformed.push(cloneEntry(sourceEntry));
      reportEntries.push(
        entryReport({
          inputPath,
          outputPath: inputPath,
          sourceEntry,
          disposition: 'unresolved',
          adapter: 'unknown',
          reason: item.reason,
          diagnostics: [item],
        }),
      );
      continue;
    }

    const adapter = adapterFor(inputPath, textAdapter);
    if (!adapter) {
      const preserved = normalizePreservedReferences(
        inputPath,
        text,
        preservedRecordsForText(inputPath, text, policy),
      );
      const audit = auditBrandOccurrences(inputPath, text, [], preserved);
      const items = audit.residuals;
      if (items.length > 0) {
        const unsupported = unresolvedForPath(
          inputPath,
          'unsupported-language',
          'unsupported text language contains first-party brand references outside explicit preservation spans; add an adapter or policy rule',
          { residuals: items },
        );
        unresolved.push(unsupported, ...items);
        transformed.push(cloneEntry(sourceEntry));
        reportEntries.push(
          entryReport({
            inputPath,
            outputPath: inputPath,
            sourceEntry,
            disposition: 'unresolved',
            adapter: 'unsupported',
            mappings: [...preserved, ...candidatePathMappings],
            accounting: audit.accounting,
            preserved,
            reason: unsupported.reason,
            diagnostics: [unsupported, ...items],
          }),
        );
      } else {
        addReferences(preserved);
        transformed.push(cloneEntry(sourceEntry, candidateOutputPath));
        reportEntries.push(
          entryReport({
            inputPath,
            outputPath: candidateOutputPath,
            sourceEntry,
            disposition: candidateOutputPath === inputPath ? 'unchanged' : 'transformed',
            adapter: 'none',
            mappings: [...preserved, ...candidatePathMappings],
            accounting: audit.accounting,
            preserved,
          }),
        );
      }
      continue;
    }

    let result;
    try {
      result = runAdapter(adapter, { path: inputPath, text, policy, input }, textAdapter);
    } catch (error) {
      const audit = auditBrandOccurrences(inputPath, text, [], []);
      const item = unresolvedForPath(
        inputPath,
        'adapter-error',
        `${adapter} adapter failed closed: ${error.message}`,
        { error: error.message, residuals: audit.residuals },
      );
      unresolved.push(item, ...audit.residuals);
      transformed.push(cloneEntry(sourceEntry));
      reportEntries.push(
        entryReport({
          inputPath,
          outputPath: inputPath,
          sourceEntry,
          disposition: 'unresolved',
          adapter,
          accounting: audit.accounting,
          reason: item.reason,
          diagnostics: [item, ...audit.residuals],
        }),
      );
      continue;
    }

    let metadata;
    try {
      metadata = normalizeAdapterResult(inputPath, text, result);
    } catch (error) {
      const audit = auditBrandOccurrences(inputPath, text, [], []);
      const item = unresolvedForPath(
        inputPath,
        'adapter-metadata',
        `${result.adapter ?? adapter} adapter emitted invalid provenance metadata: ${error.message}`,
        { error: error.message, residuals: audit.residuals },
      );
      unresolved.push(item, ...audit.residuals);
      transformed.push(cloneEntry(sourceEntry));
      reportEntries.push(
        entryReport({
          inputPath,
          outputPath: inputPath,
          sourceEntry,
          disposition: 'unresolved',
          adapter: result.adapter ?? adapter,
          accounting: audit.accounting,
          reason: item.reason,
          diagnostics: [item, ...audit.residuals],
        }),
      );
      continue;
    }

    const audit = auditBrandOccurrences(inputPath, text, metadata.mappings, metadata.preserved);
    const adapterUnresolved = (result.unresolved ?? []).map((item) =>
      unresolvedForPath(inputPath, item.kind ?? 'parser-error', item.reason ?? 'adapter unresolved', item),
    );
    const unresolvedForEntry = [...adapterUnresolved, ...audit.residuals];
    addReferences(metadata.preserved);

    if (unresolvedForEntry.length > 0) {
      unresolved.push(...unresolvedForEntry);
      transformed.push(cloneEntry(sourceEntry));
      reportEntries.push(
        entryReport({
          inputPath,
          outputPath: inputPath,
          sourceEntry,
          disposition: 'unresolved',
          adapter: result.adapter,
          mappings: [...metadata.mappings, ...metadata.preserved, ...candidatePathMappings],
          symbols: metadata.symbols,
          accounting: audit.accounting,
          preserved: metadata.preserved,
          editCount: (result.edits ?? []).length,
          reason: unresolvedForEntry.map((item) => item.reason).join('; '),
          diagnostics: unresolvedForEntry,
        }),
      );
      continue;
    }

    let outputText;
    try {
      outputText = applyEdits(text, result.edits ?? []);
    } catch (error) {
      const item = unresolvedForPath(
        inputPath,
        'overlapping-edits',
        `${result.adapter} adapter produced ambiguous overlapping semantic edits: ${error.message}`,
        { error: error.message },
      );
      unresolved.push(item);
      transformed.push(cloneEntry(sourceEntry));
      reportEntries.push(
        entryReport({
          inputPath,
          outputPath: inputPath,
          sourceEntry,
          disposition: 'unresolved',
          adapter: result.adapter,
          mappings: [...metadata.mappings, ...metadata.preserved, ...candidatePathMappings],
          symbols: metadata.symbols,
          accounting: audit.accounting,
          preserved: metadata.preserved,
          editCount: (result.edits ?? []).length,
          reason: item.reason,
          diagnostics: [item],
        }),
      );
      continue;
    }

    transformed.push(cloneEntry(sourceEntry, candidateOutputPath, Buffer.from(outputText, 'utf8')));
    reportEntries.push(
      entryReport({
        inputPath,
        outputPath: candidateOutputPath,
        sourceEntry,
        disposition:
          (result.edits ?? []).length > 0 || candidateOutputPath !== inputPath ? 'transformed' : 'unchanged',
        adapter: result.adapter,
        mappings: [...metadata.mappings, ...metadata.preserved, ...candidatePathMappings],
        symbols: metadata.symbols,
        accounting: audit.accounting,
        preserved: metadata.preserved,
        editCount: (result.edits ?? []).length,
      }),
    );
  }

  const collisions = collisionRecords(reportEntries);
  for (const collision of collisions) {
    unresolved.push(collision);
    for (const reportEntry of reportEntries) {
      if (collision.inputPaths.includes(reportEntry.inputPath)) {
        reportEntry.disposition = 'unresolved';
        reportEntry.reason = reportEntry.reason
          ? `${reportEntry.reason}; ${collision.reason}`
          : collision.reason;
        reportEntry.diagnostics = [...(reportEntry.diagnostics ?? []), collision];
      }
    }
  }

  const mappings = reportEntries.flatMap((entry) => entry.mappings);
  const symbols = reportEntries.flatMap((entry) => entry.symbols);
  const report = {
    version: 2,
    mappingSchema: MAPPING_SCHEMA,
    provenance: {
      schemaVersion: 1,
      source: 'parser-backed-first-party-rebrand',
      input,
      policyVersion: policy.version,
      transformIdentity: identity.digest,
      transformIdentityInputs: identity.inputs,
    },
    input,
    complete: unresolved.length === 0,
    generationAllowed: unresolved.length === 0,
    transformIdentity: identity.digest,
    transformIdentityInputs: identity.inputs,
    transformIdentityFileDigests: identity.fileDigests,
    entries: reportEntries,
    mappings,
    symbols,
    unresolved,
    collisions,
    preservedReferences,
    legacyReferences,
  };
  return { entries: transformed, report };
}
