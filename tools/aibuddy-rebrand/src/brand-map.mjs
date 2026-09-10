import { readFileSync } from 'node:fs';

const map = JSON.parse(readFileSync(new URL('../brand-map.json', import.meta.url), 'utf8'));

if (map.version !== 1 || !map.replacements || typeof map.replacements !== 'object') {
  throw new Error('brand-map.json must define version 1 replacements');
}

const replacements = Object.entries(map.replacements);
if (replacements.length === 0) {
  throw new Error('brand-map.json replacements must not be empty');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}


const corrections = Object.entries(map.upstreamCorrections ?? {});
const correctionPatternSource = corrections
  .map(([source]) => source)
  .sort((left, right) => right.length - left.length || left.localeCompare(right))
  .map(escapeRegExp)
  .join('|');
const correctionPattern = correctionPatternSource
  ? new RegExp(correctionPatternSource, 'g')
  : null;

const externalAliases = Object.entries(map.externalAliasReplacements ?? {});
const externalAliasPatternSource = externalAliases
  .map(([source]) => source)
  .sort((left, right) => right.length - left.length || left.localeCompare(right))
  .map(escapeRegExp)
  .join('|');
const externalAliasPattern = externalAliasPatternSource
  ? new RegExp(externalAliasPatternSource, 'g')
  : null;
const externalAliasMap = new Map(externalAliases);

const patternSource = replacements
  .map(([source]) => source)
  .sort((left, right) => right.length - left.length || left.localeCompare(right))
  .map(escapeRegExp)
  .join('|');

export const BRAND_MAP = Object.freeze(map);
export const SOURCE_REPLACEMENTS = new Map(replacements);
export const CANDIDATE_TERMS = Object.freeze(
  [...new Set(replacements.map(([source]) => source.toLowerCase()))].sort(),
);

export function createBrandPattern(flags = 'g') {
  return new RegExp(patternSource, flags);
}

export function mappedBrand(value) {
  return SOURCE_REPLACEMENTS.get(value) ?? value;
}

export function findExternalAliases(value) {
  return externalAliasPattern ? [...value.matchAll(externalAliasPattern)] : [];
}

export function mappedExternalAlias(value) {
  return externalAliasMap.get(value) ?? value;
}

export function applyUpstreamCorrections(value) {
  if (!correctionPattern) return value;
  return value.replace(correctionPattern, (match) => map.upstreamCorrections[match] ?? match);
}
