import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addPreservedValueSpans,
  applyEdits,
  deduplicateEdits,
  inputKeyFromLine,
  isExplicitlyPreserved,
  isExternalUrl,
  legacyProtocolIsPreserved,
  makeEdit,
  makePreservedReference,
  renameBrandSegments,
  stringReplacement,
  textHasBrand,
} from './shared.mjs';

const ADAPTER_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const RUST_PARSER_ROOT = resolve(ADAPTER_DIRECTORY, '../../rust-parser');
const RUST_PARSER_MANIFEST = resolve(RUST_PARSER_ROOT, 'Cargo.toml');
const RUST_PARSER_TARGET = resolve(RUST_PARSER_ROOT, 'target');
const RUST_PARSER_BINARY = resolve(
  RUST_PARSER_TARGET,
  'release',
  process.platform === 'win32' ? 'rust-parser.exe' : 'rust-parser',
);
const MAX_BUFFER = 64 * 1024 * 1024;
const BRAND_OCCURRENCE = /(?:goose|geese)/giu;

let preparedParser;

function parserSourceFiles() {
  const files = [RUST_PARSER_MANIFEST, resolve(RUST_PARSER_ROOT, 'Cargo.lock')];
  const pending = [resolve(RUST_PARSER_ROOT, 'src')];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files.sort();
}

function parserSourceFingerprint() {
  const hash = createHash('sha256');
  for (const path of parserSourceFiles()) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function prepareRustParser() {
  const fingerprint = parserSourceFingerprint();
  if (preparedParser?.fingerprint === fingerprint && existsSync(RUST_PARSER_BINARY)) {
    return RUST_PARSER_BINARY;
  }

  const result = spawnSync(
    'cargo',
    [
      'build',
      '--locked',
      '--release',
      '--manifest-path',
      RUST_PARSER_MANIFEST,
      '--target-dir',
      RUST_PARSER_TARGET,
    ],
    {
      cwd: RUST_PARSER_ROOT,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.error) throw new Error(`Rust parser helper build failed: ${result.error.message}`);
  if (result.status !== 0) {
    const details = result.stderr?.trim() || result.stdout?.trim() || 'unknown cargo failure';
    throw new Error(`Rust parser helper build failed: ${details}`);
  }
  if (!existsSync(RUST_PARSER_BINARY)) {
    throw new Error(`Rust parser helper did not produce ${RUST_PARSER_BINARY}`);
  }

  preparedParser = { fingerprint, binary: RUST_PARSER_BINARY };
  return RUST_PARSER_BINARY;
}

function invokeRustParser(text) {
  const result = spawnSync(prepareRustParser(), [], {
    cwd: RUST_PARSER_ROOT,
    encoding: 'utf8',
    input: text,
    maxBuffer: MAX_BUFFER,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw new Error(`Rust parser helper failed: ${result.error.message}`);
  if (result.status !== 0) {
    const details = result.stderr?.trim() || result.stdout?.trim() || 'unknown helper failure';
    throw new Error(`Rust parser helper failed: ${details}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Rust parser helper returned invalid JSON: ${error.message}`);
  }
}

function utf8ToUtf16Boundaries(text) {
  const boundaries = new Int32Array(Buffer.byteLength(text, 'utf8') + 1);
  boundaries.fill(-1);
  let byteOffset = 0;
  let utf16Offset = 0;
  boundaries[0] = 0;
  while (utf16Offset < text.length) {
    const character = String.fromCodePoint(text.codePointAt(utf16Offset));
    byteOffset += Buffer.byteLength(character, 'utf8');
    utf16Offset += character.length;
    boundaries[byteOffset] = utf16Offset;
  }
  return boundaries;
}

function mapSpan(span, boundaries, label) {
  if (
    !Number.isInteger(span?.start) ||
    !Number.isInteger(span?.end) ||
    span.start < 0 ||
    span.end < span.start ||
    span.end >= boundaries.length
  ) {
    throw new Error(`Rust parser returned an invalid ${label} span`);
  }
  const start = boundaries[span.start];
  const end = boundaries[span.end];
  if (start < 0 || end < 0) throw new Error(`Rust parser returned a non-character ${label} span`);
  return { start, end };
}

function literalParts(raw) {
  const quote = raw.indexOf('"');
  if (quote < 0) return undefined;
  const prefix = raw.slice(0, quote);
  const rawMatch = prefix.match(/^(?:b|c)?r(#+)?$/u);
  if (rawMatch) {
    const closing = `"${'#'.repeat(rawMatch[1]?.length ?? 0)}`;
    if (!raw.endsWith(closing)) return undefined;
    return {
      value: raw.slice(quote + 1, raw.length - closing.length),
      openEnd: quote + 1,
      closeStart: raw.length - closing.length,
    };
  }
  if (!['', 'b', 'c'].includes(prefix) || !raw.endsWith('"')) return undefined;
  return { value: raw.slice(quote + 1, -1), openEnd: quote + 1, closeStart: raw.length - 1 };
}

function replaceLiteral(raw, replacement) {
  const parts = literalParts(raw);
  if (!parts) return raw;
  return `${raw.slice(0, parts.openEnd)}${replacement}${raw.slice(parts.closeStart)}`;
}

function rustInputKey(text, start) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const prefix = text.slice(lineStart, start);
  const field = prefix.match(/(?:^|[,\{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/u);
  return field?.[1] ?? inputKeyFromLine(text, start);
}

function literalKey(token, text, start) {
  return token.key ?? rustInputKey(text, start);
}

function failureResult(text, reason, errors = []) {
  const unresolved = [{ reason, ...(errors.length > 0 ? { errors } : {}) }];
  return {
    adapter: 'rust',
    text,
    edits: [],
    preserved: [],
    symbols: [],
    errors: unresolved,
    unresolved,
  };
}

function preserveReference({ path, start, end, value, key, reason }) {
  return makePreservedReference({ path, start, end, value, key, reason });
}

function coveredByRange(ranges, start, end) {
  return ranges.some((range) => range.start <= start && range.end >= end);
}

function auditBrandCoverage(text, edits, preserved) {
  const ranges = [...edits, ...preserved];
  const uncovered = [];
  for (const match of text.matchAll(BRAND_OCCURRENCE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!coveredByRange(ranges, start, end)) uncovered.push({ start, end, value: match[0] });
  }
  return uncovered;
}

export function transformRust({ path, text, policy }) {
  const boundaries = utf8ToUtf16Boundaries(text);
  let parsed;
  try {
    parsed = invokeRustParser(text);
  } catch (error) {
    return failureResult(text, error.message);
  }

  const parserErrors = (parsed.errors ?? []).map((error) => {
    const mapped =
      Number.isInteger(error.start) && Number.isInteger(error.end)
        ? mapSpan(error, boundaries, 'diagnostic')
        : { start: undefined, end: undefined };
    return { ...mapped, message: error.message };
  });
  if (!parsed.ok || parserErrors.length > 0) {
    return failureResult(
      text,
      `Rust parse failed${parserErrors.length > 0 ? `: ${parserErrors.map((error) => error.message).join('; ')}` : ''}`,
      parserErrors,
    );
  }

  const edits = [];
  const preserved = [];
  const symbols = [];
  const identifierValues = new Set();

  for (const token of parsed.tokens ?? []) {
    const span = mapSpan(token, boundaries, token.kind);
    const raw = text.slice(span.start, span.end);
    if (token.kind === 'identifier') {
      identifierValues.add(raw);
      if (!textHasBrand(raw)) continue;
      if (isExplicitlyPreserved(raw, policy)) {
        preserved.push(
          preserveReference({
            path,
            start: span.start,
            end: span.end,
            value: raw,
            reason: 'explicit external identifier preservation policy',
          }),
        );
        continue;
      }
      const replacement = renameBrandSegments(raw);
      if (replacement !== raw) {
        edits.push(
          makeEdit({
            start: span.start,
            end: span.end,
            replacement,
            original: raw,
            kind: 'rust-identifier',
          }),
        );
        symbols.push({ original: raw, replacement, start: span.start, end: span.end });
      } else {
        preserved.push(
          preserveReference({
            path,
            start: span.start,
            end: span.end,
            value: raw,
            reason: 'shared naming policy preserves this Rust identifier segment',
          }),
        );
      }
      continue;
    }

    if (token.kind !== 'literal') continue;
    const parts = literalParts(raw);
    if (!parts || !textHasBrand(parts.value)) continue;
    const key = literalKey(token, text, span.start);
    const replacement = stringReplacement(parts.value, {
      path,
      key,
      policy,
    });
    addPreservedValueSpans({
      preserved,
      path,
      start: span.start,
      end: span.end,
      raw,
      value: parts.value,
      key,
      spans: replacement.preservedSpans,
    });
    if (replacement.replacement !== parts.value) {
      edits.push(
        makeEdit({
          start: span.start,
          end: span.end,
          replacement: replaceLiteral(raw, replacement.replacement),
          original: raw,
          kind: 'rust-string',
          key,
        }),
      );
    } else if (replacement.preservedSpans.length === 0) {
      preserved.push(
        preserveReference({
          path,
          start: span.start,
          end: span.end,
          value: raw,
          key,
          reason: 'shared naming policy preserves this Rust literal',
        }),
      );
    }
  }

  for (const comment of parsed.comments ?? []) {
    const span = mapSpan(comment, boundaries, 'comment');
    const raw = text.slice(span.start, span.end);
    if (!textHasBrand(raw)) continue;
    const preservesUrl = isExternalUrl(raw, policy);
    const preservesProtocol = legacyProtocolIsPreserved(raw, path, undefined, policy);
    if (preservesUrl || preservesProtocol) {
      preserved.push(
        preserveReference({
          path,
          start: span.start,
          end: span.end,
          value: raw,
          reason: preservesUrl
            ? 'explicit external URL preservation policy'
            : 'explicit legacy protocol acceptance policy for this module',
        }),
      );
      continue;
    }
    const replacement = renameBrandSegments(raw);
    if (replacement !== raw) {
      edits.push(
        makeEdit({
          start: span.start,
          end: span.end,
          replacement,
          original: raw,
          kind: 'rust-comment',
        }),
      );
    } else {
      preserved.push(
        preserveReference({
          path,
          start: span.start,
          end: span.end,
          value: raw,
          reason: 'shared naming policy preserves this Rust comment segment',
        }),
      );
    }
  }

  const collisions = symbols.filter(
    (symbol) => identifierValues.has(symbol.replacement) && symbol.original !== symbol.replacement,
  );
  if (collisions.length > 0) return failureResult(text, 'Rust identifier target collision', collisions);

  const uniqueEdits = deduplicateEdits(edits);
  const uncovered = auditBrandCoverage(text, uniqueEdits, preserved);
  if (uncovered.length > 0) {
    return failureResult(text, 'Rust brand occurrence was not covered by an edit or preservation record', uncovered);
  }

  return {
    adapter: 'rust',
    text: applyEdits(text, uniqueEdits),
    edits: uniqueEdits,
    preserved,
    symbols,
    errors: [],
  };
}
