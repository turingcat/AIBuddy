# Bounded Decision-Path Coverage

This directory defines and measures a finite decision-path inventory for the
rebrand tool. It does **not** claim exhaustive path coverage of the repository,
the tool, or any source module. The inventory is declared and reviewable; it is
not approval by itself, and passing its gate must not be described as
whole-codebase path coverage. A path is a named, reviewable workflow
scenario with a condition sequence, expected observable/result, and executable
scenario reference. It is not a line, branch, function, or CFG path.

The current inventory measures the ready public workflows in `paths.json`:

- `inventory`
- `generate`
- `verify`
- `apply`
- `rules`
- `format`

`mirror` is explicitly pending because there is no ready public mirror workflow
in `tools/rebrand`. It is excluded from the denominator. The report always
flags this bounded scope and keeps the root-repository path-coverage claim
false.

## Run the gate

From `tools/rebrand`:

```sh
node --test tests/coverage.test.mjs
```

The gate test launches `coverage-paths.test.mjs` in a child Node test process,
sets `REBRAND_PATH_COVERAGE_EVENTS` to a temporary JSONL file, and builds the
report from those actual execution records. It does not parse TAP or other test
output to infer coverage. A scenario is covered only when its named callback
returns successfully and `recordScenario(pathId, fn)` records a passed event.

The complete package test suite also includes the scenario test:

```sh
npm test
```

The report can be generated directly from a controlled event file:

```sh
REBRAND_PATH_COVERAGE_EVENTS=/tmp/rebrand-path-events.jsonl \
  node --test tests/coverage-paths.test.mjs
node coverage/report.mjs --events /tmp/rebrand-path-events.jsonl
```

The report fails its gate when inventory metadata is incomplete or not accepted,
declared IDs are duplicated, execution records are duplicated or unexpected,
ready paths are unobserved, scenario references do not match, scenario tests
fail, or coverage is below 80% of the declared ready paths. The denominator is
only the declared bounded inventory; passing it is not a claim about the whole
codebase.

## Event API

`coverage/report.mjs` exports:

```js
await recordScenario('inventory.pinned-tree-candidate', async function scenarioName() {
  // Exercise real rebrand-tool functions and assert the expected observable.
});
```

Events are structured JSONL records written to
`REBRAND_PATH_COVERAGE_EVENTS`, or to a process-scoped temporary default when
the variable is absent. The reporter records passed and failed executions,
callback names, caller diagnostics, and durations. Coverage derives
`coveredIDs` from those records rather than from a hardcoded allow-list.

## Supplementary coverage

Node's standard line/branch/function coverage may be run separately, for
example with `node --experimental-test-coverage --test tests/*.test.mjs`.
Those measurements are supplementary and are reported in a separate
`supplementaryCoverage` section when supplied. They do not increase or replace
the declared decision-path measure.
