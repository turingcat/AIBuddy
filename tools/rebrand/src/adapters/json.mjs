import ts from 'typescript';

import { adapterResult, keyEdit, scalarEdit } from './structured.mjs';

function keyFor(node) {
  let parent = node.parent;
  while (parent) {
    if (ts.isPropertyAssignment(parent) && parent.name) {
      return parent.name.text;
    }
    parent = parent.parent;
  }
  return undefined;
}

export function transformJson({ path, text, policy }) {
  const sourceFile = ts.parseJsonText(path, text);
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    return adapterResult({
      adapter: 'json',
      edits: [],
      preserved: [],
      unresolved: [
        {
          reason: `JSON parse failed: ${diagnostics
            .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
            .join('; ')}`,
        },
      ],
    });
  }

  const edits = [];
  const preserved = [];
  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const key = node.name.text;
      if (ts.isStringLiteral(node.name)) {
        keyEdit({
          edits,
          path,
          node: { start: node.name.getStart(sourceFile), end: node.name.end },
          raw: text.slice(node.name.getStart(sourceFile), node.name.end),
          key,
          kind: 'json-key',
        });
      }
    }
    if (ts.isStringLiteral(node)) {
      scalarEdit({
        edits,
        preserved,
        path,
        node: { start: node.getStart(sourceFile), end: node.end },
        raw: text.slice(node.getStart(sourceFile), node.end),
        value: node.text,
        key: keyFor(node),
        policy,
        kind: 'json-string',
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return adapterResult({ adapter: 'json', edits, preserved });
}
