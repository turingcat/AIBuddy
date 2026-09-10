# AIBuddy Product Separation Final Fix Report

## Outcome

- Removed release workflow calls and artifacts for the updater subsystem intentionally deleted in `7ef6de6e`.
- Aligned release, canary, recovery, and release-candidate consumers with AIBuddy package names while retaining internal Goose build-artifact labels.
- Narrowed packaged desktop resources to `src/images/aibuddy`, fixed the Windows installer icon, and routed packaged main/tray asset lookup through `Resources/aibuddy`.
- Forced the embedded Goose child process to use `GOOSE_PROVIDER=aibuddy`, including when the parent environment contains a hostile legacy provider value.
- Registered the AIBuddy protocol plus the Goose Nostr compatibility scheme and allowlisted only exact `goose://sessions/nostr` inbound routes across startup argv, second-instance, and macOS `open-url` handling.
- Expanded product-boundary and release contracts to cover active release workflows, installer metadata, release scripts, and agent prompt fallbacks.
- Aligned the legacy agent-loop provider-request prompt with the existing AIBuddy Chinese identity used by the state-machine/shared prompt path.

## TDD Evidence

- Initial desktop RED exercised every requested boundary group: 10 intended failures plus the missing `protocolRouting.ts` module. The release contract also failed on the stale native-updater workflow flag.
- The first integrated desktop GREEN reached 54/55; the remaining failure exposed uppercase Goose URL canonicalization. After canonicalization, the routing subset passed 19/19.
- Coverage RED after the functional fixes was 70.00% aggregate branch coverage. Tests were then added for in-process Forge configuration, explicit/fallback publishing environment, unsupported package platforms, malformed plist identity/schemes, Windows plist short-circuiting, and invalid Darwin tree short-circuiting.
- Final coverage GREEN passed hard 80% thresholds without file exclusions or coverage-ignore directives.

## Final Verification

- Focused desktop suite: 10/10 files, 62/62 tests passed.
- Focused coverage: statements 91.66% (154/168), branches 80.00% (64/80), functions 96.77% (60/62), lines 91.66% (143/156).
- Release workflow contract: `ruby scripts/test-release-workflows.rb` passed.
- Live product boundary: `pnpm run check:product-boundary` exited 0.
- Desktop typecheck: `pnpm run typecheck` exited 0.
- Legacy agent-loop parity: 1/1 focused Rust test passed; 2103 tests filtered out.
- Formatting and whitespace: Prettier check, `cargo fmt --all -- --check`, and `git diff --check` passed.
- Targeted stale-reference scan found no old HeyBuddy release artifact names, deleted updater scripts/manifests, or legacy installer icon path in active release/packaging files.

## Residual Risk

- The host uses Node 26.8.1 while the desktop package declares Node `^24.10.0`; pnpm reports this as a warning, but the focused tests and typecheck pass.
- Vitest reports the existing warning that `vitest.config.ts` uses ESM syntax while loaded as CommonJS under the future native config loader.
- A full workspace build, full test suite, Clippy, package build, and manual dual-application install/launch verification were not run in this fix round.
