# Desktop CI/CD Repair Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` implement the plan task-by-task.

**Goal:** Verify the uncommitted desktop identity, packaging, updater-removal, and CI workflow changes, applying only test-first fixes required to make the agreed macOS ARM64 and Windows x64 product matrix valid.

**Architecture:** The existing `brands.json` manifest remains the sole source of product identity. Node helpers derive installer arguments and package checks from that manifest; workflows explicitly select `heybuddy` for their retained historical CI jobs. Linux desktop packaging remains absent, while the retained Linux workflow builds CLI artifacts only.

**Tech Stack:** Node.js CommonJS, Vitest, Electron Forge configuration, GitHub Actions YAML, PowerShell, pnpm.

## Global Constraints

- Supported editions are exactly `heybuddy` and `aibuddy`; packaging must reject an absent or unknown `APP_EDITION`.
- Supported desktop targets are macOS ARM64 and Windows x64 only.
- Keep automatic updates removed and do not restore updater dependencies or manifests.
- Do not repair the unrelated baseline lint or formatting failures in this branch.
- All functional repairs follow red-green-refactor and receive focused unit coverage.

---

### Task 1: Validate Brand and Installer Contracts

**Files:**

- Verify: `ui/desktop/scripts/brand.js`
- Verify: `ui/desktop/scripts/brand.test.js`
- Verify: `ui/desktop/scripts/windows-package.js`
- Verify: `ui/desktop/scripts/windows-package.test.js`
- Verify: `ui/desktop/desktop-setup.iss`

**Interfaces:**

- Consumes: `resolveBrand(edition)` from `scripts/brand.js`.
- Produces: valid edition-specific executable, installer, portable archive, and Inno `/D` arguments.

- [ ] **Step 1: Run focused resolver and installer tests**

  Run: `cd ui/desktop && pnpm vitest run scripts/brand.test.js scripts/windows-package.test.js`

  Expected: PASS for both supported editions; missing and unknown editions fail inside their unit cases.

- [ ] **Step 2: Verify CLI installer input generation for each edition**

  Run: `cd ui/desktop && node scripts/windows-package.js heybuddy 1.0.1 C:\\build\\HeyBuddy C:\\artifacts && node scripts/windows-package.js aibuddy 1.0.1 C:\\build\\AIBuddy C:\\artifacts`

  Expected: each JSON result carries the selected product name, AppId, setup filename, and portable filename.

- [ ] **Step 3: Add a failing focused test if a contract is broken**

  Add a case to `scripts/windows-package.test.js` or `scripts/brand.test.js` that asserts the observed incorrect public result.

- [ ] **Step 4: Run the new test and confirm it fails for the expected reason**

  Run: `cd ui/desktop && pnpm vitest run scripts/brand.test.js scripts/windows-package.test.js`

  Expected: FAIL only for the newly added regression case.

- [ ] **Step 5: Implement the smallest contract correction**

  Modify the helper or installer template without adding edition fallbacks or unrelated packaging behavior.

- [ ] **Step 6: Re-run focused tests**

  Run: `cd ui/desktop && pnpm vitest run scripts/brand.test.js scripts/windows-package.test.js`

  Expected: PASS.

### Task 2: Validate Package Layout and Runtime Identity

**Files:**

- Verify: `ui/desktop/scripts/verify-package.js`
- Verify: `ui/desktop/scripts/verify-package.test.js`
- Verify: `ui/desktop/src/brand.ts`
- Verify: `ui/desktop/src/brand.test.ts`
- Verify: `ui/desktop/forge.config.ts`
- Verify: `ui/desktop/vite.main.config.mts`
- Verify: `ui/desktop/vite.renderer.config.mts`

**Interfaces:**

- Consumes: generated build-time brand values.
- Produces: edition-specific app name, bundle identifier, URL protocol, executable name, and package-tree validation.

- [ ] **Step 1: Run package verification and brand unit tests for both editions**

  Run: `cd ui/desktop && APP_EDITION=heybuddy pnpm vitest run scripts/verify-package.test.js src/brand.test.ts && APP_EDITION=aibuddy pnpm vitest run scripts/verify-package.test.js src/brand.test.ts`

  Expected: PASS for both editions.

- [ ] **Step 2: Load Forge configuration for both editions**

  Run: `cd ui/desktop && APP_EDITION=heybuddy node -e "const c=require('./forge.config.ts'); if(c.packagerConfig.appBundleId !== 'com.electron.heybuddy') process.exit(1)" && APP_EDITION=aibuddy node -e "const c=require('./forge.config.ts'); if(c.packagerConfig.appBundleId !== 'com.electron.aibuddy') process.exit(1)"`

  Expected: both commands exit zero; the only maker targets macOS.

- [ ] **Step 3: Add and run a failing regression test if verification exposes a package or identity defect**

  Test the observable failed identity or missing package file in `verify-package.test.js` or `brand.test.ts`; ensure the focused command fails before production code changes.

- [ ] **Step 4: Make the minimal production correction and re-run the focused command**

  Expected: both editions pass their relevant unit and configuration checks.

### Task 3: Validate Workflow Scope and Updater Removal

**Files:**

- Verify: `.github/workflows/build-cli-linux.yml`
- Verify: `.github/workflows/bundle-macos.yml`
- Verify: `.github/workflows/bundle-windows.yml`
- Verify: `ui/desktop/src/preload.updateRemoval.test.ts`
- Verify: `ui/desktop/src/components/settings/app/AppSettingsSection.logout.test.tsx`

**Interfaces:**

- Consumes: explicit `APP_EDITION=heybuddy` workflow environments and removed desktop updater APIs.
- Produces: CLI-only Linux workflow, buildable retained macOS/Windows CI steps, and no renderer updater exposure.

- [ ] **Step 1: Run updater-removal tests**

  Run: `cd ui/desktop && pnpm vitest run src/preload.updateRemoval.test.ts src/components/settings/app/AppSettingsSection.logout.test.tsx`

  Expected: PASS with no update API or Updates section.

- [ ] **Step 2: Staticaly inspect workflow contracts**

  Run: `rg -n "make --platform=linux|package-desktop-linux|APP_EDITION" .github/workflows/build-cli-linux.yml .github/workflows/bundle-macos.yml .github/workflows/bundle-windows.yml`

  Expected: no Linux Forge make/package job; retained macOS and Windows build paths set `APP_EDITION: heybuddy` explicitly.

- [ ] **Step 3: Add, run, and then satisfy a targeted regression test if an updater API or workflow contract is wrong**

  Preserve the agreed scope: do not add Linux packaging or repair unrelated lint/format baseline failures.

### Task 4: Run Scoped Quality Checks and Report Boundaries

**Files:**

- Verify: all files modified by this change set.

- [ ] **Step 1: Run Prettier check only on modified desktop and workflow files**

  Run: `pnpm --dir ui exec prettier --check <modified desktop files> <modified workflow files>`.

  Expected: selected files pass even if the repository-wide baseline check remains failing.

- [ ] **Step 2: Run `git diff --check` and inspect the complete tracked diff**

  Expected: no whitespace errors; no unrelated tracked files are altered by this verification pass.

- [ ] **Step 3: Report exact focused test outcomes and the known excluded lint/format baseline**
