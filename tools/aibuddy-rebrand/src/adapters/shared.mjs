import { applyUpstreamCorrections, createBrandPattern, mappedBrand } from '../brand-map.mjs';

const BRAND_PATTERN = createBrandPattern('g');
const BRAND_OCCURRENCE_PATTERN = createBrandPattern('g');
const IDENTIFIER_PART = /[A-Za-z0-9_$]/u;
const URL_PATTERN = /(?:https?|wss?|git\+(?:https?|wss?)):\/\/[^\s'"`<>]+/gu;

export const ADAPTER_VERSION = 1;

export function canonicalBrand(value) {
  return mappedBrand(value);
}

export function renameBrandSegments(value) {
  const corrected = applyUpstreamCorrections(value);
  const renamed = corrected.replace(BRAND_PATTERN, (match, offset, source) => {
    const before = offset === 0 ? '' : source[offset - 1];
    const after = source[offset + match.length] ?? '';
    const boundary = (character) =>
      character === '' || /[-./:@_$]/u.test(character) || !IDENTIFIER_PART.test(character);
    const suffix = source.slice(offset + match.length).match(/^[A-Za-z0-9]*/u)?.[0] ?? '';
    const isLower = match === match.toLowerCase();
    const isUpper = match === match.toUpperCase();
    const isTitle = !isLower && !isUpper;
    const prefix = source.slice(0, offset).split(/[-./:@_$]/u).at(-1) ?? '';
    const camelCaseLeftBoundary = isTitle && /[a-z0-9]/u.test(before);
    const delimitedLowerPrefix = isLower && /[-./:@_$]/u.test(before);
    const numericLowerPrefix = isLower && /[0-9]/u.test(before);
    const percentEncodedLowerPrefix =
      isLower && /^%[0-9A-F]{2}$/u.test(source.slice(Math.max(0, offset - 3), offset).toUpperCase());
    const ownedLowerPrefix = isLower && ['lib', 'local'].includes(prefix) && boundary(after);
    const upperRightBoundary = isUpper && boundary(after);
    const productSuffix = /^(?:d|y|hints|selftest)(?:$|[A-Z0-9])/u.test(suffix);
    const leftBoundary =
      boundary(before) ||
      camelCaseLeftBoundary ||
      numericLowerPrefix ||
      percentEncodedLowerPrefix ||
      ownedLowerPrefix ||
      upperRightBoundary;
    const rightBoundary =
      boundary(after) ||
      /[A-Z0-9]/u.test(after) ||
      /[A-Z]/u.test(suffix) ||
      camelCaseLeftBoundary ||
      delimitedLowerPrefix ||
      productSuffix;
    const compound = leftBoundary && rightBoundary;
    if (!compound && IDENTIFIER_PART.test(before) && IDENTIFIER_PART.test(after)) {
      return match;
    }
    if (!compound && (IDENTIFIER_PART.test(before) || IDENTIFIER_PART.test(after))) {
      return match;
    }
    return canonicalBrand(match);
  });
  return renamed.replace(/@aaif\/(aibuddy(?:-|$))/gu, '@aibuddy/$1');
}

export function findBrandOccurrences(value) {
  return [...value.matchAll(BRAND_OCCURRENCE_PATTERN)].map((match) => ({
    original: match[0],
    start: match.index,
    end: match.index + match[0].length,
    offsetEncoding: 'utf-16',
  }));
}

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function addValueMatches(spans, value, needle, reason) {
  if (!needle) return;
  const pattern = new RegExp(escapedPattern(needle), 'gu');
  for (const match of value.matchAll(pattern)) {
    spans.push({
      start: match.index,
      end: match.index + needle.length,
      value: match[0],
      reason,
    });
  }
}

function addPatternMatches(spans, value, patternText, reason) {
  const pattern = new RegExp(patternText, 'gu');
  for (const match of value.matchAll(pattern)) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      value: match[0],
      reason,
    });
  }
}

function mergeSpans(spans) {
  const sorted = [...spans].sort((left, right) => left.start - right.start || right.end - left.end);
  const merged = [];
  for (const span of sorted) {
    const previous = merged.at(-1);
    if (previous && span.start <= previous.end) {
      previous.end = Math.max(previous.end, span.end);
      previous.value = undefined;
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

function protocolSpanEnd(value, start) {
  const match = value.slice(start).match(/[^\s'"`<>]+/u);
  return start + (match?.[0].length ?? 0);
}

export function preservedValueSpans(value, { path, key, policy }) {
  const spans = [];
  const preserveWhole = (reason) => {
    spans.push({ start: 0, end: value.length, value, reason });
  };

  const attributionContext = (policy.preserve.historicalAttributionContexts ?? []).find((context) =>
    contextMatches(path, key, context),
  );
  if (attributionContext) {
    preserveWhole(attributionContext.reason ?? 'explicit historical attribution preservation policy');
  } else if (runtimeKeyIsPreserved(key, path, policy)) {
    preserveWhole('explicit runtime identity preservation policy');
  } else if (
    !value.includes('\n') &&
    policy.preserve.legalLinePatterns?.some((pattern) => new RegExp(pattern, 'iu').test(value))
  ) {
    preserveWhole('explicit legal/authorship preservation policy');
  } else {
    for (const match of value.matchAll(URL_PATTERN)) {
      if (
        (policy.preserve.ownedExternalUrlReplacements ?? []).some(({ from }) =>
          match[0].includes(from),
        )
      ) {
        continue;
      }
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        reason: 'explicit external URL preservation policy',
      });
    }
    for (const identifier of policy.preserve.externalIdentifiers ?? []) {
      addValueMatches(spans, value, identifier, 'explicit external identifier preservation policy');
    }
    for (const slug of policy.preserve.externalRepositorySlugs ?? []) {
      addValueMatches(spans, value, slug, 'explicit external repository slug preservation policy');
    }
    for (const identifier of policy.preserve.legacyIdentifiers ?? []) {
      if (legacyIdentifierIsPreserved(identifier, path, key, policy)) {
        addValueMatches(spans, value, identifier, 'explicit legacy identifier preservation policy');
      }
    }
    if ((policy.preserve.legacyIdentifierContexts ?? []).some((context) => contextMatches(path, key, context))) {
      for (const pattern of policy.preserve.legacyIdentifierPatterns ?? []) {
        addPatternMatches(spans, value, pattern, 'explicit legacy identifier pattern preservation policy');
      }
    }
    for (const context of policy.preserve.legacyProtocolContexts ?? []) {
      if (!contextMatches(path, key, context)) continue;
      for (const protocol of context.protocols ?? []) {
        let offset = value.indexOf(protocol);
        while (offset >= 0) {
          spans.push({
            start: offset,
            end: protocolSpanEnd(value, offset),
            value: value.slice(offset, protocolSpanEnd(value, offset)),
            reason: 'explicit legacy protocol acceptance policy for this module',
          });
          offset = value.indexOf(protocol, offset + protocol.length);
        }
      }
    }
    for (const context of policy.preserve.persistentIdentityContexts ?? []) {
      if (!contextMatches(path, key, context)) continue;
      for (const identity of context.values ?? []) {
        addValueMatches(
          spans,
          value,
          identity,
          'explicit persistent runtime identity preservation policy',
        );
      }
    }
    for (const context of policy.preserve.legacyFixtureRegexContexts ?? []) {
      if (!contextMatches(path, key, context) || !(context.values ?? []).includes(value)) continue;
      const preserveSubstrings = context.preserveSubstrings ?? [];
      if (preserveSubstrings.length === 0) {
        spans.push({
          start: 0,
          end: value.length,
          value,
          reason: context.reason ?? 'explicit legacy fixture regex preservation policy',
        });
        continue;
      }
      for (const substring of preserveSubstrings) {
        addValueMatches(
          spans,
          value,
          substring,
          context.reason ?? 'explicit legacy fixture regex substring preservation policy',
        );
      }
    }
  }
  return mergeSpans(spans);
}

export function replacePreservedValueSpans(value, spans) {
  if (spans.length === 0) return renameBrandSegments(value);
  let output = '';
  let cursor = 0;
  for (const span of spans) {
    output += renameBrandSegments(value.slice(cursor, span.start));
    output += value.slice(span.start, span.end);
    cursor = span.end;
  }
  return output + renameBrandSegments(value.slice(cursor));
}

export function isExternalUrl(value, policy) {
  return policy.preserve.externalUrlPrefixes.some((prefix) => value.includes(prefix));
}

export function isExplicitlyPreserved(value, policy) {
  return (
    policy.preserve.externalIdentifiers.includes(value) ||
    policy.preserve.externalRepositorySlugs.some((slug) => value.includes(slug)) ||
    isExternalUrl(value, policy)
  );
}

function contextMatches(path, key, context) {
  if (!path) return false;
  const pathMatches = (context.paths ?? []).includes(path) ||
    (context.pathPrefixes ?? []).some(
    (prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix),
    );
  const keyMatches = (context.keys ?? []).length === 0 || (key && context.keys.includes(key));
  return pathMatches && keyMatches;
}

export function runtimeKeyIsPreserved(key, path, policy) {
  if (!key || !path) {
    return false;
  }
  const normalized = key.toLowerCase();
  return policy.preserve.runtimeIdentityContexts.some(
    (context) =>
      contextMatches(path, key, context) &&
      policy.preserve.runtimeIdentityKeys.some(
        (candidate) => normalized === candidate || normalized.includes(candidate),
      ),
  );
}

export function legacyIdentifierIsPreserved(value, path, key, policy) {
  return (
    (policy.preserve.legacyIdentifiers.includes(value) ||
      (policy.preserve.legacyIdentifierPatterns ?? []).some((pattern) =>
        new RegExp(`^(?:${pattern})$`, 'u').test(value),
      )) &&
    policy.preserve.legacyIdentifierContexts.some((context) => contextMatches(path, key, context))
  );
}

export function legacyFixtureLiteralSpans(value, { path, key, policy }) {
  return (policy.preserve.legacyFixtureLiteralContexts ?? [])
    .filter(
      (context) =>
        context.match === 'literal-value' &&
        contextMatches(path, key, context) &&
        (context.values ?? []).includes(value),
    )
    .map((context) => ({
      start: 0,
      end: value.length,
      value,
      reason: context.reason ?? 'explicit legacy fixture literal preservation policy',
    }));
}

export function legacyProtocolIsPreserved(value, path, key, policy) {
  return policy.preserve.legacyProtocolContexts.some(
    (context) =>
      contextMatches(path, key, context) &&
      context.protocols.some((protocol) => value.includes(protocol)),
  );
}

export function stringReplacement(value, { path, key, policy, additionalPreservedSpans = [] }) {
  const preservedSpans = mergeSpans([
    ...preservedValueSpans(value, { path, key, policy }),
    ...legacyFixtureLiteralSpans(value, { path, key, policy }),
    ...additionalPreservedSpans,
  ]);
  const replacement = replacePreservedValueSpans(value, preservedSpans);
  return {
    replacement,
    preserved: replacement === value && preservedSpans.length > 0,
    preservedSpans,
  };
}

export function replaceQuotedString(raw, replacement) {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return JSON.stringify(replacement);
  }
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return `'${replacement.replaceAll("'", "''")}'`;
  }
  if (raw.startsWith('`') && raw.endsWith('`')) {
    return `\`${replacement}\``;
  }
  return replacement;
}

export function makeEdit({ start, end, replacement, original, kind, key }) {
  return {
    start,
    end,
    replacement,
    original,
    kind,
    ...(key ? { key } : {}),
  };
}

export function makePreservedReference({ path, start, end, value, key, reason }) {
  return {
    path,
    start,
    end,
    value,
    ...(key ? { key } : {}),
    reason,
  };
}

function sourceRangeForValueSpan({ start, end, raw, value, span }) {
  const rawValueStart = raw.indexOf(value);
  if (rawValueStart >= 0 && rawValueStart + value.length <= raw.length) {
    return {
      start: start + rawValueStart + span.start,
      end: start + rawValueStart + span.end,
    };
  }
  return { start, end };
}

export function addPreservedValueSpans({ preserved, path, start, end, raw, value, key, spans }) {
  for (const span of spans) {
    const spanValue = span.value ?? value.slice(span.start, span.end);
    const range = sourceRangeForValueSpan({ start, end, raw, value, span });
    preserved.push(
      makePreservedReference({
        path,
        start: range.start,
        end: range.end,
        value: spanValue,
        key,
        reason: span.reason,
      }),
    );
  }
}

export function applyEdits(text, edits) {
  const sorted = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
  let output = text;
  let previousStart = Number.POSITIVE_INFINITY;
  for (const edit of sorted) {
    if (edit.end > previousStart) {
      throw new Error(`overlapping adapter edits at ${edit.start}:${edit.end}`);
    }
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
    previousStart = edit.start;
  }
  return output;
}

export function deduplicateEdits(edits) {
  const unique = new Map();
  for (const edit of edits) {
    const key = `${edit.start}:${edit.end}:${edit.replacement}`;
    unique.set(key, edit);
  }
  return [...unique.values()].sort((left, right) => left.start - right.start || left.end - right.end);
}

export function addStringEdit({
  edits,
  preserved,
  path,
  start,
  end,
  raw,
  value,
  key,
  policy,
  kind,
  additionalPreservedSpans = [],
  serialize = replaceQuotedString,
}) {
  const result = stringReplacement(value, {
    path,
    key,
    policy,
    additionalPreservedSpans,
  });
  addPreservedValueSpans({ preserved, path, start, end, raw, value, key, spans: result.preservedSpans });
  if (result.replacement !== value) {
    edits.push(
      makeEdit({
        start,
        end,
        replacement: serialize(raw, result.replacement),
        original: raw,
        kind,
        key,
      }),
    );
  }
}

export function textHasBrand(value) {
  return createBrandPattern('u').test(value);
}

export function brandOccurrencePattern() {
  return createBrandPattern('gu');
}

export function inputKeyFromLine(text, start) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const line = text.slice(lineStart, start);
  const match = line.match(/(?:^|[,{\s])([A-Za-z][A-Za-z0-9_-]*)\s*(?::[^=]+)?=\s*$/u);
  return match?.[1];
}

export function pathReplacement(path) {
  return path
    .split('/')
    .map((component) => renameBrandSegments(component))
    .join('/');
}

export function pathMappings(inputPath, outputPath) {
  if (inputPath === outputPath) return [];
  const mappings = [];
  let offset = 0;
  const inputParts = inputPath.split('/');
  const outputParts = outputPath.split('/');
  for (let index = 0; index < inputParts.length; index += 1) {
    const original = inputParts[index];
    const replacement = outputParts[index];
    if (original !== replacement) {
      mappings.push({
        kind: 'path-component',
        original,
        replacement,
        start: offset,
        end: offset + original.length,
        offsetEncoding: 'utf-16',
        scope: 'path',
      });
    }
    offset += original.length + 1;
  }
  return mappings;
}

export function policyPreservesPath(path, policy) {
  return policy.preserve.pathPrefixes.some(
    (prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix),
  );
}
