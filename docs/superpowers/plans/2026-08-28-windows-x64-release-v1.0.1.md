# Windows x64 Release v1.0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a non-prerelease `v1.0.1` GitHub Release whose source manifests use version `1.0.1` and whose assets include an unsigned Windows x64 Inno Setup installer.

**Architecture:** Keep the existing tag-triggered Release workflow as the publisher. Extend the reusable Windows workflow so both signed and unsigned packaging paths produce the portable ZIP and `HeyBuddy-Setup.exe`, and gate release signing behind a repository variable that defaults to false. Validate on a real Windows runner before creating the immutable release tag.

**Tech Stack:** GitHub Actions, Electron Forge, PowerShell, Inno Setup 6, Cargo, pnpm, GitHub CLI.

## Global Constraints

- Work directly on `main`, as explicitly requested by the user.
- Use `1.0.1` in Cargo and npm manifests; use `v1.0.1` only for the Git tag and GitHub Release.
- Publish a normal Release, not a draft or prerelease.
- The Windows installer is unsigned; an unknown-publisher warning is accepted.
- Preserve the user's uncommitted `Justfile` change and `.pnpm-store/` directory.
- Do not force-move, delete, or recreate `v1.0.1` after publishing it.

---

### Task 1: Align Project Versions

**Files:**
- Modify: `Cargo.toml:11`
- Modify: `Cargo.lock`
- Modify: `ui/desktop/package.json:4`

**Interfaces:**
- Consumes: repository version recipe `just bump-version 1.0.1`
- Produces: workspace and desktop manifests reporting `1.0.1`

- [ ] **Step 1: Run a version contract check and observe the expected failure**

```bash
ruby -rjson -e '
  cargo = File.read("Cargo.toml")[/^version = "([^"]+)"$/, 1]
  desktop = JSON.parse(File.read("ui/desktop/package.json"))["version"]
  abort "expected Cargo 1.0.1, got #{cargo}" unless cargo == "1.0.1"
  abort "expected desktop 1.0.1, got #{desktop}" unless desktop == "1.0.1"
'
```

Expected: FAIL because both versions are currently `1.45.2`.

- [ ] **Step 2: Apply the repository's version update recipe**

```bash
just bump-version 1.0.1
```

Expected: `Cargo.toml`, workspace entries in `Cargo.lock`, and `ui/desktop/package.json` change to `1.0.1`.

- [ ] **Step 3: Re-run the version contract and inspect lockfile scope**

```bash
ruby -rjson -e '
  cargo = File.read("Cargo.toml")[/^version = "([^"]+)"$/, 1]
  desktop = JSON.parse(File.read("ui/desktop/package.json"))["version"]
  abort "expected Cargo 1.0.1, got #{cargo}" unless cargo == "1.0.1"
  abort "expected desktop 1.0.1, got #{desktop}" unless desktop == "1.0.1"
'
git diff --stat -- Cargo.toml Cargo.lock ui/desktop/package.json
```

Expected: PASS and no unrelated manifest files changed.

- [ ] **Step 4: Commit only version files**

```bash
git add Cargo.toml Cargo.lock ui/desktop/package.json
git commit -m "chore(release): set version 1.0.1"
```

### Task 2: Build the Inno Setup Installer in Windows CI

**Files:**
- Modify: `.github/workflows/bundle-windows.yml:292-376`
- Read: `ui/desktop/heybuddy-setup.iss`

**Interfaces:**
- Consumes: `internal-windows-unsigned*` artifact containing the flat Electron distribution; optional workflow input `version`
- Produces: `Goose-win32-x64*` artifact containing `HeyBuddy-win32-x64*.zip` and `HeyBuddy-Setup.exe`

- [ ] **Step 1: Run a workflow contract check and observe the expected failure**

```bash
ruby -e '
  workflow = File.read(".github/workflows/bundle-windows.yml")
  abort "missing Inno compiler invocation" unless workflow.include?("ISCC.exe")
  abort "missing installer output" unless workflow.include?("HeyBuddy-Setup.exe")
  abort "missing installer script" unless workflow.include?("heybuddy-setup.iss")
'
```

Expected: FAIL with `missing Inno compiler invocation`.

- [ ] **Step 2: Add source checkout and normalize distribution paths in both packaging jobs**

Add the pinned checkout action as the first step of both `sign-desktop-windows` and `package-desktop-windows`:

```yaml
- name: Checkout repository
  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  with:
    ref: ${{ inputs.ref != '' && inputs.ref || '' }}
```

Download each distribution to `ui/desktop/dist-windows`, and update signing, signature verification, and ZIP paths to use that directory.

- [ ] **Step 3: Add a fail-fast Inno Setup installation step to both packaging jobs**

```yaml
- name: Set up Inno Setup
  shell: pwsh
  run: |
    $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    if (-not (Test-Path $iscc)) {
      choco install innosetup --no-progress -y
    }
    if (-not (Test-Path $iscc)) {
      throw "Inno Setup compiler not found: $iscc"
    }
    "ISCC_PATH=$iscc" | Out-File -FilePath $env:GITHUB_ENV -Append
```

- [ ] **Step 4: Compile and verify `HeyBuddy-Setup.exe` in both packaging jobs**

```yaml
- name: Create Windows installer
  shell: pwsh
  env:
    INPUT_VERSION: ${{ inputs.version }}
  run: |
    $version = $env:INPUT_VERSION
    if (-not $version) {
      $package = Get-Content "ui/desktop/package.json" -Raw | ConvertFrom-Json
      $version = $package.version
    }
    $outputDir = Join-Path $env:GITHUB_WORKSPACE "installer-output"
    New-Item -ItemType Directory -Force $outputDir | Out-Null
    & $env:ISCC_PATH "/DMyAppVersion=$version" "/O$outputDir" "ui/desktop/heybuddy-setup.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed" }
    $installer = Join-Path $outputDir "HeyBuddy-Setup.exe"
    if (-not (Test-Path $installer)) { throw "Installer not found: $installer" }
    Get-Item $installer
```

For the signed path, add a second Azure Trusted Signing step after compilation for `installer-output/HeyBuddy-Setup.exe`; it remains skipped in this unsigned release.

- [ ] **Step 5: Upload the ZIP and installer together**

Use a multiline artifact path in both final upload steps:

```yaml
path: |
  HeyBuddy-win32-x64${{ inputs.windows_variant == 'cuda' && '-cuda' || '' }}.zip
  installer-output/HeyBuddy-Setup.exe
```

- [ ] **Step 6: Re-run the workflow contract check**

```bash
ruby -e '
  workflow = File.read(".github/workflows/bundle-windows.yml")
  abort "missing Inno compiler invocation" unless workflow.include?("ISCC.exe")
  abort "missing installer output" unless workflow.scan("HeyBuddy-Setup.exe").length >= 4
  abort "missing installer script" unless workflow.include?("heybuddy-setup.iss")
  abort "missing x64 ZIP" unless workflow.include?("HeyBuddy-win32-x64")
'
```

Expected: PASS.

- [ ] **Step 7: Commit the Windows workflow**

```bash
git add .github/workflows/bundle-windows.yml
git commit -m "ci: build Windows Inno installer"
```

### Task 3: Make Tag Releases Work Without Signing Secrets

**Files:**
- Modify: `.github/workflows/release.yml:42-65`
- Modify: `.github/workflows/release.yml:106-146`

**Interfaces:**
- Consumes: optional Actions variable `ENABLE_RELEASE_SIGNING`; Windows artifacts from Task 2
- Produces: unsigned-by-default tag builds and Release uploads containing `HeyBuddy*.exe`

- [ ] **Step 1: Run a Release workflow contract check and observe the expected failure**

```bash
ruby -e '
  workflow = File.read(".github/workflows/release.yml")
  abort "missing signing variable" unless workflow.include?("ENABLE_RELEASE_SIGNING")
  abort "missing EXE release pattern" unless workflow.include?("HeyBuddy*.exe")
'
```

Expected: FAIL with `missing signing variable`.

- [ ] **Step 2: Gate reusable workflow signing inputs behind the repository variable**

For both macOS and Windows reusable jobs, set:

```yaml
signing: ${{ startsWith(github.ref, 'refs/tags/') && vars.ENABLE_RELEASE_SIGNING == 'true' }}
environment: ${{ startsWith(github.ref, 'refs/tags/') && vars.ENABLE_RELEASE_SIGNING == 'true' && 'signing' || '' }}
```

Undefined variables evaluate to an empty string, so signing defaults to false.

- [ ] **Step 3: Include installer EXEs in provenance and both Release uploads**

Add the following pattern beside `HeyBuddy*.zip` in all three artifact lists:

```yaml
HeyBuddy*.exe
```

- [ ] **Step 4: Re-run the Release workflow contract check**

```bash
ruby -e '
  workflow = File.read(".github/workflows/release.yml")
  abort "missing signing variable" unless workflow.scan("ENABLE_RELEASE_SIGNING").length >= 4
  abort "missing EXE artifact patterns" unless workflow.scan("HeyBuddy\*.exe").length == 3
  abort "tag trigger missing" unless workflow.include?(%q(- "v1.*"))
'
```

Expected: PASS.

- [ ] **Step 5: Commit the Release workflow**

```bash
git add .github/workflows/release.yml
git commit -m "ci: support unsigned fork releases"
```

### Task 4: Validate and Push `main`

**Files:**
- Verify: `.github/workflows/bundle-windows.yml`
- Verify: `.github/workflows/release.yml`
- Verify: `Cargo.toml`
- Verify: `Cargo.lock`
- Verify: `ui/desktop/package.json`

**Interfaces:**
- Consumes: Tasks 1-3 commits
- Produces: verified remote `main` at version `1.0.1`

- [ ] **Step 1: Parse workflow YAML and run repository checks**

```bash
ruby -e 'require "yaml"; YAML.parse_file(".github/workflows/bundle-windows.yml"); YAML.parse_file(".github/workflows/release.yml")'
git diff --check
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
bin/pnpm --dir ui/desktop run typecheck
bin/pnpm --dir ui/desktop test
```

Expected: all commands exit 0; desktop test summary reports zero failures.

- [ ] **Step 2: Confirm only the user's pre-existing files remain uncommitted**

```bash
git status --short
```

Expected:

```text
 M Justfile
?? .pnpm-store/
```

- [ ] **Step 3: Fetch and verify remote divergence**

```bash
git fetch origin
git rev-list --left-right --count main...origin/main
```

Expected: remote has no commits absent locally. If it does, integrate normally and re-run Step 1; do not force-push.

- [ ] **Step 4: Push `main`**

```bash
git push origin main
```

### Task 5: Run a Remote Windows x64 Preflight

**Files:**
- Remote workflow: `.github/workflows/bundle-windows.yml`
- Artifacts: `HeyBuddy-win32-x64.zip`, `HeyBuddy-Setup.exe`

**Interfaces:**
- Consumes: pushed `main` and workflow inputs for an unsigned standard desktop build
- Produces: verified Windows x64 installer artifact before the formal tag exists

- [ ] **Step 1: Dispatch the Windows workflow**

```bash
preflight_started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
gh workflow run bundle-windows.yml \
  --repo turingcat/HeyBuddy \
  --ref main \
  -f version=1.0.1 \
  -f signing=false \
  -f package_cli=false \
  -f package_desktop=true \
  -f windows_variant=standard
```

- [ ] **Step 2: Capture and watch the workflow run**

```bash
for attempt in {1..12}; do
  preflight_run_id=$(gh run list \
    --repo turingcat/HeyBuddy \
    --workflow bundle-windows.yml \
    --event workflow_dispatch \
    --branch main \
    --limit 20 \
    --json databaseId,createdAt \
    --jq ".[] | select(.createdAt >= \"$preflight_started_at\") | .databaseId" | head -n 1)
  [ -n "$preflight_run_id" ] && break
  sleep 5
done
test -n "$preflight_run_id"
gh run watch "$preflight_run_id" --repo turingcat/HeyBuddy --exit-status
```

Expected: Build Goose, Build Desktop, and Package Desktop jobs succeed.

- [ ] **Step 3: Download and inspect the artifact**

```bash
release_artifact_dir=$(mktemp -d /tmp/heybuddy-v1.0.1-preflight.XXXXXX)
gh run download "$preflight_run_id" --repo turingcat/HeyBuddy --name Goose-win32-x64 --dir "$release_artifact_dir"
find "$release_artifact_dir" -maxdepth 2 -type f -print
file "$release_artifact_dir/HeyBuddy-Setup.exe"
unzip -l "$release_artifact_dir/HeyBuddy-win32-x64.zip" | rg 'HeyBuddy.exe|resources/bin/goose.exe'
```

Expected: installer is a PE32+ Windows executable and the ZIP contains both desktop and Goose executables.

### Task 6: Publish and Verify the Formal Release

**Files:**
- Git tag: `v1.0.1`
- GitHub Release assets: `HeyBuddy-Setup.exe`, `HeyBuddy-win32-x64.zip`

**Interfaces:**
- Consumes: successful Task 5 run and synchronized `main`
- Produces: public non-prerelease GitHub Release `v1.0.1`

- [ ] **Step 1: Reconfirm the tag and Release do not exist**

```bash
git ls-remote --tags origin refs/tags/v1.0.1
gh release view v1.0.1 --repo turingcat/HeyBuddy
```

Expected: neither command finds `v1.0.1`.

- [ ] **Step 2: Create and push the annotated tag**

```bash
release_started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
git tag -a v1.0.1 -m "HeyBuddy v1.0.1"
git push origin v1.0.1
```

- [ ] **Step 3: Watch the tag-triggered Release workflow**

```bash
for attempt in {1..12}; do
  release_run_id=$(gh run list \
    --repo turingcat/HeyBuddy \
    --workflow release.yml \
    --branch v1.0.1 \
    --limit 20 \
    --json databaseId,createdAt \
    --jq ".[] | select(.createdAt >= \"$release_started_at\") | .databaseId" | head -n 1)
  [ -n "$release_run_id" ] && break
  sleep 5
done
test -n "$release_run_id"
gh run watch "$release_run_id" --repo turingcat/HeyBuddy --exit-status
```

Expected: all bundle and Release jobs succeed.

- [ ] **Step 4: Verify Release state and assets**

```bash
gh release view v1.0.1 --repo turingcat/HeyBuddy \
  --json tagName,name,isDraft,isPrerelease,url,assets,publishedAt
```

Expected: tag `v1.0.1`, `isDraft=false`, `isPrerelease=false`, and assets include `HeyBuddy-Setup.exe` and `HeyBuddy-win32-x64.zip`.

- [ ] **Step 5: Verify local and remote refs still agree**

```bash
git fetch origin
git rev-parse main
git rev-parse origin/main
git rev-list --left-right --count main...origin/main
```

Expected: both refs match and divergence is `0 0`.
