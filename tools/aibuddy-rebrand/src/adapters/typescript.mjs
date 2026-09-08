import ts from 'typescript';

import {
  addPreservedValueSpans,
  addStringEdit,
  applyEdits,
  compatibilityIdentifierIsPreserved,
  deduplicateEdits,
  inputKeyFromLine,
  legacyIdentifierIsPreserved,
  makeEdit,
  renameBrandSegments,
  stringReplacement,
  textHasBrand,
} from './shared.mjs';

function escapeJavaScriptString(value, quote) {
  let escaped = '';
  for (const character of value) {
    if (character === '\\') escaped += '\\\\';
    else if (character === quote) escaped += `\\${quote}`;
    else if (character === '\n') escaped += '\\n';
    else if (character === '\r') escaped += '\\r';
    else if (character === '\u2028') escaped += '\\u2028';
    else if (character === '\u2029') escaped += '\\u2029';
    else escaped += character;
  }
  return escaped;
}

function replaceJavaScriptString(raw, replacement) {
  const quote = raw[0];
  if ((quote !== "'" && quote !== '"') || raw.at(-1) !== quote) return raw;
  return `${quote}${escapeJavaScriptString(replacement, quote)}${quote}`;
}

function scriptKindFor(path) {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (path.endsWith('.mjs')) return ts.ScriptKind.JS;
  if (path.endsWith('.cjs')) return ts.ScriptKind.JS;
  if (path.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function diagnosticText(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
}

function pathMatchesContext(path, context) {
  return (
    (context.paths ?? []).includes(path) ||
    (context.pathPrefixes ?? []).some((prefix) => path === prefix || path.startsWith(prefix))
  );
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = calleeName(expression.expression);
    return parent ? `${parent}.${expression.name.text}` : expression.name.text;
  }
  return undefined;
}

function requiredArgumentsMatch(call, context) {
  return (context.requiredArguments ?? []).every((value, index) => {
    const argument = call.arguments[index];
    return ts.isStringLiteral(argument) && argument.text === value;
  });
}

function legacyFixtureStringLiteralSpans(node, path, policy) {
  const spans = [];
  for (const context of policy.preserve.legacyFixtureLiteralContexts ?? []) {
    if (!pathMatchesContext(path, context) || !(context.values ?? []).includes(node.text)) continue;
    if (context.match === 'call-argument') {
      const call = node.parent;
      if (
        !ts.isCallExpression(call) ||
        calleeName(call.expression) !== context.callee ||
        call.arguments[context.argumentIndex] !== node ||
        !requiredArgumentsMatch(call, context)
      ) {
        continue;
      }
    } else if (context.match === 'array-element') {
      const array = node.parent;
      const call = array?.parent;
      if (
        !ts.isArrayLiteralExpression(array) ||
        !ts.isCallExpression(call) ||
        calleeName(call.expression) !== context.callee ||
        call.arguments[context.argumentIndex] !== array
      ) {
        continue;
      }
    } else {
      continue;
    }
    spans.push({
      start: 0,
      end: node.text.length,
      value: node.text,
      reason: context.reason ?? 'explicit legacy fixture literal preservation policy',
    });
  }
  return spans;
}

function sortedArrayContextFor(array, path, policy) {
  const assertion = array.parent;
  if (!ts.isCallExpression(assertion) || !ts.isPropertyAccessExpression(assertion.expression)) {
    return undefined;
  }
  const context = (policy.preserve.sortedArrayContexts ?? []).find(
    (candidate) => pathMatchesContext(path, candidate) && assertion.expression.name.text === candidate.assertion,
  );
  if (!context) return undefined;

  const expectCall = assertion.expression.expression;
  const sortCall = ts.isCallExpression(expectCall) ? expectCall.arguments[0] : undefined;
  if (
    !ts.isCallExpression(expectCall) ||
    assertion.arguments[0] !== array ||
    !ts.isCallExpression(sortCall)
  ) {
    return undefined;
  }
  if (!ts.isPropertyAccessExpression(sortCall.expression) || sortCall.expression.name.text !== context.sortMethod) {
    return undefined;
  }
  const keyCall = sortCall.expression.expression;
  if (!ts.isCallExpression(keyCall) || !ts.isPropertyAccessExpression(keyCall.expression)) return undefined;
  if (calleeName(keyCall.expression) !== context.keyCall) return undefined;
  const argument = keyCall.arguments[0];
  if (!ts.isIdentifier(argument) || argument.text !== context.keyArgument) return undefined;
  return context;
}

function compareJavaScriptStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function addSortedArrayEdits({ arrays, sourceFile, text, path, policy, edits, preserved }) {
  for (const array of arrays) {
    const elements = [...array.elements];
    if (!elements.every((element) => ts.isStringLiteral(element))) continue;
    const slots = elements.map((element) => {
      const start = element.getStart(sourceFile);
      const end = element.end;
      const raw = text.slice(start, end);
      const result = stringReplacement(element.text, { path, policy });
      addPreservedValueSpans({
        preserved,
        path,
        start,
        end,
        raw,
        value: element.text,
        spans: result.preservedSpans,
      });
      return {
        value: result.replacement,
        raw: replaceJavaScriptString(raw, result.replacement),
      };
    });
    const sorted = [...slots].sort((left, right) => compareJavaScriptStrings(left.value, right.value));
    const start = array.getStart(sourceFile);
    const end = array.end;
    let replacement = text.slice(start, elements[0].getStart(sourceFile));
    for (let index = 0; index < elements.length; index += 1) {
      replacement += sorted[index].raw;
      const nextStart = index + 1 < elements.length
        ? elements[index + 1].getStart(sourceFile)
        : end;
      replacement += text.slice(elements[index].end, nextStart);
    }
    const original = text.slice(start, end);
    if (replacement !== original) {
      edits.push(
        makeEdit({
          start,
          end,
          replacement,
          original,
          kind: 'typescript-sorted-array',
        }),
      );
    }
  }
}

function commentRanges(sourceFile, text) {
  const ranges = new Map();
  const add = (candidateRanges) => {
    for (const range of candidateRanges ?? []) {
      ranges.set(`${range.pos}:${range.end}`, range);
    }
  };

  function visit(node) {
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(sourceFile)) visit(child);
  }

  visit(sourceFile);
  add(ts.getLeadingCommentRanges(text, sourceFile.end));
  return [...ranges.values()].sort((left, right) => left.pos - right.pos || left.end - right.end);
}

function commentEdits(sourceFile, text, policy, edits, preserved, path) {
  for (const range of commentRanges(sourceFile, text)) {
    const start = range.pos;
    const end = range.end;
    const raw = text.slice(start, end);
    if (!textHasBrand(raw)) continue;
    const attributionContext = (policy.preserve.historicalAttributionCommentContexts ?? []).find(
      (context) =>
        (context.paths ?? []).includes(path) &&
        (context.markers ?? []).every((marker) => raw.includes(marker)),
    );
    if (attributionContext) {
      preserved.push({
        path,
        start,
        end,
        value: raw,
        reason: attributionContext.reason ?? 'explicit historical attribution preservation policy',
      });
      continue;
    }
    const bodyStart = raw.startsWith('//') ? 2 : 2;
    const bodyEnd = raw.endsWith('*/') ? raw.length - 2 : raw.length;
    const body = raw.slice(bodyStart, bodyEnd);
    const result = stringReplacement(body, { path, policy });
    addPreservedValueSpans({
      preserved,
      path,
      start: start + bodyStart,
      end: start + bodyEnd,
      raw: body,
      value: body,
      spans: result.preservedSpans,
    });
    const replacement = result.replacement;
    if (replacement !== body) {
      edits.push(
        makeEdit({
          start,
          end,
          replacement: `${raw.slice(0, bodyStart)}${replacement}${raw.slice(bodyEnd)}`,
          original: raw,
          kind: 'typescript-comment',
        }),
      );
    }
  }
}

function templateTokenEdit({ node, sourceFile, text, path, policy, edits, preserved }) {
  const start = node.getStart(sourceFile);
  const payloadStart = start + 1;
  const payloadEnd =
    node.kind === ts.SyntaxKind.LastTemplateToken || ts.isNoSubstitutionTemplateLiteral(node)
      ? node.end - 1
      : node.end - 2;
  const value = text.slice(payloadStart, payloadEnd);
  if (!textHasBrand(value)) return;
  const result = stringReplacement(value, { path, policy });
  addPreservedValueSpans({
    preserved,
    path,
    start: payloadStart,
    end: payloadEnd,
    raw: value,
    value,
    spans: result.preservedSpans,
  });
  if (result.replacement !== value) {
    edits.push(
      makeEdit({
        start: payloadStart,
        end: payloadEnd,
        replacement: result.replacement,
        original: value,
        kind: 'typescript-template-text',
      }),
    );
  }
}

export function transformTypeScript({ path, text, policy }) {
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(path),
  );
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    return {
      adapter: 'typescript',
      edits: [],
      preserved: [],
      symbols: [],
      unresolved: [
        {
          reason: `TypeScript/JavaScript parse failed: ${diagnostics.map(diagnosticText).join('; ')}`,
          diagnostics: diagnostics.map((diagnostic) => ({
            start: diagnostic.start,
            length: diagnostic.length,
            message: diagnosticText(diagnostic),
          })),
        },
      ],
    };
  }

  const edits = [];
  const preserved = [];
  const symbols = [];
  const identifierValues = new Set();
  const sortedArrays = [];
  const sortedArrayNodes = new Set();

  function visit(node) {
    if (ts.isArrayLiteralExpression(node)) {
      const context = sortedArrayContextFor(node, path, policy);
      if (context && [...node.elements].every((element) => ts.isStringLiteral(element))) {
        sortedArrays.push(node);
        sortedArrayNodes.add(node);
      }
    }

    if (ts.isIdentifier(node)) {
      identifierValues.add(node.text);
      if (textHasBrand(node.text)) {
        const start = node.getStart(sourceFile);
        if (
          legacyIdentifierIsPreserved(node.text, path, undefined, policy) ||
          compatibilityIdentifierIsPreserved(node.text, path, undefined, policy)
        ) {
          preserved.push({
            path,
            start,
            end: node.end,
            value: node.text,
            reason: 'explicit legacy identifier compatibility policy',
          });
        } else {
          const replacement = renameBrandSegments(node.text);
          if (replacement !== node.text) {
            edits.push(
              makeEdit({
                start,
                end: node.end,
                replacement,
                original: node.text,
                kind: 'typescript-identifier',
              }),
            );
            symbols.push({ original: node.text, replacement, start, end: node.end });
          }
        }
      }
    }

    if (ts.isStringLiteral(node) && !sortedArrayNodes.has(node.parent)) {
      const raw = text.slice(node.getStart(sourceFile), node.end);
      const value = node.text;
      if (textHasBrand(value)) {
        addStringEdit({
          edits,
          preserved,
          path,
          start: node.getStart(sourceFile),
          end: node.end,
          raw,
          value,
          key: inputKeyFromLine(text, node.getStart(sourceFile)),
          policy,
          kind: 'typescript-string',
          additionalPreservedSpans: legacyFixtureStringLiteralSpans(node, path, policy),
          serialize: replaceJavaScriptString,
        });
      }
    }

    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      templateTokenEdit({ node, sourceFile, text, path, policy, edits, preserved });
    }

    if (
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.LastTemplateToken
    ) {
      templateTokenEdit({ node, sourceFile, text, path, policy, edits, preserved });
    }

    if (ts.isRegularExpressionLiteral(node)) {
      const start = node.getStart(sourceFile);
      const raw = text.slice(start, node.end);
      const closingSlash = raw.lastIndexOf('/');
      if (closingSlash > 0) {
        const value = raw.slice(1, closingSlash);
        if (textHasBrand(value)) {
          const result = stringReplacement(value, { path, policy });
          addPreservedValueSpans({
            preserved,
            path,
            start: start + 1,
            end: start + closingSlash,
            raw: value,
            value,
            spans: result.preservedSpans,
          });
          if (result.replacement !== value) {
            edits.push(
              makeEdit({
                start,
                end: node.end,
                replacement: `/${result.replacement}${raw.slice(closingSlash)}`,
                original: raw,
                kind: 'typescript-regex',
              }),
            );
          }
        }
      }
    }

    if (ts.isJsxText(node)) {
      const start = node.pos;
      const original = text.slice(start, node.end);
      if (!textHasBrand(original)) {
        ts.forEachChild(node, visit);
        return;
      }
      const replacement = renameBrandSegments(original);
      if (replacement !== original) {
        edits.push(
          makeEdit({
            start,
            end: node.end,
            replacement,
            original,
            kind: 'typescript-jsx-text',
          }),
        );
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  addSortedArrayEdits({ arrays: sortedArrays, sourceFile, text, path, policy, edits, preserved });
  commentEdits(sourceFile, text, policy, edits, preserved, path);

  const collisions = symbols.filter(
    (symbol) => identifierValues.has(symbol.replacement) && symbol.original !== symbol.replacement,
  );
  const uniqueEdits = deduplicateEdits(edits);
  let transformedText;
  try {
    transformedText = applyEdits(text, uniqueEdits);
  } catch (error) {
    return {
      adapter: 'typescript',
      edits: [],
      preserved,
      symbols,
      unresolved: [{ reason: `TypeScript/JavaScript transformed output could not be applied: ${error.message}` }],
    };
  }
  const reparsed = ts.createSourceFile(
    path,
    transformedText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(path),
  );
  const reparseDiagnostics = reparsed.parseDiagnostics ?? [];
  return {
    adapter: 'typescript',
    edits: reparseDiagnostics.length > 0 ? [] : uniqueEdits,
    preserved,
    symbols,
    ...(collisions.length > 0 || reparseDiagnostics.length > 0
      ? {
          unresolved: [
            ...(collisions.length > 0
              ? [{ reason: 'TypeScript identifier target collision', collisions }]
              : []),
            ...(reparseDiagnostics.length > 0
              ? [
                  {
                    reason: `TypeScript/JavaScript transformed output failed to reparse: ${reparseDiagnostics
                      .map(diagnosticText)
                      .join('; ')}`,
                    diagnostics: reparseDiagnostics.map((diagnostic) => ({
                      start: diagnostic.start,
                      length: diagnostic.length,
                      message: diagnosticText(diagnostic),
                    })),
                  },
                ]
              : []),
          ],
        }
      : {}),
  };
}
