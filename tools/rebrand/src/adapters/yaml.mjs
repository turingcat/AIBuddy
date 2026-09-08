import { isMap, isPair, isSeq, Lexer, parseDocument } from 'yaml';

import { adapterResult, keyEdit, scalarEdit } from './structured.mjs';
import { addPreservedValueSpans, makeEdit, stringReplacement, textHasBrand } from './shared.mjs';

function scalarNodeRange(node) {
  return node?.range ? { start: node.range[0], end: node.range[1] } : undefined;
}

function walk(node, context, callback, role = 'value') {
  if (!node) return;
  callback(node, context, role);
  if (isMap(node)) {
    for (const item of node.items) {
      if (!isPair(item)) continue;
      walk(item.key, context, callback, 'key');
      walk(item.value, item.key?.value ?? context, callback, 'value');
    }
  } else if (isSeq(node)) {
    for (const item of node.items) walk(item, context, callback, 'value');
  }
}

function commentEdits({ path, text, policy, edits, preserved }) {
  let cursor = 0;
  for (const token of new Lexer().lex(text)) {
    if (!/^[\u0002\u0018\u001f\ufeff]$/u.test(token)) {
      const start = text.indexOf(token, cursor);
      if (start < 0) continue;
      cursor = start + token.length;
      if (!token.startsWith('#')) continue;
      const body = token.slice(1);
      if (!textHasBrand(body)) continue;
      const result = stringReplacement(body, { path, policy });
      addPreservedValueSpans({
        preserved,
        path,
        start: start + 1,
        end: start + token.length,
        raw: body,
        value: body,
        spans: result.preservedSpans,
      });
      if (result.replacement !== body) {
        edits.push(
          makeEdit({
            start: start + 1,
            end: start + token.length,
            replacement: result.replacement,
            original: body,
            kind: 'yaml-comment',
          }),
        );
      }
    }
  }
}

export function transformYaml({ path, text, policy }) {
  const document = parseDocument(text, { keepSourceTokens: true });
  if (document.errors.length > 0) {
    return adapterResult({
      adapter: 'yaml',
      edits: [],
      preserved: [],
      unresolved: [{ reason: `YAML parse failed: ${document.errors.map((error) => error.message).join('; ')}` }],
    });
  }

  const edits = [];
  const preserved = [];
  commentEdits({ path, text, policy, edits, preserved });
  walk(document.contents, undefined, (node, key, role) => {
    const range = scalarNodeRange(node);
    if (!range) return;
    const raw = text.slice(range.start, range.end);
    if (role === 'key' && typeof node.value === 'string') {
      keyEdit({ edits, path, node: range, raw, key: node.value, kind: 'yaml-key' });
    } else if (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') {
      const headerEnd = raw.indexOf('\n');
      if (headerEnd < 0) return;
      const payloadStart = range.start + headerEnd + 1;
      const payloadRaw = raw.slice(headerEnd + 1);
      scalarEdit({
        edits,
        preserved,
        path,
        node: { start: payloadStart, end: range.end },
        raw: payloadRaw,
        value: payloadRaw,
        key,
        policy,
        kind: 'yaml-block-scalar',
      });
    } else if (node.type === 'PLAIN' && typeof node.value === 'string') {
      scalarEdit({ edits, preserved, path, node: range, raw, value: node.value, key, policy, kind: 'yaml-scalar' });
    } else if (typeof node.value === 'string' && node.type !== 'MAP' && node.type !== 'SEQ') {
      scalarEdit({ edits, preserved, path, node: range, raw, value: node.value, key, policy, kind: 'yaml-scalar' });
    }
  });
  return adapterResult({ adapter: 'yaml', edits, preserved });
}
