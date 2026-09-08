import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assertCoverageGate,
  createCoverageReport,
  loadPathInventory,
} from '../coverage/report.mjs';

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_TEST = join(TOOL_ROOT, 'tests', 'coverage-paths.test.mjs');

function runScenarioTests(eventsPath) {
  const env = {
    ...process.env,
    REBRAND_PATH_COVERAGE_EVENTS: eventsPath,
  };
  for (const name of Object.keys(env)) {
    if (name.startsWith('NODE_TEST_')) delete env[name];
  }
  return spawnSync(process.execPath, ['--test', SCENARIO_TEST], {
    cwd: TOOL_ROOT,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('bounded path inventory is complete, declared for review, and explicitly non-exhaustive', () => {
  const inventory = loadPathInventory();
  assert.equal(inventory.coverageType, 'bounded-decision-path');
  assert.equal(inventory.scope.wholeCodebasePathCoverageClaim, false);
  assert.equal(inventory.approval.status, 'declared-reviewable');
  assert.equal(inventory.validation.metadataMissingCount, 0);
  assert.equal(inventory.validation.duplicatePathIdCount, 0);
  assert.ok(inventory.paths.length > 0);
  assert.ok(inventory.scope.pendingWorkflows.includes('mirror'));
  assert.equal(inventory.scope.pendingWorkflows.includes('inventory'), false);

  for (const path of inventory.paths.filter((item) => item.status === 'ready')) {
    const [referenceFile, functionName] = path.testReference.split('#');
    assert.equal(referenceFile, 'tests/coverage-paths.test.mjs');
    assert.match(functionName, /^[A-Za-z][A-Za-z0-9]*$/u);
    assert.equal(basename(resolve(TOOL_ROOT, referenceFile)), 'coverage-paths.test.mjs');
    assert.equal(readFileSync(SCENARIO_TEST, 'utf8').includes(functionName), true);
  }
});

test('coverage gate measures actual executed scenarios and reports bounded scope', () => {
  const temp = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-coverage-'));
  const eventsPath = join(temp, 'scenario-events.jsonl');
  try {
    const execution = runScenarioTests(eventsPath);
    assert.equal(
      execution.status,
      0,
      `scenario tests failed\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
    );
    assert.equal(
      existsSync(eventsPath),
      true,
      `scenario runner did not write ${eventsPath}\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
    );

    const report = createCoverageReport({ eventsPath });
    const inventory = loadPathInventory();
    const declaredIDs = inventory.paths
      .filter((path) => path.status === 'ready')
      .map((path) => path.pathId)
      .sort();

    assert.deepEqual(report.coveredIDs, declaredIDs);
    assert.equal(report.counts.declared, declaredIDs.length);
    assert.equal(report.counts.covered, declaredIDs.length);
    assert.equal(report.counts.unobserved, 0);
    assert.equal(report.counts.duplicate, 0);
    assert.equal(report.counts.unexpected, 0);
    assert.equal(report.gate.declaredInventoryPass, true);
    assert.equal(report.gate.complianceClaimPermitted, false);
    assert.equal(report.gate.rootRepositoryPathCoverageClaim, false);
    assert.match(report.scopeWarning, /bounded.*not.*whole-codebase/iu);
    assertCoverageGate(report);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('coverage report counts missing and duplicate observations from event data', () => {
  const inventory = loadPathInventory();
  const first = inventory.paths.find((path) => path.status === 'ready');
  const temp = mkdtempSync(join(tmpdir(), 'heybuddy-rebrand-coverage-invalid-'));
  const eventsPath = join(temp, 'scenario-events.jsonl');
  const event = {
    eventType: 'rebrand-path-scenario',
    schemaVersion: 1,
    pathId: first.pathId,
    scenarioName: first.testReference.split('#')[1],
    outcome: 'passed',
  };
  try {
    writeFileSync(eventsPath, `${JSON.stringify(event)}\n${JSON.stringify(event)}\n`);
    const report = createCoverageReport({ eventsPath });
    assert.equal(report.counts.duplicate, 1);
    assert.equal(report.counts.unobserved, inventory.paths.filter((path) => path.status === 'ready').length - 1);
    assert.equal(report.gate.declaredInventoryPass, false);
    assert.throws(() => assertCoverageGate(report), /coverage gate failed/u);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
