import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { recordScenario } from '../coverage/report.mjs';
import { applySnapshot } from '../src/apply-snapshot.mjs';
import { formatSnapshot } from '../src/format.mjs';
import { generateSnapshot } from '../src/generate.mjs';
import {
  inventoryGitTree,
  writeInventoryReport,
} from '../src/inventory.mjs';
import {
  applyEdits,
  planEdits,
  validateRuleSet,
} from '../src/rules.mjs';
import { verifySnapshot } from '../src/verify.mjs';
import { createInventoryFixture } from './fixtures/git-fixture.mjs';

function gitEnvironment() {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
    ),
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function git(root, args, input) {
  return execFileSync('git', ['-C', root, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnvironment(),
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function writeFixtureFile(root, relativePath, content, mode) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  if (mode !== undefined) chmodSync(filePath, mode);
}

function createGitFixture({ branch = 'fixture', files }) {
  const root = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-path-'));
  for (const [relativePath, file] of Object.entries(files)) {
    writeFixtureFile(root, relativePath, file.content, file.mode);
  }
  git(root, ['init', '--quiet', `--initial-branch=${branch}`]);
  git(root, ['config', 'user.email', 'coverage@example.invalid']);
  git(root, ['config', 'user.name', 'Coverage Fixture']);
  git(root, ['add', '--all']);
  git(root, ['commit', '-qm', 'coverage fixture']);

  return {
    commit: git(root, ['rev-parse', 'HEAD']),
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function createOutputLocation() {
  const parent = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-path-output-'));
  return {
    outputDir: join(parent, 'snapshot'),
    cleanup() {
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

function cloneEntries(entries) {
  return entries.map((entry) => ({
    content: Buffer.from(entry.content),
    mode: entry.mode,
    path: entry.path,
  }));
}

function identityTransform(entries) {
  return {
    entries: cloneEntries(entries),
    report: { unresolved: [] },
  };
}

function snapshotTransform(entries) {
  const reportEntries = [];
  const outputEntries = entries.map((entry) => {
    const outputPath = entry.path === 'src/goose.txt' ? 'src/heybuddy.txt' : entry.path;
    let content = Buffer.from(entry.content);
    if (entry.path === 'src/goose.txt') content = Buffer.from('HeyBuddy source\n');
    if (entry.path === 'keep.txt') content = Buffer.from('keep transformed\n');
    reportEntries.push({ inputPath: entry.path, outputPath });
    return { content, mode: entry.mode, path: outputPath };
  });

  return {
    entries: outputEntries,
    report: { entries: reportEntries, unresolved: [] },
  };
}

async function createApplyFixture(branch = 'feat/heybuddy-branding') {
  const fixture = createGitFixture({
    branch,
    files: {
      'src/goose.txt': { content: 'Goose source\n' },
      'keep.txt': { content: 'keep source\n' },
    },
  });
  const output = createOutputLocation();
  await generateSnapshot({
    cwd: fixture.root,
    outputDir: output.outputDir,
    sourceRef: fixture.commit,
    transform: async (entries) => snapshotTransform(entries),
    transformIdentity: 'sha256:coverage-apply-fixture',
  });
  return { fixture, output };
}

function literalRule(overrides = {}) {
  return {
    id: 'coverage.literal',
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
    description: 'Bounded path coverage rules.',
    rules,
  };
}

function entry(path, content, mode = '100644') {
  return { content: Buffer.from(content), mode, path };
}

test('inventory pinned-tree candidate path', async () => {
  await recordScenario('inventory.pinned-tree-candidate', async function inventoryPinnedTreeCandidate() {
    const fixture = createInventoryFixture();
    try {
      writeFileSync(join(fixture.root, 'README.md'), 'Dirty working tree\n');
      writeFileSync(join(fixture.root, 'untracked-goose.txt'), 'Untracked content\n');
      const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });

      assert.equal(report.source.commit, fixture.commit);
      assert.equal(report.entries.find((item) => item.path === 'README.md').candidate.contentTerms[0], 'goose');
      assert.equal(report.entries.some((item) => item.path === 'untracked-goose.txt'), false);
    } finally {
      fixture.cleanup();
    }
  });
});

test('inventory excluded-root and special-entry path', async () => {
  await recordScenario('inventory.excluded-root-and-special-entry', async function inventoryExcludedRootAndSpecialEntry() {
    const fixture = createInventoryFixture();
    try {
      const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
      const excludedPaths = report.excluded.map((item) => item.path);
      assert.ok(excludedPaths.includes('node_modules/goose/index.js'));
      assert.equal(report.entries.find((item) => item.path === 'assets/logo.GOOSE.bin').classification, 'binary');
      assert.equal(report.entries.find((item) => item.path === 'links/goose-link').symlinkSafety, 'safe');
      assert.equal(report.entries.find((item) => item.path === 'bin/runner').executable, true);
    } finally {
      fixture.cleanup();
    }
  });
});

test('inventory report-location and collision-guard path', async () => {
  await recordScenario('inventory.report-location-and-collision-guard', async function inventoryReportLocationAndCollisionGuard() {
    const fixture = createInventoryFixture();
    const outside = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-path-report-'));
    try {
      const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
      assert.throws(
        () => writeInventoryReport(join(fixture.root, 'report'), report, { sourceRoot: fixture.root }),
        /outside the source tree/u,
      );
      const reportPath = writeInventoryReport(outside, report, { sourceRoot: fixture.root });
      assert.equal(existsSync(reportPath), true);
      assert.throws(() => writeInventoryReport(outside, report), /already exists/u);
    } finally {
      fixture.cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('generate pinned snapshot publication path', async () => {
  await recordScenario('generate.publishes-pinned-snapshot', async function generatePublishesPinnedSnapshot() {
    const fixture = createGitFixture({
      files: {
        'README.md': { content: 'committed source\n' },
        'assets/blob.bin': { content: Buffer.from([0, 1, 2, 255]) },
      },
    });
    const output = createOutputLocation();
    try {
      const result = await generateSnapshot({
        cwd: fixture.root,
        outputDir: output.outputDir,
        sourceRef: fixture.commit,
        transform: async (entries) => identityTransform(entries),
        transformIdentity: 'sha256:coverage-generate-fixture',
      });
      const verified = await verifySnapshot(result.outputDir);
      assert.equal(verified.valid, true);
      assert.equal(readFileSync(join(result.outputDir, 'README.md'), 'utf8'), 'committed source\n');
    } finally {
      fixture.cleanup();
      output.cleanup();
    }
  });
});

test('generate existing-destination refusal path', async () => {
  await recordScenario('generate.rejects-existing-destination', async function generateRejectsExistingDestination() {
    const fixture = createGitFixture({ files: { 'README.md': { content: 'source\n' } } });
    const output = createOutputLocation();
    try {
      const options = {
        cwd: fixture.root,
        outputDir: output.outputDir,
        sourceRef: fixture.commit,
        transform: async (entries) => identityTransform(entries),
        transformIdentity: 'sha256:coverage-generate-existing-fixture',
      };
      await generateSnapshot(options);
      await assert.rejects(generateSnapshot(options), /output directory already exists/u);
      assert.equal(existsSync(join(output.outputDir, '.heybuddy-rebrand.json')), true);
    } finally {
      fixture.cleanup();
      output.cleanup();
    }
  });
});

test('generate unresolved-transform fail-closed path', async () => {
  await recordScenario('generate.fails-closed-on-unresolved-transform', async function generateFailsClosedOnUnresolvedTransform() {
    const fixture = createGitFixture({ files: { 'README.md': { content: 'source\n' } } });
    const output = createOutputLocation();
    try {
      await assert.rejects(
        generateSnapshot({
          cwd: fixture.root,
          outputDir: output.outputDir,
          sourceRef: fixture.commit,
          transform: async (entries) => ({
            entries: cloneEntries(entries),
            report: { unresolved: [{ path: 'README.md', kind: 'coverage-fixture' }] },
          }),
          transformIdentity: 'sha256:coverage-generate-unresolved-fixture',
        }),
        /unresolved/u,
      );
      assert.equal(existsSync(output.outputDir), false);
    } finally {
      fixture.cleanup();
      output.cleanup();
    }
  });
});

test('verify canonical snapshot acceptance path', async () => {
  await recordScenario('verify.accepts-canonical-snapshot', async function verifyAcceptsCanonicalSnapshot() {
    const fixture = createGitFixture({ files: { 'README.md': { content: 'source\n' } } });
    const output = createOutputLocation();
    try {
      await generateSnapshot({
        cwd: fixture.root,
        outputDir: output.outputDir,
        sourceRef: fixture.commit,
        transform: async (entries) => identityTransform(entries),
        transformIdentity: 'sha256:coverage-verify-fixture',
      });
      const result = await verifySnapshot(output.outputDir);
      assert.deepEqual(result, { ...result, valid: true });
      assert.equal(result.provenance.entries.length, 1);
    } finally {
      fixture.cleanup();
      output.cleanup();
    }
  });
});

test('verify mutated-entry rejection path', async () => {
  await recordScenario('verify.rejects-mutated-snapshot-entry', async function verifyRejectsMutatedSnapshotEntry() {
    const fixture = createGitFixture({ files: { 'README.md': { content: 'source\n' } } });
    const output = createOutputLocation();
    try {
      await generateSnapshot({
        cwd: fixture.root,
        outputDir: output.outputDir,
        sourceRef: fixture.commit,
        transform: async (entries) => identityTransform(entries),
        transformIdentity: 'sha256:coverage-verify-corrupt-fixture',
      });
      writeFileSync(join(output.outputDir, 'README.md'), 'tampered\n');
      await assert.rejects(verifySnapshot(output.outputDir), /digest|does not match provenance/u);
    } finally {
      fixture.cleanup();
      output.cleanup();
    }
  });
});

test('apply dry-run planning path', async () => {
  await recordScenario('apply.dry-run-plan', async function applyDryRunPlan() {
    const { fixture, output } = await createApplyFixture();
    try {
      const result = await applySnapshot({ cwd: fixture.root, outputDir: output.outputDir });
      assert.equal(result.dryRun, true);
      assert.deepEqual(result.renamed, [{ from: 'src/goose.txt', to: 'src/heybuddy.txt' }]);
      assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep source\n');
      assert.equal(existsSync(join(fixture.root, '.heybuddy-rebrand.json')), false);
    } finally {
      fixture.cleanup();
      output.cleanup();
    }
  });
});

test('apply verified mutation path', async () => {
  await recordScenario('apply.mutates-feature-worktree', async function applyMutatesFeatureWorktree() {
    const { fixture, output } = await createApplyFixture();
    try {
      const result = await applySnapshot({ cwd: fixture.root, outputDir: output.outputDir, dryRun: false });
      assert.equal(result.dryRun, false);
      assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep transformed\n');
      assert.equal(readFileSync(join(fixture.root, 'src/heybuddy.txt'), 'utf8'), 'HeyBuddy source\n');
      assert.equal(existsSync(join(fixture.root, 'src/goose.txt')), false);
      assert.equal(existsSync(join(fixture.root, '.heybuddy-rebrand.json')), true);
    } finally {
      fixture.cleanup();
      output.cleanup();
    }
  });
});

test('apply non-feature branch refusal path', async () => {
  await recordScenario('apply.rejects-non-feature-branch', async function applyRejectsNonFeatureBranch() {
    const { fixture, output } = await createApplyFixture('main');
    try {
      await assert.rejects(
        applySnapshot({ cwd: fixture.root, outputDir: output.outputDir }),
        /requires a named feature branch|refuses non-feature branch/u,
      );
      assert.equal(readFileSync(join(fixture.root, 'keep.txt'), 'utf8'), 'keep source\n');
    } finally {
      fixture.cleanup();
      output.cleanup();
    }
  });
});

test('rules literal plan and application path', async () => {
  await recordScenario('rules.plans-and-applies-literal-edits', async function rulesPlansAndAppliesLiteralEdits() {
    const files = { 'src/example.txt': '😀 const goose = "goose";\n' };
    const validated = validateRuleSet(ruleSet(literalRule({ expectedMatches: 2 })));
    const plan = planEdits(files, validated);
    const result = applyEdits(files, plan);
    assert.equal(plan.edits.length, 2);
    assert.equal(plan.offsetEncoding, 'utf-16-code-units');
    assert.deepEqual(result, { 'src/example.txt': '😀 const heybuddy = "heybuddy";\n' });
  });
});

test('rules explicit-preservation path', async () => {
  await recordScenario('rules.preserves-explicit-reference', async function rulesPreservesExplicitReference() {
    const rename = literalRule({ id: 'coverage.rename', expectedMatches: 1 });
    const preserve = literalRule({
      id: 'coverage.preserve',
      preserve: true,
      expectedMatches: 1,
      reason: 'This legacy reference remains valid.',
    });
    delete preserve.to;
    const plan = planEdits({ 'src/example.txt': 'goose\n' }, ruleSet(rename, preserve));
    assert.equal(plan.edits.length, 0);
    assert.equal(plan.counts.byRule['coverage.rename'].matches, 1);
    assert.equal(plan.counts.byRule['coverage.preserve'].matches, 1);
  });
});

test('rules stale-plan rejection path', async () => {
  await recordScenario('rules.rejects-stale-plan', async function rulesRejectsStalePlan() {
    const files = { 'src/example.txt': 'goose\n' };
    const plan = planEdits(files, ruleSet(literalRule({ expectedMatches: 1 })));
    files['src/example.txt'] = 'changed\n';
    assert.throws(() => applyEdits(files, plan), /source content changed|digest/u);
  });
});

test('format selected Rust path', async () => {
  await recordScenario('format.formats-selected-rust', async function formatFormatsSelectedRust() {
    const result = formatSnapshot([entry('src/main.rs', 'fn main(){let value=1;let _=value;}\n')], {
      paths: ['src/main.rs'],
    });
    assert.notEqual(result.entries[0].content.toString('utf8'), 'fn main(){let value=1;let _=value;}\n');
    assert.equal(result.report.files[0].path, 'src/main.rs');
    assert.equal(result.report.formatter, 'rustfmt');
  });
});

test('format preserves unselected entries path', async () => {
  await recordScenario('format.preserves-unselected-entries', async function formatPreservesUnselectedEntries() {
    const binary = Buffer.from([0, 1, 2, 255]);
    const link = Buffer.from('src/main.rs');
    const result = formatSnapshot([
      entry('src/main.rs', 'fn main(){let _=1;}\n'),
      { content: binary, mode: '100755', path: 'assets/data.bin' },
      { content: link, mode: '120000', path: 'links/main' },
    ], { paths: ['src/main.rs'] });
    assert.deepEqual(result.entries.find((item) => item.path === 'assets/data.bin').content, binary);
    assert.deepEqual(result.entries.find((item) => item.path === 'links/main').content, link);
    assert.equal(result.entries.find((item) => item.path === 'assets/data.bin').mode, '100755');
    assert.equal(result.entries.find((item) => item.path === 'links/main').mode, '120000');
  });
});

test('format invalid-selection rejection path', async () => {
  await recordScenario('format.rejects-invalid-selection', async function formatRejectsInvalidSelection() {
    assert.throws(
      () => formatSnapshot([entry('src/main.rs', 'fn main() {}\n')], { paths: ['missing.rs'] }),
      /unknown path/u,
    );
  });
});

