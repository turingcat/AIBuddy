# HeyBuddy Desktop CI/CD Design

## Objective

Replace the inherited Goose release automation with a small CI/CD system dedicated to two internal desktop products:

- HeyBuddy for macOS Apple Silicon and Windows x64.
- AIBuddy for macOS Apple Silicon and Windows x64.

Both products embed the `goose-cli` binary as their local backend. The CLI is not published separately. Linux, CUDA, documentation deployment, upstream release management, automatic updates, and signed distribution are outside this design.

## Product Matrix

Every release builds four desktop targets from the same source revision:

| Edition | Platform | Architecture |
| --- | --- | --- |
| HeyBuddy | macOS | ARM64 |
| HeyBuddy | Windows | x64 |
| AIBuddy | macOS | ARM64 |
| AIBuddy | Windows | x64 |

The editions share application code and, initially, visual assets. They have independent immutable application identities:

| Property | HeyBuddy | AIBuddy |
| --- | --- | --- |
| Product name | `HeyBuddy` | `AIBuddy` |
| macOS bundle identifier | `com.electron.heybuddy` | `com.electron.aibuddy` |
| URL protocol | `goose` | `aibuddy` |
| Windows AppId | `{FDA43817-EFCC-42D0-AB69-D414B629E300}` | `{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}` |
| Install directory | `HeyBuddy` | `AIBuddy` |

Brand-specific values live in one source-controlled brand manifest. Forge configuration, archive names, Inno Setup inputs, smoke tests, and release workflows consume this manifest through an explicit `APP_EDITION=heybuddy|aibuddy` input. Unknown edition values fail the build.

## Workflow Set

The repository keeps these product workflows:

1. `ci.yml`: pull-request and main-branch quality gate.
2. `bundle-macos.yml`: reusable macOS ARM64 desktop builder.
3. `bundle-windows.yml`: reusable Windows x64 desktop builder.
4. `canary.yml`: manually builds a specified ref for internal evaluation without creating a GitHub Release.
5. `release.yml`: builds and publishes a SemVer tag.
6. `publish-existing-release.yml`: recovers a failed publish step from verified artifacts of the matching release run.
7. `dependency-security.yml`: dependency advisory, policy, and unused-dependency checks.
8. `mcp-conformance.yml`: weekly and manually triggered MCP compatibility tests.
9. `goose-issue-solver.yml`: retained repository agent automation.
10. `goose-pr-reviewer.yml`: retained repository agent automation.

Dependabot configuration remains enabled for Cargo, pnpm, and GitHub Actions updates.

The following classes of workflow are removed:

- Linux and CUDA build or package workflows.
- Release branches, automated patch/minor branches, release-PR maintenance, and AI release-note generation.
- Documentation deployment, documentation preview, GDK documentation, recipe publication/security, and Ask AI service publication.
- Build notifications, generic code review, quarantine, stale-item handling, issue assignment, health dashboards, model sweeps, Scorecard, provider smoke tests, and Dependabot auto-merge.

Deleted historical workflows are also disabled in the GitHub Actions registry so they no longer clutter the Actions UI.

## Pull Request CI

Every pull request targeting `main` runs these checks:

- Workflow contract and YAML validation.
- Rust formatting and Clippy.
- Rust unit tests for the embedded backend.
- Generated ACP schema consistency.
- Desktop TypeScript checking, linting, and unit tests.
- Progressive Rust and Desktop coverage checks.
- Compile checks for macOS ARM64 and Windows x64 release targets.
- A final stable `CI Gate` job that succeeds only when all required jobs succeed.

Packaging is not repeated for every ordinary PR. The release-candidate path is the manually triggered Canary workflow, which builds all four distributable combinations from the requested ref.

Concurrency cancels superseded runs for the same pull request or branch.

## Progressive Coverage

The existing Desktop baseline is:

| Metric | Baseline |
| --- | ---: |
| Lines | 41.49% |
| Statements | 40.77% |
| Functions | 37.53% |
| Branches | 35.33% |

The existing failing Desktop unit test is fixed before coverage becomes required.

Coverage policy has two simultaneous gates:

1. Repository-wide coverage must not fall below the committed baseline. Baseline values may only increase.
2. Lines changed by a pull request must have at least 80% coverage.

Vitest with the V8 provider generates Desktop coverage. `cargo-llvm-cov`, backed by the Rust `llvm-tools-preview` component, generates Rust coverage for the embedded backend. Both produce machine-readable reports used by the diff coverage gate. Coverage artifacts are retained for diagnostic use when a gate fails.

The long-term target is at least 80% global branch coverage. Reaching it is incremental and does not block the initial CI/CD cleanup, provided the baseline never regresses and changed code meets 80%.

## Build and Artifact Flow

Each platform compiles `goose-cli` once for its supported architecture and uploads the executable as a short-lived internal artifact. HeyBuddy and AIBuddy packaging jobs download and embed the same platform binary.

Canary artifacts are retained for seven days and are not attached to a GitHub Release. Release artifacts are downloaded by the publishing job and attached to the versioned release.

Expected release assets per edition are:

- `<Edition>-macos-arm64.zip`
- `<Edition>-windows-x64-setup.exe`
- `<Edition>-windows-x64-portable.zip`

The Windows setup package installs into Program Files, creates integration entries and an uninstaller, and supports upgrade installation. The portable archive is extracted and run directly; it creates no installer records, while the application still stores normal per-user data.

Every release also includes `SHA256SUMS`. Source archives supplied automatically by GitHub are sufficient; the workflow does not create duplicate source archives.

## Tag-Only Release

A release starts only when a strict SemVer tag such as `v1.2.3` is pushed. The workflow validates all of the following before building:

- The tag has strict `vMAJOR.MINOR.PATCH` syntax.
- The tag points to a commit reachable from `main`.
- `Cargo.toml` and `ui/desktop/package.json` match the tag version.
- The tagged commit passed the required `CI Gate` for its pull request or main-branch revision.

The workflow then builds the four product/platform combinations once, verifies their embedded backend and package identity, creates checksums, and publishes one versioned GitHub Release containing both editions. It does not maintain release branches, a moving `stable` release, standalone CLI archives, or update manifests.

## Canary

Canary is a manual `workflow_dispatch` workflow with a required branch, tag, or SHA input. It builds all four unsigned desktop combinations and exposes their artifacts from the workflow run. It does not create or update a Git tag or GitHub Release. This is the supported internal release-candidate mechanism.

## Publish Recovery

`publish-existing-release.yml` is manual disaster recovery. Before downloading artifacts it queries the source run and rejects the request unless:

- The source run belongs to this repository and the Release workflow.
- The run conclusion is `success` or only its publish job failed after all build jobs succeeded.
- The source run head SHA exactly equals the requested tag commit.
- The tag is strict SemVer and reachable from `main`.
- All expected edition/platform artifacts exist and no unsupported platform artifact is present.

The workflow validates package filenames and hashes, regenerates `SHA256SUMS`, and publishes only the requested tag. It cannot relabel artifacts from another commit.

## Unsigned Internal Distribution

No macOS or Windows signing credentials are configured. Release and Canary packages are explicitly marked unsigned in job summaries. macOS launch smoke tests remove quarantine only inside the disposable CI runner. Windows smoke tests do not claim Authenticode trust.

Signing hooks are not part of the active workflow. The local Apple certificate action is removed unless another retained workflow consumes it.

## Automatic Update Removal

The desktop application contains no active automatic-update channel. The implementation removes:

- The bundled `app-update.yml` that points to `aaif-goose/goose`.
- Electron updater initialization and update IPC handlers.
- GitHub fallback updater code.
- Update settings UI and related tests.
- The `electron-updater` dependency.
- Release update manifests and the moving `stable` release.

Users obtain new internal builds through the organization's distribution channel.

## Cache and Disk Policy

Rust toolchain setup does not enable implicit target caching. CI does not archive complete `target/` directories.

- Cargo registry and Git dependency caches are retained.
- Compiler output uses a bounded `sccache` GitHub Actions cache.
- Every job uses a job-specific `CARGO_TARGET_DIR` under `RUNNER_TEMP`.
- Format, schema, and lint jobs do not save compiler target directories.
- Release jobs remove unused Rust intermediates before Electron packaging.
- pnpm caches its content-addressed store, not `node_modules`.
- Internal binary artifacts have one-day retention; Canary packages have seven-day retention.

This prevents the existing duplicate Rust caches and post-job cache uploads from exhausting runner disk.

## Action Supply Chain

All retained workflows follow these controls:

- Workflow-level permissions default to `contents: read`.
- Write permissions exist only on the publishing or agent job that requires them.
- Third-party actions are pinned to full immutable commit SHAs.
- Repository Actions policy requires SHA pinning and allows only GitHub-owned actions plus an explicit allowlist of retained third-party actions.
- Dependabot proposes weekly updates for action SHAs, Cargo dependencies, and pnpm dependencies.
- `pull_request_target` is not used by build or test workflows.
- External pull-request code never runs with write tokens or repository secrets.
- `CODEOWNERS` requires review for `.github/**`, release scripts, brand manifests, and installer definitions.
- Workflow jobs use explicit timeouts and concurrency controls.

The two retained Goose agent workflows keep their current trusted-comment authorization boundary. Their action and permission usage is reviewed and pinned as part of the migration.

## Repository Protection

GitHub branch protection for `main` requires:

- Changes through a pull request.
- At least one approving review.
- Dismissal of stale approvals after new commits.
- Resolution of review conversations.
- The branch to be current with `main` before merge.
- A successful `CI Gate` required check.
- Enforcement for administrators.
- No force pushes and no branch deletion.

An active tag ruleset matches `refs/tags/v*`. It allows initial tag creation but prevents tag update, non-fast-forward modification, and deletion. Tag creation by itself does not bypass the release workflow's SemVer and main-reachability validation.

## Verification

The implementation is verified with:

- Contract tests for workflow inventory, triggers, permissions, product matrix, release filenames, and recovery checks.
- Unit tests for brand resolution and installer parameter generation, written before production changes.
- Desktop unit tests and progressive coverage reports.
- Rust tests and progressive coverage reports.
- YAML/action static validation.
- A manual Canary run that produces all four unsigned product/platform combinations.
- macOS ARM64 launch checks for both editions.
- Windows x64 backend execution, portable launch, silent setup installation, launch, and uninstall checks for both editions.
- Read-back verification of GitHub branch protection, tag ruleset, Actions permission policy, and disabled historical workflows.
