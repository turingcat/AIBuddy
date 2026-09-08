# Actions Concurrency and Windows Standard-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cancel superseded Actions runs per source and remove the unused Windows CUDA bundle variant.

**Architecture:** Top-level workflow concurrency keys identify the source being built, with literal bundle prefixes keeping platforms independent. The Windows reusable workflow becomes a single standard x64 path while release and canary continue calling the same workflow interface without a variant input.

**Tech Stack:** GitHub Actions YAML, Ruby Minitest workflow contracts, Python unittest architecture contracts, Rust and pnpm verification commands.

## Global Constraints

- CI cancellation is scoped to one pull request number or Git ref.
- Bundle cancellation is scoped to one platform and requested checkout ref, falling back to the triggering Git ref.
- All three optimized workflows use `cancel-in-progress: true`.
- Windows bundle supports only standard `x86_64-pc-windows-msvc`; no CUDA workflow input, setup, feature, or artifact suffix remains.
- Rust crate CUDA features remain unchanged.
- Release and canary keep producing the standard Windows x64 artifact.
- Do not merge into `main` until the full CI, macOS bundle, Windows bundle, and required local checks pass.

---

### Task 1: Lock the New Workflow Contracts

**Files:**

- Modify: `scripts/test-ci-performance-contracts.rb:8-17`
- Modify: `scripts/test-ci-performance-contracts.rb:85-105`
- Modify: `scripts/test-ci-performance-contracts.rb:678-742`

**Interfaces:**

- Consumes: parsed workflow hashes returned by `load_workflow(workflow_name)` and raw YAML returned by `workflow_text(workflow_name)`.
- Produces: regression contracts for concurrency groups and a standard-only Windows workflow.

- [ ] **Step 1: Replace the old CI concurrency expectation and add bundle group constants**

```ruby
CI_CONCURRENCY_GROUP = "ci-${{ github.event.pull_request.number || github.ref }}"
BUNDLE_CONCURRENCY_GROUPS = {
  "bundle-macos.yml" => "bundle-macos-${{ inputs.ref || github.ref }}",
  "bundle-windows.yml" => "bundle-windows-${{ inputs.ref || github.ref }}",
}.freeze
```

- [ ] **Step 2: Add failing cancellation and Windows standard-only tests**

```ruby
def test_ci_cancels_superseded_runs_for_the_same_source
  workflow = load_workflow("ci.yml")

  assert_equal CI_CONCURRENCY_GROUP, workflow.dig("concurrency", "group")
  assert_equal true, workflow.dig("concurrency", "cancel-in-progress")
end

def test_bundle_workflows_cancel_only_the_same_platform_and_source
  BUNDLE_CONCURRENCY_GROUPS.each do |workflow_name, expected_group|
    workflow = load_workflow(workflow_name)

    assert_equal expected_group, workflow.dig("concurrency", "group")
    assert_equal true, workflow.dig("concurrency", "cancel-in-progress")
  end
end

def test_windows_bundle_is_standard_only
  workflow = load_workflow("bundle-windows.yml")
  text = workflow_text("bundle-windows.yml")

  workflow.fetch("jobs").each_value do |job|
    assert_equal "windows-latest", job.fetch("runs-on")
  end
  refute_match(/windows_variant/i, text)
  refute_match(/cuda/i, text)
  assert_includes text, "cargo build --release --target x86_64-pc-windows-msvc"
end
```

- [ ] **Step 3: Remove CUDA cache-context expectations and helpers**

Delete the `assert_cache_context(entries, :cuda, /inputs\.windows_variant/)` assertion, remove `inputs\.windows_variant` from incompatible standard-cache contexts, and remove the unused `:cuda` branch and `cuda_job?` helper. Target-specific Windows cache isolation remains covered by `x86_64-pc-windows-msvc`.

- [ ] **Step 4: Run the contract test and verify it fails for the intended missing behavior**

Run:

```bash
ruby -e 'module Enumerable; def filter_map; return enum_for(__method__) unless block_given?; each_with_object([]) { |value, results| (mapped = yield(value)) && results << mapped }; end; end; load ARGV.shift' scripts/test-ci-performance-contracts.rb
```

Expected: failures report the old CI group/cancellation expression, missing bundle concurrency, and remaining Windows CUDA paths. Existing unrelated assertions must not error.

- [ ] **Step 5: Commit the failing contracts**

```bash
git add scripts/test-ci-performance-contracts.rb
git commit -m "test(ci): require superseded run cancellation"
```

### Task 2: Add Source-Scoped Cancellation

**Files:**

- Modify: `.github/workflows/ci.yml:15-17`
- Modify: `.github/workflows/bundle-macos.yml:52-56`

**Interfaces:**

- Consumes: `github.event.pull_request.number`, `github.ref`, and reusable-workflow `inputs.ref` contexts.
- Produces: CI group `ci-<source>` and macOS group `bundle-macos-<source>`, each replacing an older in-progress run in the same group.

- [ ] **Step 1: Make CI cancellation unconditional for the same PR or ref**

```yaml
concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

- [ ] **Step 2: Add a literal macOS bundle group after the workflow inputs**

```yaml
concurrency:
  group: bundle-macos-${{ inputs.ref || github.ref }}
  cancel-in-progress: true
```

- [ ] **Step 3: Run the contract test and confirm only Windows-related assertions still fail**

Run the Task 1 Ruby command.

Expected: CI and macOS concurrency assertions pass; Windows concurrency and CUDA-removal assertions fail.

- [ ] **Step 4: Commit source-scoped CI and macOS cancellation**

```bash
git add .github/workflows/ci.yml .github/workflows/bundle-macos.yml
git commit -m "fix(ci): cancel superseded workflow runs"
```

### Task 3: Make Windows Bundle Standard-Only

**Files:**

- Modify: `.github/workflows/bundle-windows.yml:4-365`
- Verify: `.github/workflows/release.yml:54-58`
- Verify: `.github/workflows/canary.yml:69-75`

**Interfaces:**

- Consumes: existing `version`, `package_cli`, `package_desktop`, and `ref` inputs.
- Produces: standard Windows x64 binary, CLI archive, unsigned desktop distribution, setup executable, and portable archive under their existing non-CUDA names.

- [ ] **Step 1: Remove the Windows variant inputs and add concurrency**

Remove `windows_variant` from both `workflow_dispatch.inputs` and `workflow_call.inputs`, then add:

```yaml
concurrency:
  group: bundle-windows-${{ inputs.ref || github.ref }}
  cancel-in-progress: true
```

- [ ] **Step 2: Collapse binary compilation to the standard path**

Use `windows-latest` for `build-goose-windows`, delete CUDA toolkit/MSVC/CUDA verification steps, and replace the conditional PowerShell build with:

```yaml
- name: Build Windows executable
  shell: pwsh
  run: |
    cargo build --release --target x86_64-pc-windows-msvc -p goose-cli --bin goose

    $binaryPath = "./target/x86_64-pc-windows-msvc/release/goose.exe"
    if (-not (Test-Path $binaryPath)) {
      Write-Error "Windows binary not found: $binaryPath"
      Get-ChildItem ./target/x86_64-pc-windows-msvc/release/ -ErrorAction SilentlyContinue
      exit 1
    }
    Get-Item $binaryPath
```

Set the Rust cache key to `bundle-windows-x86_64-pc-windows-msvc`.

- [ ] **Step 3: Normalize standard artifact names and runners**

Use `windows-latest` for every job and replace variant expressions with these fixed names:

```text
internal-goose-x86_64-pc-windows-msvc
goose-x86_64-pc-windows-msvc.zip
internal-windows-unsigned
Goose-win32-x64
```

Remove `VARIANT_SUFFIX`; create the portable archive using the filename returned by `resolveWindowsPackage(...)` without appending a suffix.

- [ ] **Step 4: Run the performance and architecture contracts**

Run:

```bash
ruby -e 'module Enumerable; def filter_map; return enum_for(__method__) unless block_given?; each_with_object([]) { |value, results| (mapped = yield(value)) && results << mapped }; end; end; load ARGV.shift' scripts/test-ci-performance-contracts.rb
python3 scripts/test-supported-build-architectures.py
ruby scripts/test-release-workflows.rb
```

Expected: all tests pass; performance contracts report 0 failures and 0 errors; architecture and release contracts report success.

- [ ] **Step 5: Parse the modified workflow YAML**

Run:

```bash
ruby -e 'require "yaml"; %w[ci.yml bundle-macos.yml bundle-windows.yml].each { |name| YAML.safe_load(File.read(File.join(".github/workflows", name)), aliases: true) }'
```

Expected: exit code 0 with no parser exception.

- [ ] **Step 6: Commit the standard-only Windows workflow**

```bash
git add .github/workflows/bundle-windows.yml
git commit -m "fix(ci): keep Windows bundles standard-only"
```

### Task 4: Verify the Completed Branch

**Files:**

- Verify: `.github/workflows/ci.yml`
- Verify: `.github/workflows/bundle-macos.yml`
- Verify: `.github/workflows/bundle-windows.yml`
- Verify: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**

- Consumes: the completed workflow and contract commits.
- Produces: a locally and remotely verified feature branch ready for whole-branch review and the finishing workflow.

- [ ] **Step 1: Run formatting and diff checks**

```bash
source bin/activate-hermit
cargo fmt --all -- --check
git diff --check
```

Expected: both commands exit 0.

- [ ] **Step 2: Run required local quality checks**

```bash
source bin/activate-hermit
cargo clippy --all-targets -- -D warnings
cd ui/desktop
pnpm run lint:check
pnpm test -- --run
```

Expected: clippy exits 0; desktop lint passes; all desktop tests pass.

- [ ] **Step 3: Push the feature branch and dispatch final workflows**

```bash
git push origin chore/optimize-github-actions
gh workflow run ci.yml --repo turingcat/HeyBuddy --ref chore/optimize-github-actions
gh workflow run bundle-macos.yml --repo turingcat/HeyBuddy --ref chore/optimize-github-actions -f signing=false -f package_cli=false -f package_desktop=false
gh workflow run bundle-windows.yml --repo turingcat/HeyBuddy --ref chore/optimize-github-actions -f package_cli=false -f package_desktop=false
```

Expected: GitHub returns one run URL for each workflow. Starting a second matching run cancels the older run for the same ref.

- [ ] **Step 4: Wait for final remote verification**

Use `gh run watch <run-id> --repo turingcat/HeyBuddy --exit-status` for CI, macOS, and Windows.

Expected: each newest run completes successfully; superseded runs conclude `cancelled`.

After this task's review and the required whole-branch review pass, use the `finishing-a-development-branch` workflow to merge from a clean `main` worktree, re-run contracts and clippy on the merged result, push `HEAD:main`, and verify the remote SHA. Report the final SHA and Actions timing comparison.
