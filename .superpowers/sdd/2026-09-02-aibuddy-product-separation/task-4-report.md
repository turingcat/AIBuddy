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
