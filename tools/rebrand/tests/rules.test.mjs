import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyEdits,
  planEdits,
  validateRuleSet,
} from '../src/rules.mjs';

const MAP = JSON.parse(
  readFileSync(new URL('../map.json', import.meta.url), 'utf8'),
);

function literalRule(overrides = {}) {
  return {
    id: 'test.literal',
    category: 'public-entry-point',
    selector: {
      kind: 'literal',
      paths: ['src/example.txt'],
      boundary: 'token',
    },
    from: 'goose',
    to: 'heybuddy',
    reason: 'The fixture represents a first-party public name.',
    appliesTo: ['upstream', 'product'],
    ...overrides,
  };
}

function ruleSet(...rules) {
  return {
    version: 1,
    description: 'Test-only bounded rules.',
    rules,
  };
}

test('validates the representative map without claiming repository coverage', () => {
  const validated = validateRuleSet(MAP);

  assert.equal(validated.version, 1);
  assert.match(validated.description, /representative/i);
  assert.ok(validated.rules.length > 0);
});

test('rejects duplicate rule ids', () => {
  assert.throws(
    () => validateRuleSet(ruleSet(literalRule(), literalRule({ category: 'documentation' }))),
    /duplicate rule id/i,
  );
});

test('rejects invalid types and malformed actions', () => {
  assert.throws(
    () => validateRuleSet(ruleSet(literalRule({ id: 'test.invalid', from: 42 }))),
    /from.*string/i,
  );
  assert.throws(
    () => validateRuleSet(ruleSet(literalRule({ id: 'test.same', to: 'goose' }))),
    /identical/i,
  );
  assert.throws(
    () => validateRuleSet(
      ruleSet(literalRule({ id: 'test.mixed-action', preserve: true })),
    ),
    /preserve.*from.*to|rename.*preserve/i,
  );
});

test('rejects broad or regex-like selectors', () => {
  assert.throws(
    () => validateRuleSet(
      ruleSet(
        literalRule({
          id: 'test.glob',
          selector: {
            kind: 'literal',
            paths: ['src/**'],
            boundary: 'token',
          },
        }),
      ),
    ),
    /exact relative path|broad|wildcard/i,
  );
  assert.throws(
    () => validateRuleSet(
      ruleSet(
        literalRule({
          id: 'test.regex',
          selector: {
            kind: 'regex',
            paths: ['src/example.txt'],
          },
        }),
      ),
    ),
    /selector.*kind|regex|literal/i,
  );
});

test('plans literal edits with documented UTF-16 JavaScript offsets', () => {
  const files = {
    'src/example.txt': '😀 const goose = "goose";\n',
  };
  const plan = planEdits(files, ruleSet(literalRule({ expectedMatches: 2 })));

  assert.equal(plan.offsetEncoding, 'utf-16-code-units');
  assert.equal(plan.edits.length, 2);
  assert.equal(plan.edits[0].start, '😀 const '.length);
  assert.equal(plan.edits[0].end, '😀 const goose'.length);
  assert.equal(plan.counts.byRule['test.literal'].matches, 2);

  const result = applyEdits(files, plan);
  assert.deepEqual(result, {
    'src/example.txt': '😀 const heybuddy = "heybuddy";\n',
  });
  assert.deepEqual(files, {
    'src/example.txt': '😀 const goose = "goose";\n',
  });
});

test('preserve rules suppress matching rename edits without changing counts', () => {
  const rename = literalRule({ id: 'test.rename', expectedMatches: 1 });
  const preserve = literalRule({
    id: 'test.preserve',
    preserve: true,
    to: undefined,
    expectedMatches: 1,
    reason: 'This legacy reference remains valid.',
  });
  delete preserve.to;

  const plan = planEdits(
    { 'src/example.txt': 'goose\n' },
    ruleSet(rename, preserve),
  );

  assert.equal(plan.edits.length, 0);
  assert.equal(plan.counts.byRule['test.rename'].matches, 1);
  assert.equal(plan.counts.byRule['test.preserve'].matches, 1);
});

test('rejects unexpected match counts', () => {
  assert.throws(
    () => planEdits(
      { 'src/example.txt': 'goose\n' },
      ruleSet(literalRule({ expectedMatches: 2 })),
    ),
    /expected 2.*found 1|unexpected.*count/i,
  );
});

test('rejects invalid UTF-8 source buffers', () => {
  assert.throws(
    () => planEdits(
      { 'src/example.txt': Buffer.from([0xc3, 0x28]) },
      ruleSet(literalRule()),
    ),
    /UTF-8/i,
  );
});

test('rejects overlapping edits from competing literal rules', () => {
  const first = literalRule({
    id: 'test.first',
    from: 'goose',
    to: 'heybuddy',
    selector: {
      kind: 'literal',
      paths: ['src/example.txt'],
      boundary: 'literal',
    },
  });
  const second = literalRule({
    id: 'test.second',
    from: 'goose-cli',
    to: 'heybuddy-cli',
    selector: {
      kind: 'literal',
      paths: ['src/example.txt'],
      boundary: 'literal',
    },
  });

  assert.throws(
    () => planEdits({ 'src/example.txt': 'goose-cli' }, ruleSet(first, second)),
    /overlapping edits/i,
  );
});

test('plans and applies a safe path move together with content edits', () => {
  const pathRule = {
    id: 'test.path',
    category: 'public-entry-point',
    selector: {
      kind: 'path',
      paths: ['crates/goose-cli/Cargo.toml'],
    },
    from: 'crates/goose-cli/Cargo.toml',
    to: 'crates/heybuddy-cli/Cargo.toml',
    reason: 'Rename the first-party CLI manifest path.',
    appliesTo: ['upstream', 'product'],
  };
  const contentRule = literalRule({
    id: 'test.content',
    selector: {
      kind: 'literal',
      paths: ['crates/goose-cli/Cargo.toml'],
      boundary: 'token',
    },
    from: 'goose-cli',
    to: 'heybuddy-cli',
    expectedMatches: 1,
  });

  const plan = planEdits(
    { 'crates/goose-cli/Cargo.toml': 'name = "goose-cli"\n' },
    ruleSet(pathRule, contentRule),
  );
  const result = applyEdits(
    { 'crates/goose-cli/Cargo.toml': 'name = "goose-cli"\n' },
    plan,
  );

  assert.deepEqual(result, {
    'crates/heybuddy-cli/Cargo.toml': 'name = "heybuddy-cli"\n',
  });
});

test('rejects case-insensitive path collisions and unsafe targets', () => {
  const pathRule = {
    id: 'test.collision',
    category: 'public-entry-point',
    selector: { kind: 'path', paths: ['src/goose.txt'] },
    from: 'src/goose.txt',
    to: 'src/HeyBuddy.txt',
    reason: 'Rename a first-party path.',
    appliesTo: ['upstream'],
  };

  assert.throws(
    () => planEdits(
      {
        'src/goose.txt': 'goose\n',
        'src/heybuddy.txt': 'existing\n',
      },
      ruleSet(pathRule),
    ),
    /case-insensitive.*collision|path collision/i,
  );

  assert.throws(
    () => validateRuleSet(
      ruleSet({ ...pathRule, id: 'test.unsafe', to: '../HeyBuddy.txt' }),
    ),
    /unsafe|relative path|target/i,
  );
});

test('rejects case-insensitive file-directory prefix collisions in both directions', () => {
  const cases = [
    {
      files: {
        'src/source.txt': 'source\n',
        'src/new/child.txt': 'child\n',
      },
      target: 'src/new',
    },
    {
      files: {
        'src/source.txt': 'source\n',
        'src/NEW': 'directory marker\n',
      },
      target: 'src/new/child.txt',
    },
  ];

  for (const { files, target } of cases) {
    assert.throws(
      () => planEdits(
        files,
        ruleSet({
          id: 'test.prefix-collision',
          category: 'public-entry-point',
          selector: { kind: 'path', paths: ['src/source.txt'] },
          from: 'src/source.txt',
          to: target,
          reason: 'A path target cannot overlap a file or directory prefix.',
          appliesTo: ['upstream'],
        }),
      ),
      /path collision/i,
    );
  }
});

test('requires a complete source digest set including untouched files', () => {
  const files = {
    'src/example.txt': 'goose\n',
    'docs/untouched.txt': 'unchanged\n',
  };
  const plan = planEdits(files, ruleSet(literalRule({ expectedMatches: 1 })));

  const omitted = { ...plan };
  delete omitted.sourceDigests;
  assert.throws(
    () => applyEdits(files, omitted),
    /sourceDigests.*complete|digest.*required/i,
  );

  const missing = {
    ...plan,
    sourceDigests: { ...plan.sourceDigests },
  };
  delete missing.sourceDigests['docs/untouched.txt'];
  assert.throws(
    () => applyEdits(files, missing),
    /missing.*digest|complete.*source/i,
  );

  const extra = {
    ...plan,
    sourceDigests: {
      ...plan.sourceDigests,
      'src/extra.txt': '0'.repeat(64),
    },
  };
  assert.throws(
    () => applyEdits(files, extra),
    /extra.*digest|missing source path/i,
  );
});

test('rejects tampered source digests', () => {
  const files = { 'src/example.txt': 'goose\n' };
  const plan = planEdits(files, ruleSet(literalRule({ expectedMatches: 1 })));
  const tampered = {
    ...plan,
    sourceDigests: {
      ...plan.sourceDigests,
      'src/example.txt': '0'.repeat(64),
    },
  };

  assert.throws(
    () => applyEdits(files, tampered),
    /source content changed|digest/i,
  );
});

test('requires literal selector files unless expectedMatches explicitly allows absence', () => {
  const missingSelector = literalRule({
    selector: {
      kind: 'literal',
      paths: ['src/missing.txt'],
      boundary: 'token',
    },
  });

  assert.throws(
    () => planEdits({ 'src/example.txt': 'goose\n' }, ruleSet(missingSelector)),
    /selector.*file|scoped.*file|not present/i,
  );

  const explicitlyAbsent = literalRule({
    id: 'test.explicitly-absent',
    selector: missingSelector.selector,
    expectedMatches: 0,
  });
  const plan = planEdits(
    { 'src/example.txt': 'goose\n' },
    ruleSet(explicitlyAbsent),
  );
  assert.equal(plan.edits.length, 0);
});

test('does not let a missing multi-path selector hide behind another path match', () => {
  const partialSelector = literalRule({
    id: 'test.partial-selector',
    selector: {
      kind: 'literal',
      paths: ['src/example.txt', 'src/missing.txt'],
      boundary: 'token',
    },
    expectedMatches: 1,
  });

  assert.throws(
    () => planEdits({ 'src/example.txt': 'goose\n' }, ruleSet(partialSelector)),
    /selector.*file|scoped.*file|not present/i,
  );

  const explicitlyAbsent = literalRule({
    id: 'test.partial-selector-absent',
    from: 'not-present',
    selector: partialSelector.selector,
    expectedMatches: 0,
  });
  const plan = planEdits(
    { 'src/example.txt': 'goose\n' },
    ruleSet(explicitlyAbsent),
  );
  assert.equal(plan.edits.length, 0);
});

test('requires path selector files unless expectedMatches explicitly allows absence', () => {
  const missingSelector = {
    id: 'test.missing-path',
    category: 'public-entry-point',
    selector: { kind: 'path', paths: ['src/missing.txt'] },
    from: 'src/missing.txt',
    to: 'src/renamed.txt',
    reason: 'The path is required unless absence is explicit.',
    appliesTo: ['upstream'],
  };

  assert.throws(
    () => planEdits({ 'src/example.txt': 'goose\n' }, ruleSet(missingSelector)),
    /selector.*file|scoped.*file|not present/i,
  );

  const explicitlyAbsent = { ...missingSelector, expectedMatches: 0 };
  const plan = planEdits(
    { 'src/example.txt': 'goose\n' },
    ruleSet(explicitlyAbsent),
  );
  assert.equal(plan.pathEdits.length, 0);
});

test('rejects stale or malformed application plans', () => {
  const files = { 'src/example.txt': 'goose\n' };
  const plan = planEdits(files, ruleSet(literalRule({ expectedMatches: 1 })));

  assert.throws(
    () => applyEdits({ 'src/example.txt': 'changed\n' }, plan),
    /source.*changed|stale|digest/i,
  );
  assert.throws(
    () => applyEdits(files, {
      version: 1,
      offsetEncoding: 'bytes',
      edits: [],
      pathEdits: [],
    }),
    /UTF-16|offset encoding/i,
  );
  assert.throws(
    () => applyEdits(files, {
      version: 1,
      offsetEncoding: 'utf-16-code-units',
      edits: [
        { path: 'src/example.txt', start: 0, end: 3, replacement: 'a' },
        { path: 'src/example.txt', start: 2, end: 4, replacement: 'b' },
      ],
      pathEdits: [],
      sourceDigests: plan.sourceDigests,
    }),
    /overlapping edits/i,
  );
});
