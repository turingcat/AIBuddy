import { readFileSync } from 'node:fs';

import { parseDocument } from 'yaml';

import {
  brandOccurrencePattern,
  deduplicateEdits,
  makeEdit,
  ownedExternalUrlIsReplaceable,
  renameBrandSegments,
  textHasBrand,
} from './shared.mjs';

const TEXT_POLICY = JSON.parse(
  readFileSync(new URL('../../text-policy.json', import.meta.url), 'utf8'),
);

const TOKEN_CHARACTER = /[A-Za-z0-9_$@.%/:-]/u;
const URL_PATTERN = /\b(?:https?|wss?|git\+(?:https?|wss?)):\/\/[^\s"'`<>]+/gu;

function pathMatchesPrefix(path, prefix) {
  const lookupPath = policyLookupPath(path);
  return (
    path === prefix ||
    path.startsWith(prefix) ||
    lookupPath === prefix ||
    lookupPath.startsWith(prefix)
  );
}

function policyLookupPath(path) {
  return path
    .replaceAll('heybuddies', 'geese')
    .replaceAll('aibuddies', 'geese')
    .replaceAll('heybuddy', 'goose')
    .replaceAll('aibuddy', 'goose');
}

function extensionFor(path) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function exactPath(path, paths) {
  return paths.includes(path) || paths.includes(policyLookupPath(path));
}

function isExcludedPath(path) {
  return TEXT_POLICY.excludedPathPrefixes.some((prefix) => pathMatchesPrefix(path, prefix));
}

function isPreservedPath(path) {
  return (
    exactPath(path, TEXT_POLICY.preserve.exactPaths) ||
    TEXT_POLICY.preserve.pathPrefixes.some((prefix) => pathMatchesPrefix(path, prefix))
  );
}

function isDocumentationPath(path) {
  const extension = extensionFor(path);
  return (
    exactPath(path, TEXT_POLICY.documentation.exactPaths) ||
    TEXT_POLICY.documentation.pathPrefixes.some(
      (prefix) => pathMatchesPrefix(path, prefix) && TEXT_POLICY.documentation.extensions.includes(extension),
    )
  );
}

function isScriptPath(path) {
  return exactPath(path, TEXT_POLICY.scripts.exactPaths);
}

function isLiteralPath(path) {
  return exactPath(path, TEXT_POLICY.literalPaths);
}

function isSvgPath(path) {
  return exactPath(path, TEXT_POLICY.svg?.exactPaths ?? []);
}

function isStructuredJsonPath(path) {
  return (
    exactPath(path, TEXT_POLICY.structuredJson.exactPaths) ||
    exactPath(path, TEXT_POLICY.structuredJson.jsonLinesPaths)
  );
}

function isInstaSnapshotPath(path) {
  return exactPath(path, TEXT_POLICY.instaSnapshots.exactPaths);
}

function isYamlFrontmatterTextPath(path) {
  return exactPath(path, TEXT_POLICY.yamlFrontmatterText.exactPaths);
}

export function isMcpReplayPath(path) {
  return (TEXT_POLICY.mcpReplay?.pathPrefixes ?? []).some((prefix) =>
    pathMatchesPrefix(path, prefix),
  );
}

function policyContextMatchesPath(path, context) {
  return (
    (context.paths ?? []).some((candidate) => exactPath(path, [candidate])) ||
    (context.pathPrefixes ?? []).some((prefix) => pathMatchesPrefix(path, prefix))
  );
}

function pathKind(path) {
  if (isExcludedPath(path)) return undefined;
  if (isMcpReplayPath(path)) return 'mcp-replay';
  if (isPreservedPath(path)) return 'preserved-external';
  if (isInstaSnapshotPath(path)) return 'insta-snapshot';
  if (isYamlFrontmatterTextPath(path)) return 'yaml-frontmatter-text';
  if (isStructuredJsonPath(path)) return 'structured-json';
  if (isScriptPath(path)) return 'script';
  if (isSvgPath(path)) return 'svg';
  if (isLiteralPath(path)) return 'literal';
  if (isDocumentationPath(path)) return 'documentation';
  return undefined;
}

export function supportsText(path) {
  return typeof path === 'string' && pathKind(path) !== undefined;
}

function preservedRecord({ path, start, end, value, reason, disposition }) {
  return {
    path,
    start,
    end,
    value,
    reason,
    ...(disposition ? { disposition } : {}),
  };
}

function lineSpans(text) {
  const spans = [];
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    spans.push({ start, end, value: text.slice(start, end) });
    if (newline === -1) break;
    start = newline + 1;
  }
  return spans;
}

function legalLineCandidates(path, text) {
  const patterns = TEXT_POLICY.preserve.legalLinePatterns.map((pattern) => new RegExp(pattern, 'iu'));
  return lineSpans(text)
    .filter(({ value }) => textHasBrand(value) && patterns.some((pattern) => pattern.test(value)))
    .map(({ start, end, value }) => ({
      path,
      start,
      end,
      value,
      reason: 'explicit legal or SPDX notice preservation policy',
      priority: 100,
    }));
}

function literalCandidates(path, text, literals, reason) {
  const candidates = [];
  for (const literal of new Set(literals.filter((value) => typeof value === 'string' && value.length > 0))) {
    let start = 0;
    while (start < text.length) {
      const match = text.indexOf(literal, start);
      if (match === -1) break;
      const value = text.slice(match, match + literal.length);
      if (textHasBrand(value)) {
        candidates.push({
          path,
          start: match,
          end: match + literal.length,
          value,
          reason,
          priority: 70,
        });
      }
      start = match + literal.length;
    }
  }
  return candidates;
}

function protectedCandidates(path, text, policy) {
  const preserve = policy?.preserve ?? {};
  const literals = [
    ...(preserve.externalIdentifiers ?? []),
    ...(preserve.externalRepositorySlugs ?? []),
    ...(preserve.legacyIdentifiers ?? []),
    ...(preserve.legacyProtocolContexts ?? []).flatMap((context) =>
      (context.protocols ?? []).filter(
        (protocol) => protocol.includes('://') || policyContextMatchesPath(path, context),
      ),
    ),
    ...(preserve.legacyProtocols ?? []),
    ...(TEXT_POLICY.preserve.literalValues ?? []),
  ];
  const candidates = [
    ...legalLineCandidates(path, text),
    ...[...text.matchAll(URL_PATTERN)].flatMap((match) => {
      let end = match.index + match[0].length;
      while (end > match.index && /[.,;:!?)}\]]/u.test(text[end - 1])) end -= 1;
      const value = text.slice(match.index, end);
      return textHasBrand(value) && !ownedExternalUrlIsReplaceable(value, path, policy)
        ? [{
            path,
            start: match.index,
            end,
            value,
            reason: 'complete normal URL preservation policy',
            priority: 80,
          }]
        : [];
    }),
    ...literalCandidates(path, text, literals, 'explicit external, repository, or legacy identifier preservation policy'),
  ];

  candidates.sort((left, right) =>
    left.start - right.start || right.priority - left.priority || right.end - left.end,
  );
  const selected = [];
  for (const candidate of candidates) {
    if (selected.some((span) => candidate.start < span.end && span.start < candidate.end)) {
      continue;
    }
    selected.push(candidate);
  }
  return selected.sort((left, right) => left.start - right.start || left.end - right.end);
}

function tokenStart(text, index, lowerBound) {
  let start = index;
  while (start > lowerBound && TOKEN_CHARACTER.test(text[start - 1])) start -= 1;
  return start;
}

function tokenEnd(text, index, upperBound) {
  let end = index;
  while (end < upperBound && TOKEN_CHARACTER.test(text[end])) end += 1;
  return end;
}

function editsForChunk({ path, text, start, end }) {
  const chunk = text.slice(start, end);
  const edits = [];
  const ranges = new Set();
  for (const match of chunk.matchAll(brandOccurrencePattern())) {
    const localStart = tokenStart(chunk, match.index, 0);
    const localEnd = tokenEnd(chunk, match.index + match[0].length, chunk.length);
    const rangeKey = `${localStart}:${localEnd}`;
    if (ranges.has(rangeKey)) continue;
    ranges.add(rangeKey);
    const original = chunk.slice(localStart, localEnd);
    const replacement = renameBrandSegments(original);
    if (replacement === original) continue;
    edits.push({
      ...makeEdit({
        start: start + localStart,
        end: start + localEnd,
        replacement,
        original,
        kind: 'text-literal',
      }),
      path,
    });
  }
  return edits;
}

function scopedLiteralEdits(path, text, ranges, protectedSpans) {
  const edits = [];
  for (const range of ranges) {
    let start = range.start;
    const relevantSpans = protectedSpans.filter(
      (span) => span.start < range.end && range.start < span.end,
    );
    for (const span of relevantSpans) {
      const protectedStart = Math.max(start, span.start, range.start);
      const protectedEnd = Math.min(span.end, range.end);
      if (start < protectedStart) edits.push(...editsForChunk({ path, text, start, end: protectedStart }));
      start = Math.max(start, protectedEnd);
    }
    if (start < range.end) edits.push(...editsForChunk({ path, text, start, end: range.end }));
  }
  return deduplicateEdits(edits);
}

function literalEdits(path, text, protectedSpans) {
  return scopedLiteralEdits(path, text, [{ start: 0, end: text.length }], protectedSpans);
}

function mcpReplayResult(path, text, policy) {
  const transformLinePrefixes = TEXT_POLICY.mcpReplay?.transformLinePrefixes ?? [];
  const lines = lineSpans(text);
  const ranges = lines.filter(({ value }) =>
    transformLinePrefixes.some((prefix) => value.startsWith(prefix)),
  );
  const protectedSpans = protectedCandidates(path, text, policy).filter((span) =>
    ranges.some((range) => range.start < span.end && span.start < range.end),
  );
  const recordedOutputSpans = lines
    .filter(({ value }) =>
      textHasBrand(value) &&
      !transformLinePrefixes.some((prefix) => value.startsWith(prefix)),
    )
    .map(({ start, end, value }) => ({
      path,
      start,
      end,
      value,
      reason: 'recorded MCP server output or playback diagnostic preservation policy',
      disposition: 'preserved-recorded-output',
    }));
  const edits = scopedLiteralEdits(path, text, ranges, protectedSpans);
  const preserved = [
    ...protectedSpans.map(({ priority, ...span }) => preservedRecord(span)),
    ...recordedOutputSpans.map((span) => preservedRecord(span)),
  ];
  return { adapter: 'text', edits, preserved, symbols: [] };
}

function svgCommentEdits(path, text, protectedSpans) {
  const ranges = [];
  for (const match of text.matchAll(/<!--[\s\S]*?-->/gu)) {
    ranges.push({
      start: match.index + 4,
      end: match.index + match[0].length - 3,
    });
  }
  return scopedLiteralEdits(path, text, ranges, protectedSpans);
}

function parseJsonLines(text) {
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim() === '') continue;
    try {
      JSON.parse(line);
    } catch (error) {
      throw new Error(`JSONL line ${index + 1} parse failed: ${error.message}`);
    }
  }
}

function validateStructuredText(path, text) {
  if (exactPath(path, TEXT_POLICY.structuredJson.jsonLinesPaths)) {
    parseJsonLines(text);
    return;
  }
  JSON.parse(text);
}

function parseYamlFrontmatter(text, requireExpression) {
  const opening = text.match(/^---[ \t]*\r?\n/u);
  if (!opening) {
    throw new Error('YAML frontmatter text is missing the opening delimiter');
  }

  const headerStart = opening[0].length;
  const closing = /^---[ \t]*\r?\n/mu.exec(text.slice(headerStart));
  if (!closing) {
    throw new Error('YAML frontmatter text is missing the closing delimiter');
  }

  const headerEnd = headerStart + closing.index + closing[0].length;
  const headerText = text.slice(headerStart, headerStart + closing.index);
  const document = parseDocument(headerText, { keepSourceTokens: true });
  if (document.errors.length > 0) {
    throw new Error(`YAML frontmatter parse failed: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  const metadata = document.toJS();
  if (requireExpression && (!metadata || typeof metadata !== 'object' || typeof metadata.expression !== 'string')) {
    throw new Error('Insta snapshot YAML frontmatter requires an expression field');
  }
  return { headerEnd, metadata };
}

function instaMetadataPreserved(path, text, headerEnd) {
  return lineSpans(text.slice(0, headerEnd))
    .filter(({ value }) => textHasBrand(value))
    .map(({ start, end, value }) => ({
      path,
      start,
      end,
      value,
      reason: 'Insta snapshot YAML frontmatter metadata preservation policy',
      priority: 95,
    }));
}

function unsupportedResult(path) {
  return {
    adapter: 'text',
    edits: [],
    preserved: [],
    symbols: [],
    unresolved: [
      {
        kind: 'unsupported-path',
        reason: `text adapter has no reviewed literal scope for ${path}`,
      },
    ],
  };
}

export function transformText({ path, text, policy }) {
  if (!supportsText(path)) return unsupportedResult(path);
  if (typeof text !== 'string') {
    return {
      adapter: 'text',
      edits: [],
      preserved: [],
      symbols: [],
      unresolved: [{ kind: 'invalid-input', reason: 'text adapter requires a string input' }],
    };
  }

  const kind = pathKind(path);
  if (kind === 'mcp-replay') {
    return mcpReplayResult(path, text, policy);
  }
  if (kind === 'preserved-external') {
    return {
      adapter: 'text',
      edits: [],
      preserved: [
        preservedRecord({
          path,
          start: 0,
          end: text.length,
          value: text,
          reason: 'explicit external vendored launcher, replay, or evaluation source preservation policy',
          disposition: 'preserved-external',
        }),
      ],
      symbols: [],
    };
  }

  if (kind === 'structured-json') {
    try {
      validateStructuredText(path, text);
    } catch (error) {
      return {
        adapter: 'text',
        edits: [],
        preserved: [],
        symbols: [],
        unresolved: [{ kind: 'structured-parse', reason: `JSON parse failed: ${error.message}` }],
      };
    }
  }

  let scopedStart = 0;
  let metadataPreserved = [];
  if (kind === 'insta-snapshot' || kind === 'yaml-frontmatter-text') {
    try {
      const { headerEnd } = parseYamlFrontmatter(text, kind === 'insta-snapshot');
      scopedStart = headerEnd;
      metadataPreserved = instaMetadataPreserved(path, text, headerEnd);
    } catch (error) {
      return {
        adapter: 'text',
        edits: [],
        preserved: [],
        symbols: [],
        unresolved: [{ kind: 'structured-parse', reason: error.message }],
      };
    }
  }

  const scopedText = text.slice(scopedStart);
  const scopedProtectedSpans = protectedCandidates(path, scopedText, policy).map((span) => ({
    ...span,
    start: span.start + scopedStart,
    end: span.end + scopedStart,
  }));
  const protectedSpans = [...metadataPreserved, ...scopedProtectedSpans].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const edits = kind === 'svg'
    ? svgCommentEdits(path, text, protectedSpans)
    : literalEdits(path, text, protectedSpans);
  const preserved = protectedSpans.map(({ priority, ...span }) => preservedRecord(span));
  return {
    adapter: 'text',
    edits,
    preserved,
    symbols: [],
  };
}
