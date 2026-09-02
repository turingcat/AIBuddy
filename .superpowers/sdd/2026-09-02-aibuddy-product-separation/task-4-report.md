# Task 4 Report

## Outcome

- Removed the bundled HeyBuddy declarative provider and all normal provider, credential, model fallback, balance, and account-test paths.
- `buildGooseServeEnv` now emits only `AIBUDDY_BASE_URL`, `AIBUDDY_API_KEY`, and `GOOSE_PROVIDER=aibuddy`.
- Valid canonical and legacy-marked AIBuddy credentials remain readable; unmarked, OA, and canonical HeyBuddy credentials are rejected.
- Preserved the separate AIBuddy data migration module and verified its focused tests.

## TDD

- RED: focused desktop suite reported 11 failures and 55 passes against the old fallbacks.
- RED mutation: restoring `heybuddy.json` and its registry entry made `heybuddy_provider_is_not_bundled` fail as intended. This also corrected the assertion to check `heybuddy.json` rather than `heybuddy`.
- GREEN: focused desktop plus migration tests reported 78/78 passing; declarative Rust tests reported 13/13 passing.

## Verification

- `pnpm exec vitest run ...`: 8 files, 78 tests passed.
- `cargo test -p goose-providers declarative::tests --lib`: 13 tests passed.
- `pnpm run typecheck`: passed.
- `cargo fmt` and focused Prettier formatting: completed.

## Files

- Rust declarative registry/test and deleted `definitions/heybuddy.json`.
- Desktop environment builder/caller, credential codec/tests, model fallbacks/tests, and balance/account presentation tests.

## Commit

- `3c3cdc1ce refactor(aibuddy): remove HeyBuddy provider paths`

## Concerns

- Typecheck prints the existing Node engine warning because the environment uses Node 26 while the package requests Node 24; it still exits successfully.
- `aibuddyDataMigration.ts` remains intentionally unchanged for Task 7.

## Review Fix Round 1

### Outcome

- Replaced the inline balance and model IPC handlers with a tested TFlow-only registration module.
- Removed the PAT `/api/user/self`, `/api/status` currency-cache, and direct gateway `/models` fallback implementations and tests.
- Changed credentials to a marked canonical-or-legacy AIBuddy union; `writeCredentials` now validates unknown input before encryption and rejects unmarked, OA, and HeyBuddy records without creating a file.

### TDD

- RED: all three invalid writer cases failed because the writer accepted and persisted them.
- GREEN: credential tests passed 29/29 after writer validation and marked fixture updates.
- RED: the runtime IPC skeleton passed only the logged-out case; refresh/writeback, unauthorized mapping, gateway models, and failure logging failed as expected.
- GREEN: runtime IPC tests passed 5/5 after implementing the TFlow-only handlers.

### Coverage

Focused Vitest V8 coverage includes `aibuddyRuntimeIpc.ts`, `balance.ts`, `credentials.ts`, and `gooseServeEnv.ts`. Branch coverage is used as the closest available path metric.

| Metric | Coverage |
| --- | ---: |
| Statements | 91.3% (84/92) |
| Branches | 86.11% (62/72) |
| Functions | 100% (21/21) |
| Lines | 93.02% (80/86) |

### Verification

- Focused desktop and migration suite: 10 files, 92/92 tests passed.
- Focused coverage suite: 4 files, 42/42 tests passed.
- `pnpm run typecheck`: passed.
- `cargo test -p goose-providers declarative::tests --lib`: 13/13 tests passed.
- `pnpm exec prettier --write ...` and `cargo fmt --all`: completed.
- `git diff --check`: passed.
