# AIBuddy Sync and Windows Downloads Implementation Plan

**Goal:** Sync the approved HeyBuddy main exception, disable all GitHub workflows, add Windows downloads to TFlow, and publish release installers to AIBuddy COS stable keys.

**Architecture:** Preserve AIBuddy product identity and desktop-only release policy while merging engine and desktop changes. Reuse the upstream COS uploader with AIBuddy object keys. Keep workflow definitions available for later manual enablement.

**Tech Stack:** Git, GitHub Actions, Bash/coscli, Python unittest, Node tests, static HTML/CSS.

## Constraints

- Work on `sync/heybuddy-main-windows-cos-20260906`, not main.
- User approved the exception to synchronize upstream/main because upstream/shared is absent.
- Preserve AIBuddy authentication, service configuration, assets, credentials, and migration logic.
- Never enable or dispatch workflows, publish a release, or upload installers during this task.
- Both installers must exist before any upload; failures must fail the release job.
- COS bucket: heybuddy-1252724067; prefix: aibuddy/stable.
- Installer names: AIBuddy-windows-x32-setup.exe and AIBuddy-windows-x64-setup.exe.
- TFlow links are literal fixed URLs, with no configuration UI or runtime download settings.

## Tasks

- [x] Inspect repository, remote branches, workflows and TFlow homepage; obtain design approval.
- [x] Disable all 36 repository workflows. GitHub rejects disabling the system Dependabot workflow (422), so also disable the repository Actions master switch and verify `enabled: false`.
- [x] Merge upstream/main; resolve CI and desktop conflicts preserving both intended behaviors.
- [x] Update uploader tests for AIBuddy names and prefix; observe failures, adapt uploader, run tests.
- [x] Connect COS upload to tagged release and existing-release publication; retain desktop-only assets and reject missing/empty installers before COS writes.
- [x] Add responsive Windows downloads to /Users/turingcat/Project/tflow/index.html, referencing the existing download page's Windows content.
- [x] Run product-boundary, workflow contracts, full desktop tests, formatting and available static checks; inspect desktop/mobile page rendering.
- [x] Review the diff and record verification limits; prepare the verified synchronization branch for local commit without merging or pushing main.

## Verification

Use `gh workflow list --all --json id,name,state --limit 100` to verify remote state. Run `python3 .github/scripts/test_upload_windows_installers_to_cos.py`, `python3 scripts/test-supported-build-architectures.py`, `ruby scripts/test-release-workflows.rb`, `ruby scripts/test-ci-performance-contracts.rb`, and `pnpm run check:product-boundary` in ui/desktop. Run focused Node tests for Windows packaging and auth transition. Validate workflow YAML with a structured parser/actionlint where available. Use a browser to inspect TFlow at desktop and mobile sizes and verify both anchor URLs. Do not claim actual Windows builds or COS writes were tested locally.

## Verified Result

- Upstream main: `d630adc1170157545e472d7fa6478c8b57c89610`.
- Hermit Rust 1.96.1: `bin/cargo clippy --all-targets -- -D warnings` and formatting check passed. An initial system Rust 1.98 run reported lint errors in untouched code; the pinned repository toolchain passed.
- Full desktop Vitest suite: 146 files, 1223 tests passed. Typecheck and product boundary passed.
- Auth transition/logout coverage: 100% lines and statements, 94.44% branches. This is measured branch coverage for those modules, not a claim of repository-wide path coverage.
- CI performance contracts: 47 tests, 1660 assertions passed. Build architecture contracts: 7 tests passed. Release workflow contracts passed.
- COS uploader: 15 tests passed, including missing/empty artifacts, missing credentials, first/second upload failures, executable validation, pinned bootstrap, download failure, and checksum failure.
- Workflow YAML parsed successfully; Azure is manual-only.
- Actual TFlow file passed browser checks at 1440, 768, 390 and 320 pixels, including fixed links, retained existing content, visible navigation, nonbroken logo, and download section layout.
- Final review resolved the inherited session-refresh failure hang and missing core dependencies in the Roaming CI filter. No further concrete findings in the scoped review.
- No Windows installer was built or executed, no installer was downloaded, no COS object was written, and no release workflow was enabled or dispatched.
