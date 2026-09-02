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

## Review Fix Round 2

### Outcome

- Removed the unreachable PAT-specific `no-pat` result kind, hook state, widget message branch, and obsolete fixtures.
- Preserved logged-out, TFlow entitlement, loading, unauthorized, and generic error behavior.
- Expanded coverage to every named Task 4 functional module plus `useBalance.ts`; no UI module was excluded from the denominator.

### TDD

- RED: an obsolete auth payload produced the dedicated `{ status: 'no-pat' }` state instead of the generic error state (1 failed, 22 passed).
- GREEN: after removing the dedicated result/state/UI branches, the focused hook and widget suites passed 27/27.
- Added behavior coverage for global and session model changes, model-change failures, display-name resolution, balance status variants, and the refreshing control.

### Full Module Coverage

Vitest V8 branch coverage is used as the closest available path metric.

| Module | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `aibuddyRuntimeIpc.ts` | 95.65% | 75% | 100% | 95.45% |
| `balance.ts` | 100% | 100% | 100% | 100% |
| `credentials.ts` | 87.03% | 84.61% | 100% | 90% |
| `gooseServeEnv.ts` | 100% | 100% | 100% | 100% |
| `ModelAndProviderContext.tsx` | 86.45% | 73.46% | 100% | 88.29% |
| `SwitchModelModal.tsx` | 89.24% | 74.64% | 90.47% | 90.9% |
| `BalanceWidget.tsx` | 97.43% | 92.68% | 100% | 97.36% |
| `UserAccountMenu.tsx` | 100% | 100% | 100% | 100% |
| `useBalance.ts` | 100% | 100% | 100% | 100% |
| **Aggregate** | **91.44% (342/374)** | **82.94% (214/258)** | **97.36% (74/76)** | **92.71% (331/357)** |

### Verification

- Broader focused Task 4 suite: 11 files, 123/123 tests passed.
- Full-include coverage suite: 9 files, 105/105 tests passed.
- `pnpm run typecheck`: passed.
- `pnpm exec prettier --write ...` and `cargo fmt --all`: completed.
- Desktop source search contains no `no-pat`, `noPat`, or `balanceWidget.noPat` references.

## Review Fix Round 3

### Outcome

- Removed the two dead `balanceWidget.noPat` locale entries from the English and Simplified Chinese message catalogs.

### Verification

- `pnpm run i18n:check`: passed; zh-CN validated with 1,492 messages.
- `pnpm run i18n:compile`: passed.
- `rg -n "balanceWidget\\.noPat|noPat" ui/desktop/src/i18n/messages ui/desktop/src -g '*.json' -g '*.ts' -g '*.tsx'`: no matches.
