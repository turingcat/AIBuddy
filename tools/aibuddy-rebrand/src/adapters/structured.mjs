import {
  addStringEdit,
  addPreservedValueSpans,
  deduplicateEdits,
  makeEdit,
  replacePreservedValueSpans,
  replaceQuotedString,
  stringReplacement,
  textHasBrand,
} from './shared.mjs';

export function scalarEdit({
  edits,
  preserved,
  path,
  node,
  raw,
  value,
  key,
  policy,
  kind,
  additionalPreservedSpans = [],
}) {
  if (!textHasBrand(value)) return;
  const result = stringReplacement(value, {
    path,
    key,
    policy,
    additionalPreservedSpans,
  });
  addPreservedValueSpans({
    preserved,
    path,
    start: node.start,
    end: node.end,
    raw,
    value,
    key,
    spans: result.preservedSpans,
  });
  if (result.replacement !== value) {
    edits.push(
      makeEdit({
        start: node.start,
        end: node.end,
        replacement: replaceQuotedString(raw, result.replacement),
        original: raw,
        kind,
        key,
      }),
    );
  }
}

export function keyEdit({ edits, preserved = [], path, node, raw, key, kind, protectedSpans = [] }) {
  if (!textHasBrand(key)) return;
  const replacement = replacePreservedValueSpans(key, protectedSpans);
  const start = node.start ?? node.range?.[0];
  const end = node.end ?? node.range?.[1];
  addPreservedValueSpans({
    preserved,
    path,
    start,
    end,
    raw,
    value: key,
    spans: protectedSpans,
  });
  if (replacement === key) return;
  edits.push(
    makeEdit({
      start,
      end,
      replacement: replaceQuotedString(raw, replacement),
      original: raw,
      kind,
    }),
  );
}

export function adapterResult({ adapter, edits, preserved, unresolved, symbols = [] }) {
  return {
    adapter,
    edits: deduplicateEdits(edits),
    preserved,
    symbols,
    ...(unresolved?.length ? { unresolved } : {}),
  };
}
