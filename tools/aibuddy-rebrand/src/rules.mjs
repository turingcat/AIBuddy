import { createHash } from 'node:crypto';

export const RULES_VERSION = 1;
export const OFFSET_ENCODING = 'utf-16-code-units';
export const INPUT_TYPES = Object.freeze(['upstream', 'product']);

const NUL = String.fromCharCode(0);
const RULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const CATEGORY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const IDENTIFIER_CHARACTER = /[A-Za-z0-9_$-]/;
const SELECTOR_KINDS = new Set(['literal', 'path']);
const BOUNDARIES = new Set(['token', 'literal']);

export class RuleValidationError extends Error {
  constructor(message, location) {
    super(location ? `${location}: ${message}` : message);
    this.name = 'RuleValidationError';
    this.location = location;
  }
}

function fail(message, location) {
  throw new RuleValidationError(message, location);
}

function isRecord(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireRecord(value, location) {
  if (!isRecord(value)) {
    fail('must be an object', location);
  }
}

function requireString(value, location) {
  if (typeof value !== 'string') {
    fail('must be a string', location);
  }
  if (value.length === 0) {
    fail('must not be empty', location);
  }
  if (value.includes(NUL) || /[\r\n]/u.test(value)) {
    fail('must not contain NUL or line breaks', location);
  }
  return value;
}

function requireAllowedKeys(value, allowed, location) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(`unknown property ${JSON.stringify(key)}`, location);
    }
  }
}

function validateSafeRelativePath(value, location) {
  requireString(value, location);

  if (
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes('\\') ||
    value.includes(':')
  ) {
    fail('must be a safe relative path target', location);
  }

  const components = value.split('/');
  if (
    components.some(
      (component) => component.length === 0 || component === '.' || component === '..',
    )
  ) {
    fail('must be a safe relative path target without dot or parent components', location);
  }

  if (/[?*[\]]/u.test(value)) {
    fail('must be an exact relative path; wildcard selectors are unsafe', location);
  }

  return value;
}

function validateSelector(selector, location) {
  requireRecord(selector, location);
  if (typeof selector.kind !== 'string' || !SELECTOR_KINDS.has(selector.kind)) {
    fail('kind must be literal or path; regex selectors are unsupported', `${location}.kind`);
  }
  if (!Array.isArray(selector.paths) || selector.paths.length === 0) {
    fail('paths must be a non-empty array of exact relative paths', `${location}.paths`);
  }

  const paths = selector.paths.map((value, index) =>
    validateSafeRelativePath(value, `${location}.paths[${index}]`),
  );
  if (new Set(paths.map((value) => value.toLowerCase())).size !== paths.length) {
    fail('paths must not contain case-insensitive duplicates', `${location}.paths`);
  }

  if (selector.kind === 'literal') {
    requireAllowedKeys(
      selector,
      new Set(['kind', 'paths', 'boundary']),
      location,
    );
    if (typeof selector.boundary !== 'string' || !BOUNDARIES.has(selector.boundary)) {
      fail('boundary must be token or literal', `${location}.boundary`);
    }
  } else {
    requireAllowedKeys(selector, new Set(['kind', 'paths']), location);
    if (paths.length !== 1) {
      fail('path selectors must name exactly one source path', `${location}.paths`);
    }
  }

  return {
    kind: selector.kind,
    paths,
    ...(selector.kind === 'literal' ? { boundary: selector.boundary } : {}),
  };
}

function validateRule(rule, index, ids) {
  const location = `rules[${index}]`;
  requireRecord(rule, location);
  requireAllowedKeys(
    rule,
    new Set([
      'id',
      'category',
      'selector',
      'from',
      'to',
      'preserve',
      'reason',
      'appliesTo',
      'expectedMatches',
    ]),
    location,
  );

  const id = requireString(rule.id, `${location}.id`);
  if (!RULE_ID_PATTERN.test(id)) {
    fail('must use a stable lowercase identifier', `${location}.id`);
  }
  if (ids.has(id)) {
    fail(`duplicate rule id ${JSON.stringify(id)}`, `${location}.id`);
  }
  ids.add(id);

  const category = requireString(rule.category, `${location}.category`);
  if (!CATEGORY_PATTERN.test(category)) {
    fail('must use a stable lowercase category', `${location}.category`);
  }

  const selector = validateSelector(rule.selector, `${location}.selector`);
  const hasFrom = hasOwn(rule, 'from');
  const hasTo = hasOwn(rule, 'to');
  const hasPreserve = hasOwn(rule, 'preserve');

  if (hasPreserve && rule.preserve !== true) {
    fail('preserve must be true when present', `${location}.preserve`);
  }
  if (hasPreserve && (!hasFrom || hasTo)) {
    fail(
      'preserve action requires from and must not include to; rename actions cannot include preserve',
      location,
    );
  }
  if (!hasPreserve && (!hasFrom || !hasTo)) {
    fail('rename action requires both from and to', location);
  }

  const from = requireString(rule.from, `${location}.from`);
  if (hasTo) {
    const to = requireString(rule.to, `${location}.to`);
    if (from === to) {
      fail('source and destination must not be identical', location);
    }
  }

  if (selector.kind === 'path') {
    if (hasPreserve) {
      fail('path selectors require a rename action', location);
    }
    validateSafeRelativePath(from, `${location}.from`);
    validateSafeRelativePath(rule.to, `${location}.to`);
    if (selector.paths[0] !== from) {
      fail('path selector must exactly match from', `${location}.selector.paths`);
    }
  }

  const reason = requireString(rule.reason, `${location}.reason`);
  if (!Array.isArray(rule.appliesTo) || rule.appliesTo.length === 0) {
    fail('appliesTo must be a non-empty array', `${location}.appliesTo`);
  }
  const appliesTo = [...rule.appliesTo];
  if (new Set(appliesTo).size !== appliesTo.length) {
    fail('must not contain duplicate input types', `${location}.appliesTo`);
  }
  for (const [inputIndex, input] of appliesTo.entries()) {
    if (!INPUT_TYPES.includes(input)) {
      fail(
        `must contain only ${INPUT_TYPES.join(' or ')}`,
        `${location}.appliesTo[${inputIndex}]`,
      );
    }
  }

  if (hasOwn(rule, 'expectedMatches')) {
    if (!Number.isSafeInteger(rule.expectedMatches) || rule.expectedMatches < 0) {
      fail('must be a non-negative safe integer', `${location}.expectedMatches`);
    }
  }

  return {
    id,
    category,
    selector,
    from,
    ...(hasTo ? { to: rule.to } : {}),
    ...(hasPreserve ? { preserve: true } : {}),
    reason,
    appliesTo,
    ...(hasOwn(rule, 'expectedMatches')
      ? { expectedMatches: rule.expectedMatches }
      : {}),
  };
}

export function validateRuleSet(ruleSet) {
  requireRecord(ruleSet, 'ruleSet');
  requireAllowedKeys(
    ruleSet,
    new Set(['$schema', 'version', 'description', 'rules']),
    'ruleSet',
  );
  if (hasOwn(ruleSet, '$schema')) {
    requireString(ruleSet.$schema, 'ruleSet.$schema');
  }
  if (ruleSet.version !== RULES_VERSION) {
    fail(`version must be ${RULES_VERSION}`, 'ruleSet.version');
  }
  const description = requireString(ruleSet.description, 'ruleSet.description');
  if (!Array.isArray(ruleSet.rules) || ruleSet.rules.length === 0) {
    fail('rules must be a non-empty array', 'ruleSet.rules');
  }

  const ids = new Set();
  const rules = ruleSet.rules.map((rule, index) => validateRule(rule, index, ids));
  return { version: RULES_VERSION, description, rules };
}

export const assertValidRuleSet = validateRuleSet;

function decodeUtf8(value, location) {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Uint8Array) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(value);
    } catch (error) {
      fail(`must contain valid UTF-8 (${error.message})`, location);
    }
  }
  fail('must be a string or Uint8Array containing UTF-8 text', location);
}

function normalizeFiles(files) {
  requireRecord(files, 'files');
  const normalized = new Map();
  const lowerPaths = new Map();
  for (const [filePath, value] of Object.entries(files)) {
    validateSafeRelativePath(filePath, `files.${filePath}`);
    const lowerPath = filePath.toLowerCase();
    if (lowerPaths.has(lowerPath)) {
      fail(
        `case-insensitive path collision with ${JSON.stringify(lowerPaths.get(lowerPath))}`,
        `files.${filePath}`,
      );
    }
    lowerPaths.set(lowerPath, filePath);
    normalized.set(filePath, decodeUtf8(value, `files.${filePath}`));
  }
  return normalized;
}

function isApplicable(rule, input) {
  return rule.appliesTo.includes(input);
}

function findLiteralMatches(text, needle, boundary) {
  const matches = [];
  let start = 0;
  while (start <= text.length - needle.length) {
    const index = text.indexOf(needle, start);
    if (index === -1) {
      break;
    }

    const previous = index === 0 ? '' : text[index - 1];
    const next = text[index + needle.length] ?? '';
    const bounded =
      boundary === 'literal' ||
      (!IDENTIFIER_CHARACTER.test(previous) && !IDENTIFIER_CHARACTER.test(next));
    if (bounded) {
      matches.push({ start: index, end: index + needle.length });
    }
    start = index + needle.length;
  }
  return matches;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function validateSourceDigests(sourceDigests, files) {
  if (sourceDigests === undefined) {
    fail('complete source digest set is required', 'plan.sourceDigests');
  }
  requireRecord(sourceDigests, 'plan.sourceDigests');

  const digestPaths = new Set();
  for (const [filePath, digest] of Object.entries(sourceDigests)) {
    validateSafeRelativePath(filePath, `plan.sourceDigests.${filePath}`);
    if (!files.has(filePath)) {
      fail('extra source digest refers to a missing source path', `plan.sourceDigests.${filePath}`);
    }
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/u.test(digest)) {
      fail('must be a lowercase SHA-256 digest', `plan.sourceDigests.${filePath}`);
    }
    digestPaths.add(filePath);
    if (digest !== sha256(files.get(filePath))) {
      fail('source content changed since planning', `plan.sourceDigests.${filePath}`);
    }
  }

  for (const filePath of files.keys()) {
    if (!digestPaths.has(filePath)) {
      fail(`missing source digest for ${JSON.stringify(filePath)}`, 'plan.sourceDigests');
    }
  }
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function validateEditList(edits, files) {
  if (!Array.isArray(edits)) {
    fail('edits must be an array', 'plan.edits');
  }

  const normalized = edits.map((edit, index) => {
    const location = `plan.edits[${index}]`;
    requireRecord(edit, location);
    const path = validateSafeRelativePath(edit.path, `${location}.path`);
    const text = files.get(path);
    if (text === undefined) {
      fail('edit path is not present in source files', `${location}.path`);
    }
    if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end)) {
      fail('start and end must be safe integer JavaScript offsets', location);
    }
    if (edit.start < 0 || edit.end < edit.start || edit.end > text.length) {
      fail('start and end must be within the document', location);
    }
    if (typeof edit.replacement !== 'string') {
      fail('replacement must be a string', `${location}.replacement`);
    }
    if (edit.replacement.includes(NUL)) {
      fail('replacement must not contain NUL', `${location}.replacement`);
    }
    return {
      path,
      start: edit.start,
      end: edit.end,
      replacement: edit.replacement,
      ...(typeof edit.ruleId === 'string' ? { ruleId: edit.ruleId } : {}),
    };
  });

  normalized.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.start - right.start ||
      left.end - right.end ||
      (left.ruleId ?? '').localeCompare(right.ruleId ?? ''),
  );

  let previous;
  for (const edit of normalized) {
    if (previous && previous.path === edit.path) {
      const sameStart = previous.start === edit.start;
      if (sameStart || overlaps(previous, edit)) {
        fail(
          `overlapping edits between ${JSON.stringify(previous.ruleId ?? 'unknown')} and ${JSON.stringify(edit.ruleId ?? 'unknown')}`,
          `plan.edits.${edit.path}`,
        );
      }
    }
    previous = edit;
  }
  return normalized;
}

function validatePathEdits(pathEdits, files) {
  if (!Array.isArray(pathEdits)) {
    fail('pathEdits must be an array', 'plan.pathEdits');
  }

  const existing = new Map(
    [...files.keys()].map((filePath) => [filePath.toLowerCase(), filePath]),
  );
  const sources = new Set();
  const targets = new Set();

  function pathsCollide(left, right) {
    const leftLower = left.toLowerCase();
    const rightLower = right.toLowerCase();
    return (
      leftLower === rightLower ||
      leftLower.startsWith(`${rightLower}/`) ||
      rightLower.startsWith(`${leftLower}/`)
    );
  }

  const normalized = pathEdits.map((pathEdit, index) => {
    const location = `plan.pathEdits[${index}]`;
    requireRecord(pathEdit, location);
    const fromPath = validateSafeRelativePath(pathEdit.fromPath, `${location}.fromPath`);
    const toPath = validateSafeRelativePath(pathEdit.toPath, `${location}.toPath`);
    if (!files.has(fromPath)) {
      fail('source path is not present in source files', `${location}.fromPath`);
    }
    const fromLower = fromPath.toLowerCase();
    const toLower = toPath.toLowerCase();
    if (fromLower === toLower) {
      fail('source and destination path must not be identical', location);
    }
    if (sources.has(fromLower)) {
      fail('source path is moved more than once', location);
    }
    if (
      [...existing.values()].some((existingPath) => pathsCollide(toPath, existingPath)) ||
      [...targets].some((targetPath) => pathsCollide(toPath, targetPath))
    ) {
      fail('case-insensitive path collision with an existing or planned path', location);
    }
    sources.add(fromLower);
    targets.add(toLower);
    return {
      fromPath,
      toPath,
      ...(typeof pathEdit.ruleId === 'string' ? { ruleId: pathEdit.ruleId } : {}),
    };
  });

  return normalized.sort(
    (left, right) =>
      left.fromPath.localeCompare(right.fromPath) ||
      left.toPath.localeCompare(right.toPath),
  );
}

function checkExpectedMatches(rule, matches) {
  if (
    rule.expectedMatches !== undefined &&
    rule.expectedMatches !== matches.length
  ) {
    fail(
      `expected ${rule.expectedMatches} matches but found ${matches.length}`,
      `rules.${rule.id}`,
    );
  }
}

export function planEdits(files, ruleSet, { input = 'upstream' } = {}) {
  if (!INPUT_TYPES.includes(input)) {
    fail(`must be one of ${INPUT_TYPES.join(' or ')}`, 'options.input');
  }
  const normalizedFiles = normalizeFiles(files);
  const validated = validateRuleSet(ruleSet);
  const matchesByRule = new Map();
  const preserveRanges = new Map();
  const pathEdits = [];
  const countsByRule = {};

  for (const rule of validated.rules) {
    const matches = [];
    if (isApplicable(rule, input)) {
      if (rule.selector.kind === 'literal') {
        for (const filePath of rule.selector.paths) {
          const text = normalizedFiles.get(filePath);
          if (text === undefined) {
            if (rule.expectedMatches !== 0) {
              fail(
                'selector file is not present in source files',
                `rules.${rule.id}.selector.paths`,
              );
            }
            continue;
          }
          for (const match of findLiteralMatches(
            text,
            rule.from,
            rule.selector.boundary,
          )) {
            matches.push({ path: filePath, ...match });
          }
        }
      } else if (normalizedFiles.has(rule.from)) {
        matches.push({ path: rule.from, start: 0, end: 0 });
      } else if (rule.expectedMatches !== 0) {
        fail(
          'selector file is not present in source files',
          `rules.${rule.id}.selector.paths`,
        );
      }
    }

    checkExpectedMatches(rule, matches);
    matchesByRule.set(rule.id, matches);
    countsByRule[rule.id] = { matches: matches.length, edits: 0 };

    if (rule.preserve) {
      for (const match of matches) {
        const ranges = preserveRanges.get(match.path) ?? [];
        ranges.push(match);
        preserveRanges.set(match.path, ranges);
      }
    }
  }

  const edits = [];
  for (const rule of validated.rules) {
    const matches = matchesByRule.get(rule.id);
    if (rule.selector.kind === 'path') {
      if (!rule.preserve && matches.length > 0) {
        pathEdits.push({
          fromPath: rule.from,
          toPath: rule.to,
          ruleId: rule.id,
        });
        countsByRule[rule.id].edits = 1;
      }
      continue;
    }
    if (rule.preserve) {
      continue;
    }

    for (const match of matches) {
      const protectedRanges = preserveRanges.get(match.path) ?? [];
      if (protectedRanges.some((range) => overlaps(match, range))) {
        continue;
      }
      edits.push({
        path: match.path,
        start: match.start,
        end: match.end,
        replacement: rule.to,
        ruleId: rule.id,
      });
      countsByRule[rule.id].edits += 1;
    }
  }

  const validatedEdits = validateEditList(edits, normalizedFiles);
  const validatedPathEdits = validatePathEdits(pathEdits, normalizedFiles);
  const sourceDigests = Object.fromEntries(
    [...normalizedFiles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([filePath, text]) => [filePath, sha256(text)]),
  );

  return {
    version: RULES_VERSION,
    input,
    offsetEncoding: OFFSET_ENCODING,
    edits: validatedEdits,
    pathEdits: validatedPathEdits,
    sourceDigests,
    counts: {
      byRule: countsByRule,
      edits: validatedEdits.length,
      pathEdits: validatedPathEdits.length,
    },
  };
}

export function applyEdits(files, plan) {
  requireRecord(plan, 'plan');
  if (plan.version !== RULES_VERSION) {
    fail(`version must be ${RULES_VERSION}`, 'plan.version');
  }
  if (plan.offsetEncoding !== OFFSET_ENCODING) {
    fail(`offset encoding must be ${OFFSET_ENCODING}`, 'plan.offsetEncoding');
  }

  const normalizedFiles = normalizeFiles(files);
  const edits = validateEditList(plan.edits, normalizedFiles);
  const pathEdits = validatePathEdits(plan.pathEdits, normalizedFiles);

  validateSourceDigests(plan.sourceDigests, normalizedFiles);

  if (plan.counts !== undefined) {
    requireRecord(plan.counts, 'plan.counts');
    if (plan.counts.edits !== edits.length || plan.counts.pathEdits !== pathEdits.length) {
      fail('unexpected edit count in plan', 'plan.counts');
    }
  }

  const transformed = new Map(normalizedFiles);
  const editsByPath = new Map();
  for (const edit of edits) {
    const pathEditsForFile = editsByPath.get(edit.path) ?? [];
    pathEditsForFile.push(edit);
    editsByPath.set(edit.path, pathEditsForFile);
  }
  for (const [filePath, fileEdits] of editsByPath.entries()) {
    let text = transformed.get(filePath);
    for (const edit of [...fileEdits].sort((left, right) => right.start - left.start)) {
      text = `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`;
    }
    transformed.set(filePath, text);
  }

  for (const pathEdit of pathEdits) {
    const text = transformed.get(pathEdit.fromPath);
    transformed.delete(pathEdit.fromPath);
    transformed.set(pathEdit.toPath, text);
  }

  return Object.fromEntries(
    [...transformed.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}
