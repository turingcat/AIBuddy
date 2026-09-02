# Task 5 Report: AIBuddy Visible Identity

## Outcome

- Removed edition-dependent UI and deep-link test matrices; product-boundary deep links now assert `aibuddy://` acceptance and `goose://` rejection.
- Replaced active HeyBuddy account, extension, repository-link, assistant-prompt, snapshot, and README identity with AIBuddy equivalents.
- Preserved `goose` CLI, crate, environment, configuration, and compatibility names.
- Documented TFlow product authentication and the `Goose -> HeyBuddy shared -> AIBuddy` code lineage without exposing credentials or presenting HeyBuddy as the active app.

## RED

- Initial focused desktop run: 6 files / 39 tests, 8 expected failures from stale dual-edition and HeyBuddy assertions (recipe 3, extension deep links 3, i18n 1, extension copy 1).
- New settings regression: 1 of 4 tests failed because the account card still rendered `HeyBuddy`; link assertions were intentionally behind that identity assertion.
- Rust prompt assertions were changed first to require AIBuddy and reject HeyBuddy. The focused command could not reach test execution because Cargo dependency download stalled; offline verification identified missing `aws-lc-sys v0.44.0`.

## GREEN And Verification

- Focused desktop suite: 8 files / 56 tests passed.
- Focused changed-module coverage: 4 test files / 32 tests passed.
- Coverage denominator includes every changed functional TS/TSX module: `Hub.tsx`, `AppSettingsSection.tsx`, and `i18n/index.ts`.
- Coverage: statements 91.32% (179/196), branches/path proxy 80.00% (76/95), functions 81.48% (44/54), lines 92.30% (168/182).
- `pnpm run typecheck`: passed.
- `pnpm run i18n:check`: passed; Simplified Chinese catalog validated 1,491 messages.
- Prettier check, `cargo fmt --all -- --check`, and `git diff --check`: passed.
- Static scoped scan found no active HeyBuddy, `APP_EDITION`, or Goose issue links outside explicit negative assertions and the README lineage description.

## Files

- UI identity/tests: `ChatBrand.test.tsx`, `Hub.tsx`, `Hub.test.tsx`.
- Fixed brand/deep links: `i18n/index.ts`, `brandValues.test.tsx`, both locale catalogs, recipe and extension deep-link tests.
- Settings identity/tests: `AppSettingsSection.tsx`, `AppSettingsSection.logout.test.tsx`, `ExtensionList.test.tsx`.
- Agent-loop parity: shared prompt, prompt manager tests/fallback, five snapshots, and state-machine provider lifecycle assertion.
- Product documentation: root `README.md`.

## Commit

- `4ec7006f0 refactor(identity): use AIBuddy across active surfaces`

## Self-Review And Concerns

- No standards or spec defects found in the final diff. Legacy and state-machine prompt paths assert the same AIBuddy identity and retain the Chinese-language requirement.
- Rust tests and clippy were not executable in this environment: network dependency downloads stalled, and offline Cargo reported missing `aws-lc-sys v0.44.0`. No further network retries were made as directed.
- Desktop commands emit the existing Node engine warning because the host uses Node 26.8.1 while the project requests Node 24.10.x; verification still completed successfully.
