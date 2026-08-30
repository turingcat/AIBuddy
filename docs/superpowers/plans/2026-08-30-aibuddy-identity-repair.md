# AIBuddy Identity Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` implement the plan task-by-task.

**Goal:** Package AIBuddy with the selected `b-sproutbuddy` identity and route its login screen through Sub2API/TFlow instead of HeyBuddy OA.

**Architecture:** Merge the existing `feat/aibuddy-sub2api-login` implementation into the repair branch so authentication remains selected by manifest metadata. Add an icon stem to each brand record; Forge and Electron main process resolve their respective packaging and runtime icon paths from that single field.

**Tech Stack:** Electron Forge, Vite, TypeScript, CommonJS build helpers, Vitest, Pillow, macOS `iconutil`, pnpm.

## Global Constraints

- `heybuddy` remains on the OA authentication path and its existing icon resources.
- `aibuddy` uses `authMode: sub2api`, `https://tflow.online`, and the selected `b-sproutbuddy` source asset.
- `APP_EDITION` must remain mandatory and unknown editions must fail before packaging.
- AIBuddy resources must not overwrite shared HeyBuddy resources.
- Run all desktop verification under Hermit Node 24.10.0.

---

### Task 1: Integrate Edition-Specific Authentication

**Files:**

- Merge: `feat/aibuddy-sub2api-login`
- Modify through merge: `ui/desktop/branding/brands.json`
- Modify through merge: `ui/desktop/src/components/auth/LoginView.tsx`
- Create through merge: `ui/desktop/src/components/auth/AIBuddyLoginForm.tsx`
- Create through merge: `ui/desktop/src/sub2apiAuth.ts`
- Test through merge: `ui/desktop/src/components/auth/LoginView.test.tsx`
- Test through merge: `ui/desktop/src/sub2apiAuth.test.ts`

**Interfaces:**

- Consumes: `authMode` and `authApiBaseUrl` in a selected brand record.
- Produces: OA login for `heybuddy`, Sub2API captcha login for `aibuddy`.

- [ ] **Step 1: Verify the source branch's focused authentication tests on its commit**

  Run: `git -C .worktrees/aibuddy-sub2api-login status --short && cd .worktrees/aibuddy-sub2api-login/ui/desktop && source ../../bin/activate-hermit && pnpm vitest run src/components/auth/LoginView.test.tsx src/sub2apiAuth.test.ts src/aibuddyAuthIpc.test.ts`

  Expected: the login routing and Sub2API tests pass before integration.

- [ ] **Step 2: Merge the existing authentication branch without committing**

  Run: `git merge --no-commit --no-ff feat/aibuddy-sub2api-login`

  Expected: merge applies the complete tested authentication implementation; resolve only integration conflicts against current `main`.

- [ ] **Step 3: Run the authentication regression tests on the merged tree**

  Run: `cd ui/desktop && source ../../bin/activate-hermit && APP_EDITION=heybuddy pnpm vitest run src/components/auth/LoginView.test.tsx src/sub2apiAuth.test.ts src/aibuddyAuthIpc.test.ts && APP_EDITION=aibuddy pnpm vitest run src/components/auth/LoginView.test.tsx src/sub2apiAuth.test.ts src/aibuddyAuthIpc.test.ts`

  Expected: both editions select their intended authentication flow; no AIBuddy render uses OA text or OA IPC.

- [ ] **Step 4: Commit the integrated authentication implementation**

  Run: `git commit -m "feat(auth): add AIBuddy Sub2API login"`

### Task 2: Add Manifest-Driven AIBuddy Icon Resources

**Files:**

- Modify: `ui/desktop/branding/brands.json`
- Modify: `ui/desktop/scripts/brand.js`
- Modify: `ui/desktop/scripts/brand.test.js`
- Modify: `ui/desktop/forge.config.ts`
- Modify: `ui/desktop/scripts/forge-config.test.js`
- Modify: `ui/desktop/vite.main.config.mts`
- Modify: `ui/desktop/src/brand.ts`
- Modify: `ui/desktop/src/brand.test.ts`
- Modify: `ui/desktop/src/main.ts`
- Create: `ui/desktop/src/images/aibuddy/icon.png`
- Create: `ui/desktop/src/images/aibuddy/icon.ico`
- Create: `ui/desktop/src/images/aibuddy/icon.icns`

**Interfaces:**

- Consumes: `iconStem` from `resolveBrand(edition)`, where `heybuddy` is `icon` and `aibuddy` is `aibuddy/icon`.
- Produces: Forge `packagerConfig.icon` and `BrowserWindow` icon candidates selected from the same edition-specific stem.

- [ ] **Step 1: Write failing manifest and Forge tests**

  Add assertions that `resolveBrand('aibuddy').iconStem === 'aibuddy/icon'`, `resolveBrand('heybuddy').iconStem === 'icon'`, and an AIBuddy Forge config reports `src/images/aibuddy/icon` instead of `src/images/icon`.

- [ ] **Step 2: Run the focused tests to verify the current implementation fails**

  Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm vitest run scripts/brand.test.js scripts/forge-config.test.js src/brand.test.ts`

  Expected: FAIL because the manifest does not expose an icon stem and Forge uses the common icon.

- [ ] **Step 3: Generate AIBuddy resources from the selected source asset**

  Use `branding/heybuddy-icon-b-sproutbuddy-macos-1024.png` as the source, retaining alpha. Generate `1024x1024` PNG, multi-size ICO, and macOS ICNS at `src/images/aibuddy/icon.*`; verify each file exists and the ICNS opens at 1024 pixels.

- [ ] **Step 4: Implement icon-stem propagation**

  Add `iconStem` to each brand record and validate it in the resolver. Update Forge, build-time Vite defines, runtime brand helpers, and main-process icon lookup to form paths from `iconStem`; do not add `if (edition === 'aibuddy')` branches outside the manifest.

- [ ] **Step 5: Re-run the focused tests**

  Run: `cd ui/desktop && APP_EDITION=heybuddy pnpm vitest run scripts/brand.test.js scripts/forge-config.test.js src/brand.test.ts && APP_EDITION=aibuddy pnpm vitest run scripts/brand.test.js scripts/forge-config.test.js src/brand.test.ts`

  Expected: PASS. AIBuddy config identifies `src/images/aibuddy/icon`; HeyBuddy retains `src/images/icon`.

- [ ] **Step 6: Commit icon identity changes**

  Run: `git commit -m "feat(branding): give AIBuddy a distinct icon"`

### Task 3: Package and Verify AIBuddy

**Files:**

- Verify: `ui/desktop/out/AIBuddy-darwin-arm64/AIBuddy.app`
- Verify: `ui/desktop/out/AIBuddy-darwin-arm64/AIBuddy.zip`

- [ ] **Step 1: Run unit, type, localization, and workflow checks**

  Run: `cd ui/desktop && source ../../bin/activate-hermit && pnpm test && pnpm run typecheck && pnpm run i18n:check && cd ../.. && python3 scripts/test-supported-build-architectures.py`

  Expected: all commands pass.

- [ ] **Step 2: Build the AIBuddy macOS ARM64 package**

  Run: `cd ui/desktop && source ../../bin/activate-hermit && APP_EDITION=aibuddy pnpm run bundle:default`

  Expected: `out/AIBuddy-darwin-arm64/AIBuddy.app` and `AIBuddy.zip` exist.

- [ ] **Step 3: Verify the packaged identity and icon**

  Run: `cd ui/desktop && APP_EDITION=aibuddy node scripts/verify-package.js --edition aibuddy --platform darwin --root out/AIBuddy-darwin-arm64 && plutil -p out/AIBuddy-darwin-arm64/AIBuddy.app/Contents/Info.plist`

  Expected: package validation passes; `CFBundleIdentifier` is `com.electron.aibuddy`; packaged resources contain `images/aibuddy/icon.icns`.
