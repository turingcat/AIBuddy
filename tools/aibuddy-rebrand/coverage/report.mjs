import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COVERAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PATHS_PATH = join(COVERAGE_ROOT, 'coverage', 'paths.json');
export const DEFAULT_EVENTS_PATH = join(
  tmpdir(),
  `aibuddy-rebrand-path-coverage-${process.pid}.jsonl`,
);
export const COVERAGE_EVENT_SCHEMA_VERSION = 1;

const PATH_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\.[a-z][a-z0-9-]*$/u;
const WORKFLOWS = new Set(['inventory', 'generate', 'verify', 'apply', 'rules', 'format', 'mirror']);
const STATUSES = new Set(['ready', 'pending']);
const WORKFLOW_STATUSES = new Set(['measured', 'pending']);
const REQUIRED_PATH_FIELDS = [
  'pathId',
  'workflow',
  'status',
  'conditionSequence',
  'expectedObservable',
  'expectedResult',
  'testReference',
];

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(values) {
  return [...values].sort(compareStrings);
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function validateInventoryShape(raw) {
  requireRecord(raw, 'path inventory');
  if (raw.schemaVersion !== 1) throw new Error('path inventory schemaVersion must be 1');
  if (raw.coverageType !== 'bounded-decision-path') {
    throw new Error('path inventory coverageType must be bounded-decision-path');
  }
  requireRecord(raw.approval, 'path inventory approval');
  requireRecord(raw.gate, 'path inventory gate');
  requireRecord(raw.scope, 'path inventory scope');
  if (!Array.isArray(raw.workflows)) throw new Error('path inventory workflows must be an array');
  if (!Array.isArray(raw.paths)) throw new Error('path inventory paths must be an array');

  const errors = [];
  const pathIds = new Set();
  const testReferences = new Set();
  let metadataMissingCount = 0;
  let duplicatePathIdCount = 0;
  let duplicateTestReferenceCount = 0;

  for (const [index, path] of raw.paths.entries()) {
    const missingFields = REQUIRED_PATH_FIELDS.filter((field) => !Object.hasOwn(path ?? {}, field));
    let invalid = missingFields.length > 0;
    if (!isRecord(path)) {
      errors.push(`paths[${index}] must be an object`);
      metadataMissingCount += 1;
      continue;
    }
    if (missingFields.length > 0) {
      errors.push(`paths[${index}] is missing ${missingFields.join(', ')}`);
    }
    if (typeof path.pathId !== 'string' || !PATH_ID_PATTERN.test(path.pathId)) {
      errors.push(`paths[${index}].pathId is invalid`);
      invalid = true;
    }
    if (typeof path.workflow !== 'string' || !WORKFLOWS.has(path.workflow)) {
      errors.push(`paths[${index}].workflow is invalid`);
      invalid = true;
    }
    if (typeof path.status !== 'string' || !STATUSES.has(path.status)) {
      errors.push(`paths[${index}].status is invalid`);
      invalid = true;
    }
    if (!Array.isArray(path.conditionSequence) || path.conditionSequence.length === 0
      || path.conditionSequence.some((condition) => typeof condition !== 'string' || condition.length === 0)) {
      errors.push(`paths[${index}].conditionSequence is invalid`);
      invalid = true;
    }
    for (const field of ['expectedObservable', 'expectedResult', 'testReference']) {
      if (typeof path[field] !== 'string' || path[field].length === 0) {
        errors.push(`paths[${index}].${field} is invalid`);
        invalid = true;
      }
    }
    if (path.status === 'ready' && typeof path.testReference === 'string'
      && !/^tests\/coverage-paths\.test\.mjs#[A-Za-z][A-Za-z0-9]*$/u.test(path.testReference)) {
      errors.push(`paths[${index}].testReference must point to the executable scenario test`);
      invalid = true;
    }
    if (pathIds.has(path.pathId)) {
      duplicatePathIdCount += 1;
      errors.push(`duplicate pathId ${path.pathId}`);
    } else if (typeof path.pathId === 'string') {
      pathIds.add(path.pathId);
    }
    if (typeof path.testReference === 'string') {
      if (testReferences.has(path.testReference)) duplicateTestReferenceCount += 1;
      testReferences.add(path.testReference);
    }
    if (invalid) metadataMissingCount += 1;
  }

  const workflows = new Set();
  for (const [index, workflow] of raw.workflows.entries()) {
    if (!isRecord(workflow) || typeof workflow.workflow !== 'string'
      || !WORKFLOWS.has(workflow.workflow) || !WORKFLOW_STATUSES.has(workflow.status)) {
      errors.push(`workflows[${index}] is invalid`);
      continue;
    }
    if (workflows.has(workflow.workflow)) errors.push(`duplicate workflow ${workflow.workflow}`);
    workflows.add(workflow.workflow);
  }

  for (const field of ['measuredWorkflows', 'pendingWorkflows', 'exclusions']) {
    if (!Array.isArray(raw.scope[field])) errors.push(`scope.${field} must be an array`);
  }
  if (raw.scope.wholeCodebasePathCoverageClaim !== false) {
    errors.push('scope.wholeCodebasePathCoverageClaim must be false');
  }
  if (!['declared-reviewable', 'accepted'].includes(raw.approval.status)) {
    errors.push('path inventory approval status must be declared-reviewable or accepted');
  }
  if (raw.gate.eligibleStatus !== 'ready') errors.push('gate.eligibleStatus must be ready');
  if (typeof raw.gate.threshold !== 'number' || raw.gate.threshold < 0 || raw.gate.threshold > 1) {
    errors.push('gate.threshold must be between 0 and 1');
  }

  const readyWorkflows = new Set(
    raw.paths
      .filter((path) => isRecord(path) && path.status === 'ready' && typeof path.workflow === 'string')
      .map((path) => path.workflow),
  );
  for (const workflow of raw.scope.measuredWorkflows ?? []) {
    if (!readyWorkflows.has(workflow)) errors.push(`measured workflow has no ready path: ${workflow}`);
  }

  return {
    errors,
    metadataMissingCount,
    duplicatePathIdCount,
    duplicateTestReferenceCount,
    pathCount: raw.paths.length,
    readyPathCount: raw.paths.filter((path) => isRecord(path) && path.status === 'ready').length,
    pendingPathCount: raw.paths.filter((path) => isRecord(path) && path.status === 'pending').length,
    complete: errors.length === 0 && metadataMissingCount === 0 && duplicatePathIdCount === 0,
  };
}

export function loadPathInventory(inventoryPath = PATHS_PATH) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  } catch (error) {
    throw new Error(`unable to read path inventory ${inventoryPath}: ${error.message}`);
  }
  const validation = validateInventoryShape(raw);
  return { ...raw, validation };
}

function eventPathFromEnvironment() {
  return process.env.REBRAND_PATH_COVERAGE_EVENTS || DEFAULT_EVENTS_PATH;
}

function callsite() {
  const lines = new Error().stack?.split('\n').slice(1) ?? [];
  return lines.find((line) => !line.includes('/coverage/report.mjs'))?.trim() ?? null;
}

function appendScenarioEvent(eventPath, event) {
  mkdirSync(dirname(eventPath), { recursive: true });
  appendFileSync(eventPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function recordScenario(pathId, fn) {
  if (typeof pathId !== 'string' || !PATH_ID_PATTERN.test(pathId)) {
    throw new TypeError(`invalid declared path id: ${pathId}`);
  }
  if (typeof fn !== 'function' || !fn.name) {
    throw new TypeError('recordScenario requires a named function');
  }

  const started = process.hrtime.bigint();
  const base = {
    caller: callsite(),
    eventType: 'rebrand-path-scenario',
    pathId,
    scenarioName: fn.name,
    schemaVersion: COVERAGE_EVENT_SCHEMA_VERSION,
  };
  try {
    const result = await fn();
    appendScenarioEvent(eventPathFromEnvironment(), {
      ...base,
      durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      outcome: 'passed',
    });
    return result;
  } catch (error) {
    appendScenarioEvent(eventPathFromEnvironment(), {
      ...base,
      durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      error: error instanceof Error ? error.message : String(error),
      outcome: 'failed',
    });
    throw error;
  }
}

function readExecutionEvents(eventsPath) {
  if (!existsSync(eventsPath)) return { events: [], invalidEventCount: 0 };
  const events = [];
  let invalidEventCount = 0;
  const text = readFileSync(eventsPath, 'utf8');
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim().length === 0) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      invalidEventCount += 1;
      continue;
    }
    if (!isRecord(event)
      || event.eventType !== 'rebrand-path-scenario'
      || event.schemaVersion !== COVERAGE_EVENT_SCHEMA_VERSION
      || typeof event.pathId !== 'string'
      || typeof event.scenarioName !== 'string'
      || !['passed', 'failed'].includes(event.outcome)) {
      invalidEventCount += 1;
      continue;
    }
    events.push({ ...event, eventLine: index + 1 });
  }
  return { events, invalidEventCount };
}

function scenarioFunctionName(testReference) {
  return testReference.split('#')[1] ?? '';
}

export function createCoverageReport({
  eventsPath = eventPathFromEnvironment(),
  inventoryPath = PATHS_PATH,
  supplementaryCoverage = null,
} = {}) {
  const inventory = loadPathInventory(inventoryPath);
  const { events, invalidEventCount } = readExecutionEvents(eventsPath);
  const readyPaths = inventory.paths.filter((path) => path.status === 'ready');
  const declaredIDs = readyPaths.map((path) => path.pathId);
  const declaredIDSet = new Set(declaredIDs);
  const passedEvents = events.filter((event) => event.outcome === 'passed');
  const executionCounts = new Map();
  for (const event of events) {
    executionCounts.set(event.pathId, (executionCounts.get(event.pathId) ?? 0) + 1);
  }
  const duplicateIDs = sorted(
    [...executionCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([pathId]) => pathId),
  );
  const duplicateExecutionCount = [...executionCounts.values()]
    .reduce((total, count) => total + Math.max(0, count - 1), 0);
  const coveredIDs = sorted(new Set(
    passedEvents
      .filter((event) => declaredIDSet.has(event.pathId))
      .map((event) => event.pathId),
  ));
  const unobservedIDs = sorted(declaredIDs.filter((pathId) => !coveredIDs.includes(pathId)));
  const unexpectedIDs = sorted(new Set(events
    .map((event) => event.pathId)
    .filter((pathId) => !declaredIDSet.has(pathId))));
  const failedIDs = sorted(new Set(events
    .filter((event) => event.outcome === 'failed')
    .map((event) => event.pathId)));
  const scenarioReferenceMismatches = events
    .filter((event) => declaredIDSet.has(event.pathId) && event.outcome === 'passed')
    .map((event) => readyPaths.find((path) => path.pathId === event.pathId))
    .filter((path, index, paths) => path
      && events.find((event) => event.pathId === path.pathId && event.outcome === 'passed')?.scenarioName
        !== scenarioFunctionName(path.testReference))
    .map((path) => path.pathId);

  const declared = declaredIDs.length;
  const covered = coveredIDs.length;
  const ratio = declared === 0 ? 0 : covered / declared;
  const threshold = inventory.gate.threshold;
  const inventoryValid = inventory.validation.complete;
  const inventoryAccepted = inventory.approval.status === 'accepted';
  const inventoryDeclaredForReview = inventory.approval.status === 'declared-reviewable';
  const noUnmeasuredClaim = inventory.scope.wholeCodebasePathCoverageClaim === false;
  const measurementPass = inventoryValid
    && noUnmeasuredClaim
    && duplicateExecutionCount === 0
    && invalidEventCount === 0
    && unexpectedIDs.length === 0
    && unobservedIDs.length === 0
    && failedIDs.length === 0
    && scenarioReferenceMismatches.length === 0
    && ratio >= threshold;

  return {
    schemaVersion: 1,
    coverageType: 'bounded-decision-path',
    inventory: {
      path: inventoryPath,
      approvalStatus: inventory.approval.status,
      acceptedByMaintainer: inventoryAccepted,
      declaredForReview: inventoryDeclaredForReview,
      validation: inventory.validation,
    },
    scopeWarning: 'BOUNDED SCOPE ONLY: this is declared decision-path coverage, not exhaustive whole-codebase path coverage.',
    scope: {
      measuredWorkflows: inventory.scope.measuredWorkflows,
      pendingWorkflows: inventory.scope.pendingWorkflows,
      rootRepositoryPathCoverageClaim: false,
    },
    events: {
      path: eventsPath,
      observed: events.length,
      passed: passedEvents.length,
      failed: failedIDs.length,
    },
    coveredIDs,
    missingIDs: unobservedIDs,
    duplicateIDs,
    unexpectedIDs,
    failedIDs,
    counts: {
      declared,
      covered,
      missing: unobservedIDs.length,
      unobserved: unobservedIDs.length,
      duplicate: duplicateExecutionCount,
      duplicatePathIDs: inventory.validation.duplicatePathIdCount,
      unexpected: unexpectedIDs.length,
      invalidEvents: invalidEventCount,
      failed: failedIDs.length,
      referenceMismatches: scenarioReferenceMismatches.length,
    },
    coverage: {
      ratio,
      percent: Number((ratio * 100).toFixed(2)),
      threshold,
      thresholdPercent: threshold * 100,
    },
    gate: {
      declaredInventoryPass: measurementPass,
      measurementPass,
      complianceClaimPermitted: inventoryAccepted && inventory.scope.pendingWorkflows.length === 0,
      inventoryComplete: inventoryValid,
      inventoryAccepted,
      inventoryDeclaredForReview,
      thresholdMet: ratio >= threshold,
      rootRepositoryPathCoverageClaim: false,
    },
    supplementaryCoverage: {
      kind: 'standard-line-branch',
      independentOfDeclaredPaths: true,
      status: supplementaryCoverage === null ? 'not-collected' : 'provided-separately',
      data: supplementaryCoverage,
      note: 'Line, branch, and function coverage must be collected and interpreted separately; they are not path coverage.',
    },
  };
}

export function assertCoverageGate(report) {
  if (!report?.gate?.declaredInventoryPass) {
    throw new Error(`coverage gate failed: ${JSON.stringify({
      counts: report?.counts,
      coverage: report?.coverage,
      gate: report?.gate,
    })}`);
  }
  return report;
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!['--events', '--inventory', '--output'].includes(option) || !value || value.startsWith('-')) {
      throw new Error(`usage: node coverage/report.mjs [--events path] [--inventory path] [--output path]`);
    }
    const key = option.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`repeated option: ${option}`);
    options[key] = value;
  }
  return options;
}

export function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const report = createCoverageReport({
    eventsPath: options.events,
    inventoryPath: options.inventory,
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    writeFileSync(options.output, output, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
  } else {
    process.stdout.write(output);
  }
  if (!report.gate.declaredInventoryPass) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
