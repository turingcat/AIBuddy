# Desktop CI/CD Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inherited Goose automation with ten least-privilege workflows that test, build, and publish only the four approved Desktop targets.

**Architecture:** Reusable macOS and Windows workflows compile one embedded CLI per platform and package both editions from that binary. CI has one stable `CI Gate`; tag release and manual Canary call the reusable workflows, while recovery republishes only verified artifacts from the matching Release run. Repository-owned Ruby contract tests enforce inventory, triggers, permissions, action pinning, artifact names, and recovery checks before GitHub interprets the YAML.

**Tech Stack:** GitHub Actions, Ruby standard library and Minitest, Rust/Cargo, `cargo-llvm-cov`, Vitest V8 coverage, pnpm, Electron Forge, Inno Setup, `sccache`, GitHub CLI.

## Global Constraints

- Retain exactly: `ci.yml`, `bundle-macos.yml`, `bundle-windows.yml`, `canary.yml`, `release.yml`, `publish-existing-release.yml`, `dependency-security.yml`, `mcp-conformance.yml`, `goose-issue-solver.yml`, and `goose-pr-reviewer.yml`.
- Retain `.github/dependabot.yml` with weekly Cargo, pnpm, and GitHub Actions updates.
- Release assets are exactly six packages plus `SHA256SUMS`: one macOS ARM64 ZIP, Windows x64 setup EXE, and Windows x64 portable ZIP for each edition.
- Release builds are unsigned and contain an embedded `goose-cli`; no standalone CLI artifact is uploaded.
- Release tags are strict `vMAJOR.MINOR.PATCH`, reachable from `main`, version-matched, and backed by successful CI.
- Canary is manual, accepts an explicit ref/SHA, keeps artifacts seven days, and creates no tag or Release.
- Recovery verifies the source workflow/run/SHA/tag/job results/artifact set/hashes before publishing.
- No complete Cargo `target/` directory is cached. Internal backend artifacts retain one day.
- Workflow-level permissions default to `contents: read`; write permissions are job-local and only where required.
- Every external action uses a full 40-character commit SHA with a version comment.
- Changed lines require 80% coverage. Existing global coverage baselines cannot regress and may only be raised.
- Plan 1 (`2026-08-29-desktop-brand-packaging.md`) is completed first.

---

### Task 1: Replace Legacy Workflow Tests with a Complete Contract Suite

**Files:**
- Create: `scripts/test-workflow-contracts.rb`
- Delete: `scripts/test-release-workflows.rb`
- Delete: `scripts/test-supported-build-architectures.py`

**Interfaces:**
- The test parses all retained YAML with `YAML.safe_load(..., aliases: true)` and treats YAML 1.1 `on` correctly.
- Constants define the exact retained inventory, edition/platform matrix, final filenames, and forbidden tokens.
- Tests cover workflow permissions, timeouts, concurrency, SHA pins, no `pull_request_target`, no Linux/CUDA/signing/updater/standalone CLI publication, stable `CI Gate`, and recovery validation markers.

- [ ] Write the contract suite against the approved target state before changing workflows.

```bash
ruby scripts/test-workflow-contracts.rb
```

Expected: FAIL with the complete list of obsolete workflows and missing contracts.

- [ ] Ensure failures are independent Minitest assertions rather than one early `abort`, so one run reports all drift.

- [ ] Remove the two narrow legacy test scripts after their assertions are represented in the new suite.

- [ ] Commit the red contract tests.

```bash
git add scripts/test-workflow-contracts.rb
git rm scripts/test-release-workflows.rb scripts/test-supported-build-architectures.py
git commit -m "test(ci): define desktop workflow contracts"
```

### Task 2: Add a Tested Diff-Coverage Gate

**Files:**
- Create: `scripts/diff-coverage.rb`
- Create: `scripts/test-diff-coverage.rb`
- Create: `.github/coverage-baseline.json`
- Modify: `ui/desktop/vitest.config.ts`

**Interfaces:**
- CLI: `ruby scripts/diff-coverage.rb --base <git-ref> --threshold 80 --lcov <path> [--lcov <path>]`.
- It parses LCOV `SF`, `DA`, and `BRDA` records, intersects executable lines with added/modified lines from `git diff --unified=0`, prints covered/total/percent per file, and exits nonzero below 80%.
- Deleted lines, binary files, generated files, tests, and files absent from the supplied LCOV report do not inflate coverage; changed executable source with zero covered lines fails.
- `.github/coverage-baseline.json` stores numeric Desktop and Rust global metrics measured from the first clean run; future values may increase but not decrease.
- Vitest enforces the known Desktop floor: lines 41.49, statements 40.77, functions 37.53, branches 35.33.

- [ ] Write fixture-based Minitest cases for 80% exact pass, 79.99% fail, renamed files, deleted lines, branch records, multiple LCOV inputs, Windows path normalization, and no changed executable lines.

```bash
ruby scripts/test-diff-coverage.rb
```

Expected: FAIL because the parser does not exist.

- [ ] Implement the LCOV parser and git diff intersection using Ruby standard libraries only.

- [ ] Add Vitest V8 reporters `text`, `json-summary`, and `lcov`; add the four explicit global thresholds to `vitest.config.ts`.

- [ ] Install Rust coverage tooling for the baseline measurement, then record the exact output values in `coverage-baseline.json`.

```bash
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --version 0.6.21 --locked
cargo llvm-cov --workspace --all-features --lcov --output-path target/coverage/rust.lcov
cd ui/desktop
pnpm test -- --coverage --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=lcov
```

Expected: both reports are generated. If Rust all-features is not supported by the workspace, use the same package/feature set selected for `ci.yml` and record that exact command beside the Rust baseline in the JSON `command` field.

- [ ] Run parser and Desktop coverage tests.

```bash
ruby scripts/test-diff-coverage.rb
cd ui/desktop
pnpm test -- --coverage
```

Expected: PASS and no global Desktop metric below the committed floor.

- [ ] Commit coverage tooling and baseline.

```bash
git add scripts/diff-coverage.rb scripts/test-diff-coverage.rb .github/coverage-baseline.json ui/desktop/vitest.config.ts
git commit -m "test(ci): enforce progressive coverage"
```

### Task 3: Rebuild Pull Request CI Around `CI Gate`

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Triggers: pull requests to `main`, pushes to `main`, merge queue, and manual dispatch.
- Jobs: `workflow-contracts`, `rust-quality`, `rust-coverage`, `schema-check`, `desktop-quality`, `desktop-coverage`, `compile-macos-arm64`, `compile-windows-x64`, and `ci-gate`. `rust-quality` includes Cargo Deny and cargo-machete so dependency checks are inside the required gate; `dependency-security.yml` repeats them on a weekly/manual/path-filtered schedule.
- The final job name is exactly `CI Gate`, uses `if: always()`, depends on every required job, and fails unless every dependency is `success` or an explicitly allowed path skip.
- PR concurrency key is workflow plus PR number/ref with `cancel-in-progress: true`.

- [ ] Extend contract tests for the exact job IDs, runner OS per compile target, coverage commands, and `CI Gate` dependency list.

```bash
ruby scripts/test-workflow-contracts.rb --name /ci/
```

Expected: FAIL against the inherited CI file.

- [ ] Replace `ci.yml` with the nine-job design. Remove MSRV, alternate TLS, roaming, UniFFI, GDK docs, and unrelated inherited matrices from this required workflow.

- [ ] Configure Rust jobs with `CARGO_TARGET_DIR=${{ runner.temp }}/target-${{ github.job }}`, `RUSTC_WRAPPER=sccache`, `SCCACHE_DIR=${{ runner.temp }}/sccache`, and `SCCACHE_CACHE_SIZE=1G`. Install sccache with `mozilla-actions/sccache-action@fc920bf0ec8de6ee65d409111f7ec508035751ba` (`v0.0.11`).

- [ ] Use `actions-rust-lang/setup-rust-toolchain` with `cache: false`; cache only Cargo registry/git directories and the bounded sccache directory. Do not cache `target/`.

- [ ] Configure Node with the repository Node version, `actions/setup-node` pnpm caching, `corepack enable`, and `pnpm install --frozen-lockfile` from `ui/`. Never cache `node_modules`.

- [ ] In `desktop-coverage`, run Vitest V8 coverage, compare `coverage-summary.json` to `.github/coverage-baseline.json`, run changed-line coverage at 80%, and upload reports only with one-day retention.

- [ ] In `rust-coverage`, install `llvm-tools-preview` and pinned `cargo-llvm-cov 0.6.21`, generate LCOV, compare the committed global baseline, run changed-line coverage at 80%, and upload reports only with one-day retention. Checkout with full history and select the diff base as `pull_request.base.sha` for PRs or `github.event.before` for main pushes.

- [ ] Run local workflow contracts and commands that do not require other OSes.

```bash
ruby scripts/test-workflow-contracts.rb
ruby scripts/test-diff-coverage.rb
cd ui/desktop
pnpm run typecheck
pnpm run lint
pnpm test
```

Expected: PASS. macOS and Windows target compile jobs are verified by the PR run.

- [ ] Commit streamlined CI.

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add required desktop quality gate"
```

### Task 4: Rebuild Reusable macOS Packaging

**Files:**
- Modify: `.github/workflows/bundle-macos.yml`

**Interfaces:**
- `workflow_call` inputs: required `ref` string and `retention_days` number; no signing, CLI-publication, architecture, or Linux input.
- Job `build-backend` compiles `goose-cli` once for `aarch64-apple-darwin` and uploads `embedded-cli-macos-arm64` for one day.
- Matrix job `package-desktop` contains only `heybuddy` and `aibuddy`, downloads the same backend, packages with `APP_EDITION`, runs package verification, and uploads `<Edition>-macos-arm64.zip`.

- [ ] Add contract assertions for the exact input set, one backend build, two edition matrix entries, final names, the `aarch64-apple-darwin` target, unsigned summary, one-day backend retention, and caller-provided package retention.

```bash
ruby scripts/test-workflow-contracts.rb --name /macos/
```

Expected: FAIL against the inherited CLI/signing workflow.

- [ ] Rewrite the workflow using the same Cargo/pnpm/sccache policy as CI. Remove the local Apple codesign action and every certificate, keychain, notarization, attestation, standalone CLI, x64, and updater-manifest step.

- [ ] Before packaging, remove unused Cargo intermediates and copy the backend into `ui/desktop/src/bin/goose` using unlink-then-rename semantics.

- [ ] Package and verify both edition identities, ZIP each `.app`, and expose only the edition ZIP artifacts.

- [ ] Run contracts and commit.

```bash
ruby scripts/test-workflow-contracts.rb
git add .github/workflows/bundle-macos.yml
git commit -m "ci: build two unsigned macOS desktop editions"
```

### Task 5: Rebuild Reusable Windows Packaging

**Files:**
- Modify: `.github/workflows/bundle-windows.yml`

**Interfaces:**
- `workflow_call` inputs match macOS: required `ref` and `retention_days` only.
- Job `build-backend` compiles `goose-cli` once for `x86_64-pc-windows-msvc` and uploads `embedded-cli-windows-x64` for one day.
- Matrix job `package-desktop` packages both editions and uploads `<Edition>-windows-x64-setup.exe` plus `<Edition>-windows-x64-portable.zip`.

- [ ] Add contract assertions for one x64 backend build, no ARM/CUDA matrix, two editions, generic Inno script, exact setup/portable names, package verification, and retention.

```bash
ruby scripts/test-workflow-contracts.rb --name /windows/
```

Expected: FAIL against the inherited CLI/CUDA workflow.

- [ ] Rewrite the workflow with `windows-latest`, x64 MSVC only, one backend compilation, and a two-edition package matrix.

- [ ] Atomically place `goose.exe` into `ui/desktop/src/bin`, run `package:windows`, verify the unpacked package, create portable ZIP, and invoke `desktop-setup.iss` with brand-derived `/D` values.

- [ ] Add smoke checks for `goose.exe --version`, packaged `<Edition>.exe` existence, silent setup/install/launch-process/uninstall for each edition. Do not assert Authenticode trust.

- [ ] Run contracts and commit.

```bash
ruby scripts/test-workflow-contracts.rb
git add .github/workflows/bundle-windows.yml
git commit -m "ci: build two unsigned Windows desktop editions"
```

### Task 6: Implement Manual Canary Without a GitHub Release

**Files:**
- Modify: `.github/workflows/canary.yml`

**Interfaces:**
- `workflow_dispatch.inputs.ref` is a required string.
- Calls both reusable bundle workflows with the same ref and `retention_days: 7`.
- A final `Canary Summary` job lists six expected files and states that packages are unsigned.
- Permissions are read-only and there is no release creation, tag mutation, attestation, or install script.

- [ ] Add Canary contract tests and run them red.

```bash
ruby scripts/test-workflow-contracts.rb --name /canary/
```

Expected: FAIL because the inherited Canary creates a Release and unrelated assets.

- [ ] Rewrite Canary to resolve and display the requested ref, call both workflows once, and publish only workflow-run artifacts with seven-day retention.

- [ ] Run contracts and commit.

```bash
ruby scripts/test-workflow-contracts.rb
git add .github/workflows/canary.yml
git commit -m "ci: make canary an artifact-only desktop build"
```

### Task 7: Implement Strict Tag-Only Release

**Files:**
- Create: `scripts/validate-release-artifacts.rb`
- Create: `scripts/test-validate-release-artifacts.rb`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Validator accepts an artifact directory, requires exactly the six approved package names, rejects extra platform/package files, verifies nonempty files, and writes sorted `SHA256SUMS`.
- Release triggers only tag pushes matching `v*`; validation enforces full regex `\Av[0-9]+\.[0-9]+\.[0-9]+\z`.
- `validate` verifies main reachability, Cargo/package version equality, and a successful `CI` workflow run for the tag SHA before bundle jobs start.
- `publish` downloads artifacts from this run, validates them, and uses `gh release create --verify-tag` once.

- [ ] Write fixture tests for the valid six-file set, missing file, extra Linux/CLI file, zero-byte file, wrong edition, and deterministic hashes.

```bash
ruby scripts/test-validate-release-artifacts.rb
```

Expected: FAIL because validator does not exist.

- [ ] Implement the validator with Ruby `Digest::SHA256` and exact basename matching.

- [ ] Add Release workflow contract tests for tag-only trigger, strict validation, main reachability, both version checks, successful CI lookup by head SHA, two reusable builds, no duplicate builds, no attestations, and one publish command.

- [ ] Rewrite `release.yml`. Give only the publish job `contents: write`; validation and builds remain read-only.

- [ ] Run all release tests.

```bash
ruby scripts/test-validate-release-artifacts.rb
ruby scripts/test-workflow-contracts.rb --name /release/
```

Expected: PASS.

- [ ] Commit release validation and workflow.

```bash
git add scripts/validate-release-artifacts.rb scripts/test-validate-release-artifacts.rb .github/workflows/release.yml
git commit -m "ci: publish desktop releases from strict tags"
```

### Task 8: Harden Publish-Existing Recovery

**Files:**
- Modify: `.github/workflows/publish-existing-release.yml`

**Interfaces:**
- Required manual inputs: `release_tag` and numeric `source_run_id`.
- Verifies strict SemVer, tag reachability, source run repository, workflow path/name, source `head_sha == tag SHA`, and allowed job outcome.
- Allows recovery when all validation/build/package jobs succeeded and only the original publish job failed; rejects failed/cancelled build jobs.
- Downloads only that run's artifacts, validates exact files and hashes, refuses to overwrite an existing Release, then publishes the requested tag.

- [ ] Add contract assertions for every source-run and artifact/tag check before editing the workflow.

```bash
ruby scripts/test-workflow-contracts.rb --name /recovery/
```

Expected: FAIL because the existing recovery workflow does not bind artifacts strongly enough.

- [ ] Rewrite recovery using `gh api` for run/job/tag metadata and `actions/download-artifact` with `run-id`, repository, token, and `merge-multiple: true`.

- [ ] Reuse `scripts/validate-release-artifacts.rb`, regenerate `SHA256SUMS`, and publish with `gh release create --verify-tag`.

- [ ] Run contracts and commit.

```bash
ruby scripts/test-workflow-contracts.rb
git add .github/workflows/publish-existing-release.yml
git commit -m "ci: bind release recovery to source artifacts"
```

### Task 9: Consolidate Dependency Security and Optimize MCP Conformance

**Files:**
- Create: `.github/workflows/dependency-security.yml`
- Modify: `.github/workflows/mcp-conformance.yml`
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Dependency Security runs Cargo Deny and cargo-machete on relevant PR/push changes, weekly schedule, and manual dispatch.
- MCP Conformance retains its existing conformance matrix but adopts least permissions, timeouts, concurrency, one-day artifacts, no target cache, and bounded sccache.
- Dependabot directories are `/` for Cargo, `/ui` for pnpm, and `/` for GitHub Actions, each weekly with grouped minor/patch updates.

- [ ] Add contract tests for both workflows and Dependabot ecosystems/schedules.

```bash
ruby scripts/test-workflow-contracts.rb --name '/dependency|mcp|dependabot/'
```

Expected: FAIL until the consolidated workflow and policies exist.

- [ ] Create Dependency Security by preserving the substantive checks from `cargo-deny.yml` and `cargo-machete.yml`, with pinned tool versions and no write token.

- [ ] Update MCP Conformance cache/artifact/action policy without changing its expected-failure baselines or spec matrix.

- [ ] Normalize Dependabot to weekly Cargo, pnpm, and Actions updates; do not enable auto-merge.

- [ ] Run contracts and commit.

```bash
ruby scripts/test-workflow-contracts.rb
git add .github/workflows/dependency-security.yml .github/workflows/mcp-conformance.yml .github/dependabot.yml
git commit -m "ci: consolidate dependency and conformance checks"
```

### Task 10: Harden the Two Retained Goose Repository Agents

**Files:**
- Modify: `.github/workflows/goose-issue-solver.yml`
- Modify: `.github/workflows/goose-pr-reviewer.yml`

**Interfaces:**
- `/goose` issue/PR comment execution remains limited to `OWNER`, `MEMBER`, or `COLLABORATOR` author associations.
- PR reviewer remains read-only for contents and write-only for PR comments/reviews.
- Issue solver may create its dedicated draft PR but receives no unrelated write permissions.
- Both have pinned actions, explicit timeout/concurrency, safe transport of comment/issue data, and no `pull_request_target`.

- [ ] Add agent contract assertions for triggers, collaborator boundary, job permissions, action pins, and absence of untrusted shell interpolation.

```bash
ruby scripts/test-workflow-contracts.rb --name /agent/
```

Expected: report any inherited permission or pin drift.

- [ ] Make only the changes required by those assertions; preserve the recipes and `/goose` behavior.

- [ ] Run contracts and commit.

```bash
ruby scripts/test-workflow-contracts.rb
git add .github/workflows/goose-issue-solver.yml .github/workflows/goose-pr-reviewer.yml
git commit -m "ci: harden retained goose agents"
```

### Task 11: Delete Obsolete Automation and Add Ownership

**Files:**
- Create: `.github/retired-workflows.txt`
- Modify: `.github/CODEOWNERS`
- Delete: every `.github/workflows/*` file not in the ten-file retained inventory
- Delete: `.github/actions/apple-codesign/action.yml`
- Delete: `.github/actions/generate-release-pr-body/action.yaml`
- Delete: `.github/actions/generate-release-pr-body/pr_body_template.txt`
- Delete if unreferenced: `scripts/pre-release.sh`
- Delete if unreferenced: `scripts/set-cargo-version.sh`

**Interfaces:**
- `.github/retired-workflows.txt` contains the deleted workflow filenames, one per line, for the post-merge GitHub registry cleanup in Plan 3.
- CODEOWNERS default owner is `@turingcat` and explicitly covers `.github/**`, `ui/desktop/branding/**`, `ui/desktop/scripts/brand.js`, `ui/desktop/desktop-setup.iss`, and release validation scripts.

- [ ] Extend inventory tests so every extra workflow fails and every retired filename is absent.

```bash
ruby scripts/test-workflow-contracts.rb --name '/inventory|owners/'
```

Expected: FAIL listing all inherited workflows.

- [ ] Record and delete obsolete workflows, including release branches, patch/minor release management, Linux/CUDA, standalone CLI, documentation/services, bots other than the two retained Goose agents, and miscellaneous upstream maintenance workflows.

- [ ] Delete unreferenced local actions and release helpers. Confirm with `rg` before each deletion.

- [ ] Replace the upstream CODEOWNERS team with valid fork ownership.

- [ ] Run inventory and reference checks.

```bash
ruby scripts/test-workflow-contracts.rb
test "$(find .github/workflows -maxdepth 1 -type f | wc -l | tr -d ' ')" = 10
rg -n "apple-codesign|generate-release-pr-body|release-branches|build-cli-linux" .github scripts ui/desktop || true
```

Expected: tests PASS, exactly ten workflows remain, and no live references to deleted automation.

- [ ] Commit deletion and ownership as one reviewable cleanup.

```bash
git add .github/retired-workflows.txt .github/CODEOWNERS .github/workflows .github/actions scripts
git commit -m "ci: remove inherited Goose automation"
```

### Task 12: Full CI/CD Verification and PR Handoff

**Files:**
- Verify only; update files solely for failures introduced by this plan.

- [ ] Run all repository-owned workflow and coverage tests.

```bash
ruby scripts/test-workflow-contracts.rb
ruby scripts/test-diff-coverage.rb
ruby scripts/test-validate-release-artifacts.rb
```

- [ ] Run required local quality checks requested for this implementation.

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cd ui/desktop
pnpm run typecheck
pnpm run lint
pnpm test -- --coverage
```

Expected: PASS. If the full Rust workspace has a pre-existing unrelated failure, capture the exact failing test and still run the directly affected package tests; do not suppress it in CI.

- [ ] Validate file hygiene and action pins.

```bash
git diff --check
find .github/workflows -maxdepth 1 -type f -print | sort
rg -n 'uses: [^./].*@(main|master|v[0-9])' .github/workflows
rg -n 'target/' .github/workflows
git status --short
```

Expected: ten workflows; no mutable action refs; `target/` appears only as ephemeral build/output paths, never an Actions cache path.

- [ ] Push the feature branch and open a PR. Do not apply branch protection yet.

```bash
git push -u origin chore/streamline-desktop-cicd
gh pr create --base main --head chore/streamline-desktop-cicd --title "ci: streamline desktop delivery" --body-file /tmp/heybuddy-cicd-pr.md
```

- [ ] Confirm the PR exposes a successful check named exactly `CI Gate`, review all four build targets through a manual Canary run, and only then merge through the normal PR process.
