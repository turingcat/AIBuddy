# Desktop Brand and Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HeyBuddy and AIBuddy real, unsigned Desktop build targets for macOS ARM64 and Windows x64, while removing every automatic-update path.

**Architecture:** A checked-in JSON brand manifest is the only source of product identity. A small CommonJS resolver is consumed by Electron Forge, Vite, installer tooling, and workflow scripts; Vite injects the selected product name and URL protocol into main/renderer code. Both editions share application code, icons, and one embedded platform-specific `goose-cli` binary.

**Tech Stack:** Electron Forge, TypeScript, Node.js CommonJS scripts, Vitest, Inno Setup 6, pnpm.

## Global Constraints

- Supported editions are exactly `heybuddy` and `aibuddy`; an absent or unknown `APP_EDITION` fails packaging.
- HeyBuddy identity: product `HeyBuddy`, bundle ID `com.electron.heybuddy`, protocol `goose`, Windows AppId `{FDA43817-EFCC-42D0-AB69-D414B629E300}`.
- AIBuddy identity: product `AIBuddy`, bundle ID `com.electron.aibuddy`, protocol `aibuddy`, Windows AppId `{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}`.
- macOS builds are ARM64 only. Windows builds are x64 only.
- Distribution is unsigned. Do not add signing or notarization inputs.
- `goose-cli` remains embedded as `src/bin/goose` or `src/bin/goose.exe`; it is not a standalone deliverable.
- AIBuddy initially reuses the existing HeyBuddy icons.
- Do not restore updater manifests, update IPC, update UI, or references to `aaif-goose/goose` as an update source.
- Functional changes use tests first. Run `cargo fmt` after any Rust edit; this plan should not require Rust edits.

---

### Task 1: Stabilize the Existing Desktop Test Baseline

**Files:**
- Modify: `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx`

**Interfaces:**
- The test continues to verify that `currentModel = "glm-4.6"` selects the matching radio control.
- No production behavior changes in this task.

- [ ] Run the focused test and confirm the current failure.

```bash
cd ui/desktop
pnpm vitest run src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx
```

Expected: FAIL because a transient `getByRole('radio', { checked: true })` lookup races the controlled state.

- [ ] Change P3 to await the specifically named `glm-4.6` radio and assert `toBeChecked()` inside `waitFor`; do not select an arbitrary checked radio.

- [ ] Run the focused test again.

```bash
cd ui/desktop
pnpm vitest run src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx
```

Expected: PASS.

- [ ] Commit the baseline repair.

```bash
git add ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx
git commit -m "test(desktop): stabilize selected model assertion"
```

### Task 2: Add the Brand Manifest and Resolver

**Files:**
- Create: `ui/desktop/branding/brands.json`
- Create: `ui/desktop/scripts/brand.js`
- Create: `ui/desktop/scripts/brand.test.js`

**Interfaces:**
- `resolveBrand(edition: string | undefined): Brand` returns a frozen object with `edition`, `productName`, `bundleId`, `protocol`, `protocolName`, `windowsAppId`, `executableName`, and `artifactStem`.
- `resolveBrand()` throws for a missing or unsupported edition and lists `heybuddy, aibuddy` in the error.
- `node scripts/brand.js <edition> <field>` prints exactly one scalar field for shell and PowerShell consumers and exits nonzero for invalid inputs.

- [ ] Write failing Vitest cases for both complete identity records, missing `APP_EDITION`, unknown editions, immutable results, and CLI scalar output validation.

```bash
cd ui/desktop
pnpm vitest run scripts/brand.test.js
```

Expected: FAIL because the manifest and resolver do not exist.

- [ ] Add `brands.json` with only `heybuddy` and `aibuddy`, copying the exact identities from Global Constraints.

- [ ] Implement `resolveBrand` and the CLI entry point in `scripts/brand.js`. Resolve from the explicit argument first and `process.env.APP_EDITION` second; never silently default during packaging.

- [ ] Run the resolver tests.

```bash
cd ui/desktop
pnpm vitest run scripts/brand.test.js
node scripts/brand.js heybuddy productName
node scripts/brand.js aibuddy windowsAppId
```

Expected: tests PASS; commands print `HeyBuddy` and `{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}`.

- [ ] Commit the manifest and resolver.

```bash
git add ui/desktop/branding/brands.json ui/desktop/scripts/brand.js ui/desktop/scripts/brand.test.js
git commit -m "feat(desktop): define HeyBuddy and AIBuddy brands"
```

### Task 3: Wire Brand Identity into Electron Forge and Runtime Code

**Files:**
- Modify: `ui/desktop/forge.config.ts`
- Modify: `ui/desktop/vite.main.config.mts`
- Modify: `ui/desktop/vite.renderer.config.mts`
- Modify: `ui/desktop/forge.env.d.ts`
- Create: `ui/desktop/src/brand.ts`
- Create: `ui/desktop/src/brand.test.ts`
- Modify: `ui/desktop/src/main.ts`
- Modify: `ui/desktop/src/recipe/index.ts`
- Modify: `ui/desktop/src/recipe/validation.test.ts`
- Modify: `ui/desktop/src/components/recipes/ImportRecipeForm.tsx`
- Create: `ui/desktop/src/components/recipes/ImportRecipeForm.test.tsx`
- Modify: `ui/desktop/src/components/schedule/ScheduleModal.tsx`
- Modify: `ui/desktop/src/components/sessions/SessionListView.tsx`
- Modify: `ui/desktop/src/components/settings/extensions/deeplink.ts`
- Modify: `ui/desktop/src/components/settings/extensions/deeplink.test.ts`
- Modify: `ui/desktop/package.json`

**Interfaces:**
- Vite defines `process.env.APP_DISPLAY_NAME` and `process.env.APP_PROTOCOL` from `resolveBrand(APP_EDITION)` for main and renderer bundles.
- `src/brand.ts` exports `APP_DISPLAY_NAME`, `APP_PROTOCOL`, and `APP_PROTOCOL_PREFIX` (`<protocol>://`).
- Forge sets `packagerConfig.name`, `appBundleId`, protocol name/scheme, executable name, and macOS usage strings from the selected brand.
- Protocol parsing and generated recipe/extension links use `APP_PROTOCOL`; AIBuddy must not register or emit `goose://` links.

- [ ] Write failing tests for the runtime brand constants and for recipe/extension deep links under both injected protocols. Preserve negative tests for unrelated schemes.

```bash
cd ui/desktop
APP_EDITION=heybuddy pnpm vitest run src/brand.test.ts src/recipe/validation.test.ts src/components/settings/extensions/deeplink.test.ts
APP_EDITION=aibuddy pnpm vitest run src/brand.test.ts src/recipe/validation.test.ts src/components/settings/extensions/deeplink.test.ts
```

Expected: FAIL because runtime identity is still hard-coded to Goose/HeyBuddy.

- [ ] Import `resolveBrand` in both Vite configs and inject the two constants. Declare them in `forge.env.d.ts`; keep `GOOSE_BUNDLE_NAME` only if another non-updater call site still needs it.

- [ ] Add `src/brand.ts`, then replace protocol registration, startup argument matching, second-instance matching, generated/validated deep-link prefixes, and recipe/session input hints with its exports. AIBuddy production code must not register, require, or emit `goose://`.

- [ ] Remove all Linux makers and signing/notarization branches from `forge.config.ts`. Keep only the ZIP maker required by macOS packaging; Windows setup is produced by Inno Setup in Task 4.

- [ ] Set Forge package identity and usage-description text from the selected brand. Remove `src/app-update.yml` from `extraResource` now; the file itself is deleted in Task 5.

- [ ] Replace architecture-hardcoded package commands with explicit scripts:

```json
{
  "package:macos": "electron-forge package --platform=darwin --arch=arm64",
  "package:windows": "electron-forge package --platform=win32 --arch=x64"
}
```

Each script must retain the existing SDK and i18n prerequisites and require `APP_EDITION`.

- [ ] Run the focused tests and configuration checks.

```bash
cd ui/desktop
APP_EDITION=heybuddy pnpm vitest run src/brand.test.ts src/recipe/validation.test.ts src/components/settings/extensions/deeplink.test.ts
APP_EDITION=aibuddy pnpm vitest run src/brand.test.ts src/recipe/validation.test.ts src/components/settings/extensions/deeplink.test.ts
APP_EDITION=heybuddy node -e "const c=require('./forge.config.ts'); if (c.packagerConfig.appBundleId !== 'com.electron.heybuddy') process.exit(1)"
APP_EDITION=aibuddy node -e "const c=require('./forge.config.ts'); if (c.packagerConfig.appBundleId !== 'com.electron.aibuddy') process.exit(1)"
pnpm run typecheck
```

Expected: PASS for both editions.

- [ ] Commit Forge and runtime branding.

```bash
git add ui/desktop/forge.config.ts ui/desktop/vite.main.config.mts ui/desktop/vite.renderer.config.mts ui/desktop/forge.env.d.ts ui/desktop/src/brand.ts ui/desktop/src/brand.test.ts ui/desktop/src/main.ts ui/desktop/src/recipe/index.ts ui/desktop/src/recipe/validation.test.ts ui/desktop/src/components/recipes/ImportRecipeForm.tsx ui/desktop/src/components/recipes/ImportRecipeForm.test.tsx ui/desktop/src/components/schedule/ScheduleModal.tsx ui/desktop/src/components/sessions/SessionListView.tsx ui/desktop/src/components/settings/extensions/deeplink.ts ui/desktop/src/components/settings/extensions/deeplink.test.ts ui/desktop/package.json
git commit -m "feat(desktop): apply edition identity to packaged apps"
```

### Task 4: Generalize the Windows Installer and Portable Package Inputs

**Files:**
- Create: `ui/desktop/desktop-setup.iss`
- Delete: `ui/desktop/heybuddy-setup.iss`
- Create: `ui/desktop/scripts/windows-package.js`
- Create: `ui/desktop/scripts/windows-package.test.js`
- Modify: `scripts/build-windows.ps1`

**Interfaces:**
- `buildInnoDefinitions(brand, version, sourceDir, outputDir)` returns arguments for `MyAppName`, `MyAppVersion`, `MyAppId`, `MyAppExeName`, `SourceDir`, `OutputDir`, and `OutputBaseFilename`.
- Installer output is `<Edition>-windows-x64-setup.exe`.
- Portable output is `<Edition>-windows-x64-portable.zip`, containing the unpacked Electron directory and embedded `goose.exe`; it creates no installer registry or uninstall records.
- Inno Setup installs under `{autopf}\<Edition>`, creates shortcuts and an uninstaller, and preserves the edition-specific AppId for upgrades.

- [ ] Write failing tests for both editions' Inno definitions, setup filenames, portable filenames, and rejection of an unsupported edition or malformed version.

```bash
cd ui/desktop
pnpm vitest run scripts/windows-package.test.js
```

Expected: FAIL because the generic Windows packaging helper does not exist.

- [ ] Implement `windows-package.js` using `resolveBrand`; expose functions for unit tests and a CLI that prints a JSON argument array for PowerShell.

- [ ] Replace hard-coded values in `heybuddy-setup.iss` with required `/D` definitions and rename it `desktop-setup.iss`. Do not define fallback product identities inside the installer.

- [ ] Update `build-windows.ps1` to accept `-Edition heybuddy|aibuddy`, obtain brand values from the helper, package only `x86_64-pc-windows-msvc`, and atomically replace copied executables instead of overwriting a live binary.

- [ ] Run tests and parse both installer command lines without invoking ISCC.

```bash
cd ui/desktop
pnpm vitest run scripts/windows-package.test.js
node scripts/windows-package.js heybuddy 1.0.1 C:\build\HeyBuddy C:\artifacts
node scripts/windows-package.js aibuddy 1.0.1 C:\build\AIBuddy C:\artifacts
```

Expected: PASS; each JSON result has the correct AppId and release filenames.

- [ ] Commit Windows package generalization.

```bash
git add ui/desktop/desktop-setup.iss ui/desktop/scripts/windows-package.js ui/desktop/scripts/windows-package.test.js scripts/build-windows.ps1
git rm ui/desktop/heybuddy-setup.iss
git commit -m "feat(desktop): package both Windows editions"
```

### Task 5: Remove Automatic Updating End to End

**Files:**
- Delete: `ui/desktop/src/app-update.yml`
- Delete: `ui/desktop/src/updates.ts`
- Delete: `ui/desktop/src/utils/autoUpdater.ts`
- Delete: `ui/desktop/src/utils/githubUpdater.ts`
- Delete: `ui/desktop/src/components/settings/app/UpdateSection.tsx`
- Delete: `ui/desktop/scripts/generate-mac-update-manifest.js`
- Delete: `ui/desktop/scripts/verify-mac-update-resources.js`
- Modify: `ui/desktop/src/main.ts`
- Modify: `ui/desktop/src/preload.ts`
- Modify: `ui/desktop/src/utils/analytics.ts`
- Modify: `ui/desktop/src/components/settings/app/AppSettingsSection.tsx`
- Modify: `ui/desktop/src/components/settings/app/AppSettingsSection.logout.test.tsx`
- Create: `ui/desktop/src/preload.updateRemoval.test.ts`
- Modify: `ui/desktop/package.json`
- Modify: `ui/pnpm-lock.yaml`

**Interfaces:**
- `window.electron` no longer exposes update check, download, install, update-state, fallback-state, or updater-event methods.
- Main process registers no update IPC handlers, timers, tray entries, or startup hooks.
- Settings always shows the installed/development version and has no Updates section.

- [ ] Add a preload regression test that captures the object passed to `contextBridge.exposeInMainWorld('electron', ...)` and asserts updater methods are absent. Add a settings assertion that the version remains visible and no Updates heading is rendered.

```bash
cd ui/desktop
pnpm vitest run src/components/settings/app/AppSettingsSection.logout.test.tsx src/preload.updateRemoval.test.ts
```

Expected: FAIL while updater APIs and UI remain.

- [ ] Remove updater imports, initialization, IPC, tray menu state, and preload surface. Remove only update-specific analytics event types/functions; retain unrelated analytics.

- [ ] Delete the updater modules, UI, manifests, and scripts. Remove their mocks from `AppSettingsSection.logout.test.tsx`.

- [ ] Remove `electron-updater` through pnpm so both package metadata and lockfile stay consistent.

```bash
cd ui/desktop
pnpm remove electron-updater
```

- [ ] Search for stale update-source and updater references.

```bash
rg -n "aaif-goose/goose|electron-updater|app-update\.yml|autoUpdater|githubUpdater|UPDATES_ENABLED|updater-event|check-for-updates|download-update|install-update" ui/desktop
```

Expected: no matches related to automatic updates. Repository links unrelated to updating are allowed only if deliberately retained and documented in the commit.

- [ ] Run focused and full Desktop checks.

```bash
cd ui/desktop
pnpm vitest run src/components/settings/app/AppSettingsSection.logout.test.tsx src/preload.updateRemoval.test.ts
pnpm run typecheck
pnpm run lint
pnpm test
```

Expected: PASS.

- [ ] Commit updater removal.

```bash
git add ui/desktop/src/main.ts ui/desktop/src/preload.ts ui/desktop/src/preload.updateRemoval.test.ts ui/desktop/src/utils/analytics.ts ui/desktop/src/components/settings/app/AppSettingsSection.tsx ui/desktop/src/components/settings/app/AppSettingsSection.logout.test.tsx ui/desktop/package.json ui/pnpm-lock.yaml
git rm ui/desktop/src/app-update.yml ui/desktop/src/updates.ts ui/desktop/src/utils/autoUpdater.ts ui/desktop/src/utils/githubUpdater.ts ui/desktop/src/components/settings/app/UpdateSection.tsx ui/desktop/scripts/generate-mac-update-manifest.js ui/desktop/scripts/verify-mac-update-resources.js
git commit -m "feat(desktop): remove automatic updates"
```

### Task 6: Add Package Identity Verification

**Files:**
- Create: `ui/desktop/scripts/verify-package.js`
- Create: `ui/desktop/scripts/verify-package.test.js`
- Modify: `ui/desktop/package.json`

**Interfaces:**
- CLI: `node scripts/verify-package.js --edition <edition> --platform darwin|win32 --root <package-root>`.
- Common checks: product executable exists and embedded `goose`/`goose.exe` exists.
- macOS checks: `.app/Contents/Info.plist` has the manifest bundle ID and URL scheme.
- Windows checks: unpacked directory is named for the edition and contains `<Edition>.exe`.

- [ ] Write failing fixture-driven tests for valid HeyBuddy/AIBuddy package trees, swapped identities, missing embedded CLI, and unsupported platforms.

```bash
cd ui/desktop
pnpm vitest run scripts/verify-package.test.js
```

Expected: FAIL because verifier does not exist.

- [ ] Implement pure package-tree and plist-object validation functions for cross-platform unit tests. The CLI obtains structured plist JSON via `plutil -convert json -o -` on macOS; do not inspect plist contents with substring matching.

- [ ] Add `verify:package` to `package.json` and run unit tests.

```bash
cd ui/desktop
pnpm vitest run scripts/verify-package.test.js
pnpm run typecheck
```

Expected: PASS.

- [ ] Commit package verification.

```bash
git add ui/desktop/scripts/verify-package.js ui/desktop/scripts/verify-package.test.js ui/desktop/package.json
git commit -m "test(desktop): verify packaged edition identity"
```

### Task 7: Final Desktop Verification

**Files:**
- Verify only; update files solely to fix failures caused by Tasks 1-6.

- [ ] Run formatting and all Desktop quality checks.

```bash
cd ui/desktop
pnpm run format:check
pnpm run typecheck
pnpm run lint
pnpm test
```

Expected: PASS.

- [ ] On Apple Silicon, build and verify both unsigned macOS packages.

```bash
cd ui/desktop
APP_EDITION=heybuddy pnpm run package:macos
APP_EDITION=heybuddy node scripts/verify-package.js --edition heybuddy --platform darwin --root out/HeyBuddy-darwin-arm64
APP_EDITION=aibuddy pnpm run package:macos
APP_EDITION=aibuddy node scripts/verify-package.js --edition aibuddy --platform darwin --root out/AIBuddy-darwin-arm64
```

Expected: both packages build and verify. Unsigned apps may require `xattr -dr com.apple.quarantine` only when manually launching a downloaded CI archive.

- [ ] Review the diff for Linux makers, update code, standalone CLI publishing, or hard-coded cross-edition identifiers.

```bash
git diff --check
rg -n "maker-deb|maker-rpm|maker-flatpak|electron-updater|app-update\.yml|aaif-goose/goose" ui/desktop
git status --short
```

- [ ] Commit any verification-only corrections as a focused commit; do not amend earlier commits.
