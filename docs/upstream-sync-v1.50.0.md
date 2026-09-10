# Upstream sync: aibuddy v1.50.0

## Inputs

- Upstream tag: `v1.50.0`
- Upstream source commit: `4cc49a8485f7960efeceba37ac5f572459c52c7c`
- Transformed M0 mirror: `050ea5d6d5517aac7b59c268749e912abd0070b1` (aibuddy v1.49.0)
- Transformed M1 mirror: `686e7e9125978d21af1ae560bb2500f4700530c0`
- M1 transformed tree: `f196ad16c843e8c3dbf331b095635ce4187f2e7f`
- Transform identity: `6cf61a422b166d2537f52f2956b2d6e75799be152efcb071bd3c9ae8a1df992c`

The v1.49.0 release commit is not a direct ancestor of v1.50.0. The mirror append
used the reviewed `patch-equivalent-release-advance` relation. Git found no old
release patch absent from v1.50.0; the recorded source merge base is
`dd8de0196716db393fa1cd146d92a5f46e05d1a1`.

## Merge decisions

- Kept the AIBuddy product version at `1.0.6` across Cargo, desktop, ACP client,
  npm wrapper, and platform binary packages.
- Preserved AIBuddy branding assets and the edition-aware desktop packaging
  scripts. Legacy brand resources remain available to the brand migration code.
- Preserved the OA login flow, dynamic model restrictions, provider UI patches,
  Chinese session-title behavior, and the en/zh-CN locale set.
- Preserved disabled frontend telemetry and desktop updater behavior. Upstream
  content-capture gating was retained in both the legacy agent loop and the state
  machine path.
- Preserved the unified AIBuddy release workflows and Windows x32/x64 desktop
  packaging. Upstream standalone Maven, Python, npm, CLI, and GDK publish workflows
  remain disabled or removed.
- Adopted the v1.50.0 ACP package split: `@aibuddy/aibuddy-acp-client` contains
  generated client types, while `@aibuddy/aibuddy-acp` owns executable resolution.
  The removed `ui/sdk` package is no longer referenced.
- Preserved the existing Apple Silicon-only macOS product policy by excluding the
  removed Darwin x64 binary package from the wrapper, release scripts, tests, and
  lockfile.
- Combined the Snowflake product user-agent assertion with the upstream HTTPS-only
  host validation.
- Combined upstream user-visible message filtering with AIBuddy Chinese local
  session-name normalization.
- Preserved the upstream Whisper tokenizer bytes exactly while mapping its path
  into the AIBuddy tree. The production rebrand policy records this as
  content-preserved data and tests the distinction between path and content.
- Extended legacy session migration from `aibuddy_mode` to `aibuddy_mode`, including
  databases already at the current schema version but missing both mode columns.
  Databases containing both columns remain rejected as ambiguous.
- Updated MCP replay branding to `aibuddy-desktop` and `/tmp/aibuddy_test`, while
  preserving the external `block/goose` fixture repository literal as third-party
  data. All three replay fixtures pass.
- Accepted the upstream local-inference registry removal, AIML API provider,
  permission persistence fixes, summon turn-count changes, and `aibuddy-agent`
  tool API.

## Verification

Verification was completed on the sync branch on September 10, 2026:

- Rebrand Node tests: 167 passed.
- Rebrand Rust parser tests: 4 passed.
- Rust formatting: `cargo fmt --all --check` passed.
- Rust build: `cargo build --locked` passed.
- Rust lint: `cargo clippy --all-targets --locked -- -D warnings` passed.
- Workspace tests: `cargo test --locked -- --skip test_codex_provider --skip relay_to_direct_upgrade_loses_no_data` completed successfully. The core `aibuddy` crate ran 2,418 tests, and the MCP replay integration ran all three fixtures.
- Desktop typecheck passed; Vitest ran 150 files and 1,189 tests successfully.
- ACP client lint passed; the ACP npm wrapper ran 13 tests successfully.
- CI performance contracts ran 46 tests and 799 assertions successfully.
- Supported-build architecture contracts ran 11 tests successfully.
- Win7 PE checks ran 5 tests successfully; native Win7 SP1 runtime validation remains a release-machine requirement.
- Windows COS publishing contracts ran 8 tests successfully.
- npm package versions are aligned at `1.0.6`.

Two live/environment-dependent tests were investigated separately:

- `test_codex_provider` reached the locally configured Responses gateway at
  `http://127.0.0.1:8787/v1/responses`, which returned HTTP 404 because model
  `gpt-5.2-codex` is unavailable in that gateway group. The Claude Code live
  provider test passed.
- `relay_to_direct_upgrade_loses_no_data` could not select a localhost direct path
  within 30 seconds on this machine. The test, roaming implementation, and pinned
  `iroh 1.1.0` dependency are unchanged from the pre-sync AIBuddy baseline; an
  isolated rerun reproduced the same local hole-punch limitation.
