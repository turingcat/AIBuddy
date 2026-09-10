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

## Review Fix Round 1

### Outcome

- Preserved AIBuddy-only recipe and extension deep links while restoring generic Nostr share/import compatibility through `goose://sessions/nostr`.
- Extracted the Nostr prefix, validation, and locale-independent placeholder into `nostrProtocol.ts`; `App.tsx` and `SessionListView.tsx` are wiring callsites covered by component regressions.
- Replaced active HeyBuddy identity in the desktop title, backend recovery message/log, Windows shim path/logs, and Forge repository fallback. Legacy migration paths and historical compatibility references remain unchanged.
- Removed the `APP_EDITION=heybuddy` suite seed and edition-oriented app identity fixtures.
- Extended the state-machine lifecycle assertion to retain the standard Chinese-language instruction.

### RED

- Nostr component tests failed because `goose://sessions/nostr` was rejected and both English and Chinese placeholders rendered the product protocol.
- Desktop identity tests failed on the HeyBuddy lease message/log, `%LOCALAPPDATA%/HeyBuddy/bin`, Forge repository fallback, and HTML title.

### GREEN Verification

- Final protocol/identity focused suite: 14 files / 109 tests passed before the final test-only cleanup; the corrected Forge and winShims tests then passed 10/10.
- Behavior-module coverage (`nostrProtocol.ts`, `gooseServeLeaseRegistry.ts`, `winShims.ts`): statements 90.69% (78/86), branches/path proxy 86.84% (33/38), functions 80.95% (17/21), lines 91.56% (76/83).
- `pnpm run typecheck`: passed after final cleanup.
- `pnpm run i18n:check`: passed; Simplified Chinese catalog validated 1,490 messages.
- Prettier check, `cargo fmt --all -- --check`, and `git diff --check`: passed.
- Offline-only Rust test attempt could not start because `aws-lc-sys v0.44.0` is absent from the local Cargo cache. No network retry was made.
- `check:product-boundary` continues to report the intentional Task 7 migration baseline in `aibuddyDataMigration.ts` and `main.ts`; its allowlist was not changed.
- Desktop commands retain the existing Node 26.8.1 versus requested Node 24.10.x engine warning.

## Review Fix Round 2

### Coverage Denominator

- Included every functional TypeScript module changed in Review Fix Round 1: `App.tsx`, `SessionListView.tsx`, `nostrProtocol.ts`, `gooseServeLeaseRegistry.ts`, `winShims.ts`, and `forge.config.ts`.
- Initial full-denominator coverage was statements 50.34% (365/725), branches/path proxy 37.83% (98/259), functions 45.40% (79/174), and lines 51.14% (357/698).
- No changed module, uncovered branch, or source region was excluded or ignored.

### Added Behavior Coverage

- Added App integration scenarios for phantom-session cleanup, active-session LRU events, concurrent and failed Nostr imports, macOS/Windows new-window shortcuts, drag/drop boundaries, view/focus/initial-message IPC commands, and startup/runtime fatal errors.
- Added SessionListView workflows for pagination and deduplication, scheduled sessions, debounced search, load and page errors, restricted Nostr mode, edit/duplicate/delete/export/share actions, native and file imports, Nostr imports, clipboard errors, and incremental scrolling.
- Added in-process Forge configuration tests so environment override and AIBuddy fallback branches are instrumented directly rather than observed only through a child process.
- Preserved all Round 1 product-versus-Nostr protocol tests and made no production behavior changes.

### Verification

- Full-denominator coverage suite: 7 files / 59 tests passed.
- Final coverage: statements 88.00% (638/725), branches/path proxy 81.85% (212/259), functions 83.90% (146/174), and lines 88.96% (621/698).
- Per-file branch coverage: `App.tsx` 65.06% (54/83), `SessionListView.tsx` 90.29% (121/134), `gooseServeLeaseRegistry.ts` 85.71%, `winShims.ts` 90.00%, `forge.config.ts` 100%, and `nostrProtocol.ts` 100%.
- Expanded focused protocol and identity suite: 15 files / 137 tests passed.
- `pnpm run typecheck`, `pnpm run i18n:check`, `cargo fmt --all -- --check`, Prettier check, and `git diff --check`: passed.
- The existing Node 26.8.1 versus requested Node 24.10.x warning remains unchanged.
