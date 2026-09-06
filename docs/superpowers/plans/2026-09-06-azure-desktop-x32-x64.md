# Azure Desktop x32/x64 Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure and manually trigger an Azure Pipeline that serially builds AIBuddy Windows x32 and x64 Desktop installers, each containing its matching CLI.

**Architecture:** Replace the CLI-only Azure pipeline with one self-contained matrix job. Its x32 and x64 legs share the same build steps, run with `maxParallel: 1`, and publish only architecture-specific Inno Setup installers as Azure Pipeline artifacts.

**Tech Stack:** Azure Pipelines YAML, Windows Server 2022 hosted agents, Rust/MSVC, Node.js 24.10.0, pnpm 10.30.3, Electron Forge, Inno Setup 6, Ruby YAML contract tests, Python unittest architecture tests.

## Global Constraints

- Keep `trigger: none` and `pr: none`; the Azure pipeline is manual-only.
- Set matrix `maxParallel: 1`; never consume more than one Azure hosted-agent slot.
- Build `x32` as Electron `ia32` with Rust target `i686-pc-windows-msvc`.
- Build `x64` as Electron `x64` with Rust target `x86_64-pc-windows-msvc`.
- Bundle the matching `goose.exe` and Windows runtime helpers into each Desktop package.
- Publish exactly `AIBuddy-windows-x32-setup.exe` and `AIBuddy-windows-x64-setup.exe` in separate Azure artifacts.
- Do not publish standalone CLI-only artifacts or portable ZIP files.
- Do not modify, enable, or dispatch any GitHub Actions workflow.

---

### Task 1: Add Azure Pipeline Contract Tests

**Files:**
- Modify: `scripts/test-release-workflows.rb`
- Modify: `scripts/test-supported-build-architectures.py`

**Interfaces:**
- Consumes: `azure-pipelines.yml` as parsed YAML and raw text.
- Produces: contracts for manual triggering, serial matrix execution, architecture mappings, Desktop packaging, installer publication, and absence of CLI-only/portable artifacts.

- [ ] **Step 1: Add failing release-workflow assertions**

Replace the current Azure assertion in `scripts/test-release-workflows.rb` with:

```ruby
azure_path = "azure-pipelines.yml"
azure = YAML.load_file(azure_path)
azure_text = File.read(azure_path)

abort "Azure pipeline must remain manual-only" unless azure["trigger"] == "none" && azure["pr"] == "none"
abort "Azure matrix must be serial" unless azure.dig("strategy", "maxParallel") == 1

[
  "i686-pc-windows-msvc",
  "x86_64-pc-windows-msvc",
  "ELECTRON_ARCH: ia32",
  "ELECTRON_ARCH: x64",
  "AIBuddy-windows-$(ARTIFACT_ARCH)-setup",
].each do |fragment|
  abort "Azure pipeline missing #{fragment}" unless azure_text.include?(fragment)
end

abort "Azure pipeline must not create portable ZIPs" if azure_text.include?("portableFileName") || azure_text.match?(/7z\s+a\s+-tzip/)
abort "Azure pipeline must not dispatch GitHub Actions" if azure_text.include?("gh workflow run") || azure_text.include?("workflow_dispatch")
```

- [ ] **Step 2: Add a failing Azure architecture test**

Add to `SupportedBuildArchitecturesTest`:

```python
def test_azure_builds_x32_and_x64_desktop_serially(self) -> None:
    pipeline = (ROOT / "azure-pipelines.yml").read_text(encoding="utf-8-sig")
    self.assertIn("i686-pc-windows-msvc", pipeline)
    self.assertIn("x86_64-pc-windows-msvc", pipeline)
    self.assertIn("ELECTRON_ARCH: ia32", pipeline)
    self.assertIn("ELECTRON_ARCH: x64", pipeline)
    self.assertIn("maxParallel: 1", pipeline)
    self.assertIn("pnpm run package:windows", pipeline)
    self.assertIn("desktop-setup.iss", pipeline)
    self.assertIn("PublishPipelineArtifact@1", pipeline)
    self.assertNotIn("portableFileName", pipeline)
    self.assertNotIn("gh workflow run", pipeline)
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
ruby scripts/test-release-workflows.rb
python3 scripts/test-supported-build-architectures.py
```

Expected: both commands fail because the current Azure pipeline only builds an x64 debug CLI.

- [ ] **Step 4: Commit the failing contracts**

```bash
git add scripts/test-release-workflows.rb scripts/test-supported-build-architectures.py
git commit -m "test: define Azure desktop build contracts"
```

### Task 2: Implement the Serial Azure Desktop Matrix

**Files:**
- Modify: `azure-pipelines.yml`

**Interfaces:**
- Consumes: `ui/desktop/scripts/windows-architecture.js`, `windows-package.js`, `prepare-platform-binaries.js`, and `desktop-setup.iss`.
- Produces: Azure artifacts `AIBuddy-windows-x32-setup` and `AIBuddy-windows-x64-setup`, each containing the corresponding `.exe` installer.

- [ ] **Step 1: Define the serial matrix**

Use this top-level structure:

```yaml
trigger: none
pr: none

pool:
  vmImage: windows-2022

strategy:
  matrix:
    x32:
      ARTIFACT_ARCH: x32
      ELECTRON_ARCH: ia32
      RUST_TARGET: i686-pc-windows-msvc
      CARGO_FEATURES: aws-providers,nostr,otel,rustls-tls,system-keyring
    x64:
      ARTIFACT_ARCH: x64
      ELECTRON_ARCH: x64
      RUST_TARGET: x86_64-pc-windows-msvc
      CARGO_FEATURES: code-mode,aws-providers,nostr,otel,rustls-tls,system-keyring,update
  maxParallel: 1
```

- [ ] **Step 2: Add toolchain setup and caches**

Add checkout, `rustup target add $(RUST_TARGET)`, Cargo cache, NodeTool 24.10.0, pnpm 10.30.3 installation, a workspace-local pnpm store, pnpm cache, and Electron download cache. Keep every cache key architecture-aware where its contents differ by architecture.

- [ ] **Step 3: Build and inject the matching CLI**

Use PowerShell matrix variables:

```powershell
$env:CARGO_INCREMENTAL = "0"
cargo build --locked --release --target $env:RUST_TARGET -p goose-cli --bin goose --no-default-features --features $env:CARGO_FEATURES
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$binary = "target\$env:RUST_TARGET\release\goose.exe"
if (-not (Test-Path $binary)) { throw "Windows binary not found: $binary" }
New-Item -ItemType Directory -Force "ui\desktop\src\bin" | Out-Null
Copy-Item $binary "ui\desktop\src\bin\goose.exe" -Force
```

Copy authored Windows `.exe`, `.dll`, `.cmd`, and `goose-npm` helpers without overwriting the newly built `goose.exe`.

- [ ] **Step 4: Build the matching Electron package**

Run inside `ui/desktop`:

```powershell
pnpm install --frozen-lockfile
node scripts\build-main.js
$env:ELECTRON_PLATFORM = "win32"
node scripts\prepare-platform-binaries.js
pnpm run package:windows -- --arch=$env:ELECTRON_ARCH
```

Check `$LASTEXITCODE` after every command. Resolve the packaged directory with `resolveWindowsPackage`, copy `src/bin` into `resources/bin`, and flatten it into `ui/desktop/dist-windows-$(ARTIFACT_ARCH)`.

- [ ] **Step 5: Create and stage only the installer**

Install Inno Setup with Chocolatey only when `ISCC.exe` is absent. Resolve the arguments through `windows-package.js`, compile `desktop-setup.iss`, and validate the expected installer is nonempty:

```powershell
$package = Get-Content "ui\desktop\package.json" -Raw | ConvertFrom-Json
$distDir = Join-Path $env:BUILD_SOURCESDIRECTORY "ui\desktop\dist-windows-$env:ARTIFACT_ARCH"
$outputDir = Join-Path $env:BUILD_ARTIFACTSTAGINGDIRECTORY "AIBuddy-windows-$env:ARTIFACT_ARCH-setup"
New-Item -ItemType Directory -Force $outputDir | Out-Null
$pkg = & node "ui/desktop/scripts/windows-package.js" $env:ARTIFACT_ARCH $package.version $distDir $outputDir | ConvertFrom-Json
& $iscc @($pkg.isccArgs) "ui/desktop/desktop-setup.iss"
$installer = Join-Path $outputDir $pkg.setupFileName
if (-not (Test-Path $installer) -or (Get-Item $installer).Length -eq 0) { throw "Installer missing or empty: $installer" }
```

Publish with `PublishPipelineArtifact@1`, using both target path and artifact name `AIBuddy-windows-$(ARTIFACT_ARCH)-setup`.

- [ ] **Step 6: Run contract tests and verify GREEN**

Run:

```bash
ruby scripts/test-release-workflows.rb
python3 scripts/test-supported-build-architectures.py
git diff --check
```

Expected: all commands pass.

- [ ] **Step 7: Commit the pipeline**

Confirm `git diff --name-only main...HEAD` contains no `.github/workflows/*` path, then commit:

```bash
git add azure-pipelines.yml
git commit -m "ci: build Azure Windows desktop x32 x64"
```

### Task 3: Push and Run Only Azure Pipelines

**Files:**
- No source files modified.

**Interfaces:**
- Consumes: branch `feature/azure-desktop-x32-x64`, its pushed commit SHA, and the existing Azure Pipeline connected to `/azure-pipelines.yml`.
- Produces: one Azure run using the feature branch and two successful installer artifacts.

- [ ] **Step 1: Verify branch scope**

Run:

```bash
git status --short --branch
git log -4 --oneline --decorate
git diff main...HEAD --name-only
```

Expected: only the design, plan, Azure YAML, and two contract-test files differ from `main`.

- [ ] **Step 2: Confirm GitHub Actions remains disabled**

Use the repository setting or API before pushing. Do not enable or dispatch a workflow. If the setting cannot be verified, stop before push and request repository authentication.

- [ ] **Step 3: Push the feature branch**

Run `git push -u origin feature/azure-desktop-x32-x64`. Confirm no GitHub Actions run starts.

- [ ] **Step 4: Select the existing Azure Pipeline**

Confirm it reads `/azure-pipelines.yml` and queue branch `refs/heads/feature/azure-desktop-x32-x64`. Do not create a duplicate pipeline if the imported pipeline already exists.

- [ ] **Step 5: Queue and monitor one manual run**

Use Azure DevOps UI, CLI, or REST API. Verify the run creates x32 and x64 matrix legs and never has more than one running agent job.

- [ ] **Step 6: Verify final artifacts**

Confirm the successful run contains these nonempty files:

```text
AIBuddy-windows-x32-setup/AIBuddy-windows-x32-setup.exe
AIBuddy-windows-x64-setup/AIBuddy-windows-x64-setup.exe
```

If the run fails, inspect the failing Azure log, change only the responsible Azure/build path, rerun local contracts, push the corrective commit, and queue a new Azure-only run.
