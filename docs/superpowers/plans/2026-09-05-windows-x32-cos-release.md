# Windows x32 and COS Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build x32 and x64 Windows installers for tagged releases and overwrite exactly two stable installer objects in the private Tencent COS bucket.

**Architecture:** Introduce one architecture resolver shared by Windows packaging and runtime preparation, then expand the reusable Windows workflow into an x32/x64 matrix while leaving the Windows CLI artifact x64-only. A small, independently testable shell uploader will install a checksum-pinned Tencent COSCLI and upload the two final installers after GitHub Release publication succeeds.

**Tech Stack:** GitHub Actions YAML, Node.js/CommonJS, Vitest, Python `unittest`, PowerShell, Inno Setup, Rust MSVC targets, Electron Forge, Bash, Tencent COSCLI v1.0.9.

## Global Constraints

- Publish only `HeyBuddy-windows-x32-setup.exe` and `HeyBuddy-windows-x64-setup.exe` for Windows desktop.
- Do not build or publish Windows portable ZIP archives.
- Overwrite only `heybuddy/stable/HeyBuddy-windows-x32-setup.exe` and `heybuddy/stable/HeyBuddy-windows-x64-setup.exe` in COS.
- Use bucket `heybuddy-1252724067` in region `ap-guangzhou`.
- Read COS credentials from `TENCENT_CLOUD_SECRET_ID` and `TENCENT_CLOUD_SECRET_KEY` GitHub Actions secrets.
- Do not modify COS bucket policy, bucket ACLs, object ACLs, or anonymous access.
- Keep the Windows CLI artifact x64-only.
- Keep macOS and other release artifacts unchanged.
- Use Electron `ia32` with Rust `i686-pc-windows-msvc` for public architecture `x32`.
- Use Electron `x64` with Rust `x86_64-pc-windows-msvc` for public architecture `x64`.

---

### Task 1: Define Windows Architecture and Installer Metadata

**Files:**
- Create: `ui/desktop/scripts/windows-architecture.js`
- Create: `ui/desktop/scripts/windows-architecture.test.js`
- Modify: `ui/desktop/scripts/windows-package.js`
- Modify: `ui/desktop/scripts/windows-package.test.js`
- Modify: `ui/desktop/desktop-setup.iss`

**Interfaces:**
- Produces: `resolveWindowsArchitecture(name)` returning `{ name, electronArch, rustTarget, nodeArch, uvTarget }`.
- Produces: `resolveWindowsPackage(edition, version, sourceDir, outputDir, architecture)` with architecture-aware `packagedDirName`, `setupFileName`, and `isccArgs`.
- Consumes: `WINDOWS_ARCH` only as the default when callers omit the architecture argument.

- [ ] **Step 1: Write failing architecture tests**

Add tests that require these exact mappings and reject unsupported values:

```js
expect(resolveWindowsArchitecture('x32')).toEqual({
  name: 'x32',
  electronArch: 'ia32',
  rustTarget: 'i686-pc-windows-msvc',
  nodeArch: 'x86',
  uvTarget: 'i686-pc-windows-msvc',
});
expect(resolveWindowsArchitecture('x64').electronArch).toBe('x64');
expect(() => resolveWindowsArchitecture('arm64')).toThrow(/WINDOWS_ARCH/);
```

Extend package tests to require:

```js
expect(resolveWindowsPackage('heybuddy', '1.0.3', 'src', 'out', 'x32')).toMatchObject({
  packagedDirName: 'HeyBuddy-win32-ia32',
  setupFileName: 'HeyBuddy-windows-x32-setup.exe',
});
expect(resolveWindowsPackage('heybuddy', '1.0.3', 'src', 'out', 'x64')).toMatchObject({
  packagedDirName: 'HeyBuddy-win32-x64',
  setupFileName: 'HeyBuddy-windows-x64-setup.exe',
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run scripts/windows-architecture.test.js scripts/windows-package.test.js
```

Expected: FAIL because `windows-architecture.js` and architecture-aware package metadata do not exist.

- [ ] **Step 3: Implement the architecture resolver and package metadata**

Use an immutable architecture table. Make `x64` the fallback only when neither the explicit argument nor `WINDOWS_ARCH` is set. Remove `portableArchiveName` from the package module.

Pass `/DMyAppArch=x32` or `/DMyAppArch=x64` to Inno Setup. In `desktop-setup.iss`, use:

```iss
#if MyAppArch == "x64"
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#else
ArchitecturesAllowed=x86compatible and not x64compatible
#endif
```

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 1 Vitest command. Expected: all selected tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add ui/desktop/scripts/windows-architecture.js ui/desktop/scripts/windows-architecture.test.js ui/desktop/scripts/windows-package.js ui/desktop/scripts/windows-package.test.js ui/desktop/desktop-setup.iss
git commit -m "feat(desktop): add x32 Windows package metadata"
```

### Task 2: Select Architecture-Correct Windows Runtime Dependencies

**Files:**
- Modify: `ui/desktop/scripts/prepare-platform-binaries.js`
- Create: `ui/desktop/scripts/prepare-platform-binaries.test.js`
- Modify: `ui/desktop/src/platform/windows/bin/npx.cmd`
- Create: `ui/desktop/scripts/windows-runtime-assets.test.js`

**Interfaces:**
- Consumes: `resolveWindowsArchitecture(process.env.WINDOWS_ARCH)`.
- Produces: `windowsUvRelease(architecture)` returning the pinned uv URL and per-file SHA-256 values for that architecture.
- Runtime behavior: `npx.cmd` selects Node `win-x86` on 32-bit Windows and `win-x64` on 64-bit Windows, with architecture-specific installation markers.

- [ ] **Step 1: Write failing runtime asset tests**

Require `windowsUvRelease('x32').url` to end in `uv-i686-pc-windows-msvc.zip`, require x64 to end in `uv-x86_64-pc-windows-msvc.zip`, and require both maps to contain 64-character hashes for `uv.exe` and `uvx.exe`.

Add source assertions that `npx.cmd` contains both `win-x86` and `win-x64`, detects `PROCESSOR_ARCHITECTURE`, and uses an architecture-specific installed marker.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run scripts/prepare-platform-binaries.test.js scripts/windows-runtime-assets.test.js
```

Expected: FAIL because only x64 uv and Node downloads are currently selected.

- [ ] **Step 3: Record official x32 uv hashes**

Download `uv-i686-pc-windows-msvc.zip` for the existing pinned uv version `0.11.11`, verify the release archive comes from the official Astral GitHub release, then calculate SHA-256 for the extracted `uv.exe` and `uvx.exe`. Store those exact hashes beside the existing x64 hashes.

- [ ] **Step 4: Implement runtime architecture selection**

Make `prepare-platform-binaries.js` select the uv target through `WINDOWS_ARCH`. Update `npx.cmd` so true 32-bit Windows downloads and extracts `node-v22.14.0-win-x86.zip`, while 64-bit Windows keeps `node-v22.14.0-win-x64.zip`.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Task 2 Vitest command. Expected: all selected tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add ui/desktop/scripts/prepare-platform-binaries.js ui/desktop/scripts/prepare-platform-binaries.test.js ui/desktop/scripts/windows-runtime-assets.test.js ui/desktop/src/platform/windows/bin/npx.cmd
git commit -m "feat(desktop): bundle x32 Windows runtime tools"
```

### Task 3: Build Only x32 and x64 Windows Installers

**Files:**
- Modify: `.github/workflows/bundle-windows.yml`
- Modify: `ui/desktop/package.json`
- Modify: `scripts/test-supported-build-architectures.py`

**Interfaces:**
- Consumes: matrix values `name`, `electron_arch`, and `rust_target`.
- Produces: final artifacts `Goose-win32-x32/HeyBuddy-windows-x32-setup.exe` and `Goose-win32-x64/HeyBuddy-windows-x64-setup.exe`.

- [ ] **Step 1: Replace the x64-only workflow assertions with failing dual-architecture assertions**

Require the workflow to contain both Rust targets, both Electron architectures, architecture-qualified caches and intermediate artifact names, and both installer filenames. Require that `portableFileName`, `7z a`, and `portable.zip` are absent from the Windows workflow.

- [ ] **Step 2: Run the workflow-focused test and verify RED**

Run:

```bash
python3 scripts/test-supported-build-architectures.py
```

Expected: FAIL because the workflow is x64-only and still creates a portable archive.

- [ ] **Step 3: Implement the architecture matrix**

Use an explicit matrix include block:

```yaml
matrix:
  include:
    - name: x32
      electron_arch: ia32
      rust_target: i686-pc-windows-msvc
    - name: x64
      electron_arch: x64
      rust_target: x86_64-pc-windows-msvc
```

Apply it to backend build, desktop package, and installer jobs. Keep `package-cli-windows` downloading only `internal-goose-x86_64-pc-windows-msvc`. Pass `WINDOWS_ARCH` into Node helpers and call Electron Forge with `--platform=win32 --arch=${{ matrix.electron_arch }}`. Remove the portable archive step entirely.

- [ ] **Step 4: Run workflow and package tests and verify GREEN**

Run:

```bash
python3 scripts/test-supported-build-architectures.py
cd ui/desktop
pnpm vitest run scripts/windows-architecture.test.js scripts/windows-package.test.js scripts/prepare-platform-binaries.test.js scripts/windows-runtime-assets.test.js
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add .github/workflows/bundle-windows.yml ui/desktop/package.json scripts/test-supported-build-architectures.py
git commit -m "ci: build x32 and x64 Windows installers"
```

### Task 4: Upload Fixed Stable Installers to Tencent COS

**Files:**
- Create: `.github/scripts/upload-windows-installers-to-cos.sh`
- Create: `.github/scripts/test_upload_windows_installers_to_cos.py`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/publish-existing-release.yml`

**Interfaces:**
- Consumes: installer files in the current directory plus `TENCENT_CLOUD_SECRET_ID` and `TENCENT_CLOUD_SECRET_KEY`.
- Produces: overwrite uploads to the two exact `cos://heybuddy-1252724067/heybuddy/stable/*.exe` keys.
- Uses: checksum-pinned `coscli-v1.0.9-linux-amd64` with SHA-256 `a07de5ba2800147a700ed29036b0c76a4229088cee68e1682d0eae19b638a915`.

- [ ] **Step 1: Write failing uploader tests with a fake COSCLI**

Use Python `unittest` and a temporary executable named `coscli` to capture invocations. Assert that a successful run issues exactly two `cp` calls with these destinations:

```text
cos://heybuddy-1252724067/heybuddy/stable/HeyBuddy-windows-x32-setup.exe
cos://heybuddy-1252724067/heybuddy/stable/HeyBuddy-windows-x64-setup.exe
```

Also assert that missing credentials, a missing installer, or a failed upload returns non-zero, and that no invocation contains ACL flags.

- [ ] **Step 2: Run uploader tests and verify RED**

Run:

```bash
python3 .github/scripts/test_upload_windows_installers_to_cos.py
```

Expected: FAIL because the uploader script does not exist.

- [ ] **Step 3: Implement the uploader**

The script must use `set -euo pipefail`, validate both secrets and both installer files before the first upload, download and verify COSCLI only when `COSCLI_BIN` is not supplied by tests, disable COSCLI file logging, and call `cp` without any ACL-related flags. Use the user-provided bucket endpoint `heybuddy-1252724067.cos.ap-guangzhou.myqcloud.com`.

- [ ] **Step 4: Add release workflow integration**

After both GitHub Release publication steps succeed, invoke the uploader with the two GitHub secrets. Add the same upload step to `publish-existing-release.yml` so recovery publication produces the same stable COS state. Update release artifact patterns to publish only `HeyBuddy-windows-*-setup.exe` for Windows rather than portable ZIP files.

- [ ] **Step 5: Run uploader and workflow tests and verify GREEN**

Run:

```bash
python3 .github/scripts/test_upload_windows_installers_to_cos.py
python3 scripts/test-supported-build-architectures.py
git diff --check
```

Expected: all tests pass and `git diff --check` reports no errors.

- [ ] **Step 6: Commit Task 4**

```bash
git add .github/scripts/upload-windows-installers-to-cos.sh .github/scripts/test_upload_windows_installers_to_cos.py .github/workflows/release.yml .github/workflows/publish-existing-release.yml
git commit -m "ci: upload stable Windows installers to COS"
```

### Task 5: Final Verification

**Files:**
- Verify all files changed by Tasks 1-4.

**Interfaces:**
- Consumes: the completed implementation.
- Produces: evidence that architecture mapping, packaging, workflow shape, and COS destination restrictions are correct.

- [ ] **Step 1: Run focused automated tests**

```bash
python3 scripts/test-supported-build-architectures.py
python3 .github/scripts/test_upload_windows_installers_to_cos.py
cd ui/desktop
pnpm vitest run scripts/windows-architecture.test.js scripts/windows-package.test.js scripts/prepare-platform-binaries.test.js scripts/windows-runtime-assets.test.js
```

- [ ] **Step 2: Validate workflow syntax and formatting**

```bash
git diff --check
git grep -nE 'TENCENT_CLOUD_SECRET_(ID|KEY)=' -- ':!docs/superpowers/**'
git grep -nE 'acl|grant-read|grant-write|public-read' -- .github/scripts/upload-windows-installers-to-cos.sh .github/workflows/release.yml .github/workflows/publish-existing-release.yml
```

Expected: no hard-coded secret values; ACL search matches only test assertions or no lines.

- [ ] **Step 3: Inspect final branch state**

```bash
git status --short --branch
git log --oneline main..HEAD
git diff --stat main...HEAD
```

- [ ] **Step 4: Report CI-only residual risk**

Document that native `i686-pc-windows-msvc`, Electron `ia32`, and Inno Setup execution require the GitHub-hosted Windows runner and cannot be fully executed on the local macOS workspace.
