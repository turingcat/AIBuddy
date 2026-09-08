import { parseTOML } from 'toml-eslint-parser';

import { adapterResult, keyEdit, scalarEdit } from './structured.mjs';

function walk(node, callback, context = {}, seen = new Set()) {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  const table = node.type === 'TOMLTable' ? node : context.table;
  const nextKey = node.type === 'TOMLKeyValue' ? keyName(node.key) : context.key;
  callback(node, { key: nextKey, table });
  for (const [property, value] of Object.entries(node)) {
    if (
      property === 'loc' ||
      property === 'tokens' ||
      property === 'comments' ||
      property === 'range' ||
      property === 'parent' ||
      property === 'resolvedKey'
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) walk(child, callback, { key: nextKey, table }, seen);
    } else if (value && typeof value === 'object') {
      walk(value, callback, { key: nextKey, table }, seen);
    }
  }
}

function keyName(node) {
  if (!node || node.type !== 'TOMLKey') return undefined;
  return node.keys?.map((key) => key.name).join('.');
}

function tableFields(table) {
  const fields = new Map();
  for (const node of table?.body ?? []) {
    if (node.type === 'TOMLKeyValue') fields.set(keyName(node.key), node.value);
  }
  return fields;
}

function tableName(table) {
  return keyName(table?.key);
}

function stringValue(node) {
  return node?.type === 'TOMLValue' && node.kind === 'string' ? node.value : undefined;
}

function isPathMatch(path, context) {
  return (context.paths ?? []).includes(path) ||
    (context.pathPrefixes ?? []).some((prefix) => path === prefix || path.startsWith(prefix));
}

function configuredIdentities(path, policy) {
  return (policy.preserve.externalRegistryPackageContexts ?? [])
    .filter((context) => isPathMatch(path, context))
    .flatMap((context) => context.identities ?? []);
}

function cargoLockConfig(policy) {
  return policy.preserve.cargoLockRegistryPackage ?? {};
}

function isCargoLock(path) {
  return path === 'Cargo.lock' || path.endsWith('/Cargo.lock');
}

function registryPackageNames(ast, policy, path) {
  if (!isCargoLock(path)) return new Set();
  const config = cargoLockConfig(policy);
  const prefixes = config.sourcePrefixes ?? [];
  const names = new Set(configuredIdentities(path, policy));
  walk(ast, (node) => {
    if (node.type !== 'TOMLTable' || tableName(node) !== config.table) return;
    const fields = tableFields(node);
    const source = stringValue(fields.get(config.sourceKey));
    const name = stringValue(fields.get(config.nameKey));
    if (name && source && prefixes.some((prefix) => source.startsWith(prefix))) names.add(name);
  });
  return names;
}

function identitySpans(value, identities) {
  const spans = [];
  for (const identity of identities) {
    if (!identity) continue;
    if (value === identity || value.startsWith(`${identity}/`) || value.startsWith(`${identity} `)) {
      spans.push({ start: 0, end: identity.length, value: identity, reason: 'explicit external registry package identity preservation policy' });
    }
  }
  return spans;
}

function protectedSpans({ path, value, key, table, registryNames, policy }) {
  const identities = new Set(configuredIdentities(path, policy));
  if (isCargoLock(path)) {
    const config = cargoLockConfig(policy);
    const fields = tableFields(table);
    const isRegistryTable = tableName(table) === config.table &&
      stringValue(fields.get(config.sourceKey)) &&
      (config.sourcePrefixes ?? []).some((prefix) =>
        stringValue(fields.get(config.sourceKey)).startsWith(prefix),
      );
    if (key === config.nameKey && isRegistryTable) {
      for (const name of registryNames) identities.add(name);
    }
    if ((config.referenceKeys ?? []).includes(key)) {
      for (const name of registryNames) identities.add(name);
    }
  }
  return identitySpans(value, identities);
}

export function transformToml({ path, text, policy }) {
  let ast;
  try {
    ast = parseTOML(text, { tomlVersion: '1.0.0' });
  } catch (error) {
    return adapterResult({
      adapter: 'toml',
      edits: [],
      preserved: [],
      unresolved: [{ reason: `TOML parse failed: ${error.message}` }],
    });
  }

  const edits = [];
  const preserved = [];
  const registryNames = registryPackageNames(ast, policy, path);
  walk(ast, (node, context) => {
    const parentKey = context.key;
    const protectedForKey = node.type === 'TOMLKey'
      ? identitySpans(keyName(node), configuredIdentities(path, policy))
      : [];
    if (node.type === 'TOMLKey') {
      const key = keyName(node);
      keyEdit({
        edits,
        preserved,
        path,
        node,
        raw: text.slice(node.range[0], node.range[1]),
        key,
        kind: 'toml-key',
        protectedSpans: protectedForKey,
      });
    }
    if (node.type === 'TOMLValue' && node.kind === 'string') {
      const value = node.value;
      const protectedForValue = protectedSpans({
        path,
        value,
        key: parentKey,
        table: context.table,
        registryNames,
        policy,
      });
      scalarEdit({
        edits,
        preserved,
        path,
        node: { start: node.range[0], end: node.range[1] },
        raw: text.slice(node.range[0], node.range[1]),
        value,
        key: parentKey,
        policy,
        kind: 'toml-string',
        additionalPreservedSpans: protectedForValue,
      });
    }
  });
  return adapterResult({ adapter: 'toml', edits, preserved });
}
