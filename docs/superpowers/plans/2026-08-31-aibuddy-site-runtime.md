# AIBuddy Site Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) superpowers:executing-plans implement plan task-by-task.

**Goal:** Turn AIBuddy into a group-aware, TFlow-native desktop runtime with isolated provider, account, model, and tray behavior.

**Architecture:** Persist a normalized site credential shape and choose a main-process adapter by `siteKind`. Adapters own account/model/provisioning requests and provider environment; common renderer surfaces consume sanitized IPC results.

**Tech Stack:** TypeScript, React, Electron IPC/net.fetch, Vitest, Rust declarative providers, PNG template assets.

## Global Constraints

- AIBuddy traffic must use the edition-resolved TFlow panel and gateway.
- Reuse only active exact-name `AIBuddy` keys with a group; otherwise require a group selection before saving credentials.
- Display the TFlow email prefix and USD balance without new-api quota conversion.
- Do not expose panel tokens or API keys to renderer state or logs.
- Add a failing automated test before each production behavior and retain 80% affected-path coverage.
- Run `cargo fmt`; do not merge until targeted tests and clippy pass.

### Task 1: Add an AIBuddy declarative provider

**Files:** `crates/goose-providers/src/declarative/definitions/aibuddy.json` (new), `crates/goose-providers/src/declarative.rs`, `ui/desktop/src/gooseServeEnv.ts`, `ui/desktop/src/gooseServeEnv.test.ts`.

**Produces:** `buildSiteRuntimeEnv(credentials)` and a provider named `aibuddy`, configured with `AIBUDDY_BASE_URL`, `AIBUDDY_API_KEY`, and `GOOSE_PROVIDER=aibuddy`.

- [ ] **Step 1: Write the failing tests.** Assert `buildSiteRuntimeEnv(aibuddyCredentials)` equals `{ AIBUDDY_BASE_URL: 'https://tflow.online/v1', AIBUDDY_API_KEY: 'sk-aibuddy', GOOSE_PROVIDER: 'aibuddy' }`; add a Rust declarative test asserting the JSON name and two environment fields.
- [ ] **Step 2: Verify RED.** Run `cd ui/desktop && pnpm vitest run src/gooseServeEnv.test.ts`; it must fail because only HeyBuddy is supported.
- [ ] **Step 3: Implement the provider.** Copy only the transport fields of `heybuddy.json`, rename the provider and environment placeholders, register it, and dispatch the environment builder strictly by `siteKind`.
- [ ] **Step 4: Verify GREEN.** Run `cd ui/desktop && pnpm vitest run src/gooseServeEnv.test.ts` and `cargo test -p goose-providers declarative::tests`.
- [ ] **Step 5: Commit.** Stage the four listed files and commit `feat(providers): add AIBuddy gateway provider`.

### Task 2: Normalize stored credentials

**Files:** `ui/desktop/src/siteRuntime/types.ts` (new), `ui/desktop/src/credentials.ts`, `ui/desktop/src/credentials.test.ts`, `ui/desktop/src/oaLogin.ts`, `ui/desktop/src/oaLogin.test.ts`.

**Produces:** `SiteKind`, `SiteAccountIdentity`, `SiteTarget`, `GatewayCredentials`, and schema-v2 `LoginCredentials`: `{ schemaVersion, siteKind, session, account, target?, gateway }`.

- [ ] **Step 1: Write the failing tests.** Read a legacy flat TFlow record and expect `{ schemaVersion: 2, siteKind: 'sub2api', session: { accessToken: 'jwt' }, account: {}, gateway: { providerId: 'aibuddy', baseUrl: 'https://tflow.online/v1', apiKey: 'sk' } }`; cover an OA record retaining its PAT.
- [ ] **Step 2: Verify RED.** Run `cd ui/desktop && pnpm vitest run src/credentials.test.ts src/oaLogin.test.ts`; current flat credentials must fail those assertions.
- [ ] **Step 3: Implement migration.** Keep the outer encrypted envelope, normalize all valid legacy records on read, reject incomplete v2 data, and return v2 credentials from OA login.
- [ ] **Step 4: Verify GREEN.** Re-run the Step 2 command.
- [ ] **Step 5: Commit.** Stage the files above and commit `refactor(auth): normalize site credentials`.

### Task 3: Build the adapter registry and TFlow data contract

**Files:** `ui/desktop/src/siteRuntime/registry.ts` (new), `registry.test.ts` (new), `gatewayModels.ts` (new), `gatewayModels.test.ts` (new), `oaAdapter.ts` (new), `oaAdapter.test.ts` (new), `sub2apiAdapter.ts` (new), `sub2apiAdapter.test.ts` (new), `ui/desktop/src/sub2apiAuth.ts`, `sub2apiAuth.test.ts`.

**Produces:** a `SiteAdapter` with `fetchAccount`, `fetchModels`, and `buildProviderEnv`; `fetchSub2apiCurrentUser`, `fetchSub2apiGroups`, and `provisionSub2apiGroup`.

- [ ] **Step 1: Write the failing tests.** Expect `/auth/me` data `{ email: 'alice@example.com', balance: 12.34 }` to become `{ email: 'alice@example.com', displayName: 'alice', availableBalance: 12.34 }`; expect provisioning group `7` to return `target: { id: '7', name: 'Composite' }`.
- [ ] **Step 2: Verify RED.** Run `cd ui/desktop && pnpm vitest run src/sub2apiAuth.test.ts src/siteRuntime/registry.test.ts src/siteRuntime/gatewayModels.test.ts src/siteRuntime/sub2apiAdapter.test.ts`; these modules and methods do not yet exist.
- [ ] **Step 3: Implement adapters.** Reject duplicate/unknown site kinds; share a validated OpenAI `{ data: [{ id }] }` loader; delegate OA to existing balance/currency functions; for TFlow use `/auth/me`, `/groups/available`, and only grouped exact-name keys. Create a key with `group_id` when no reusable group key exists and reject empty catalogs before persistence.
- [ ] **Step 4: Verify GREEN.** Re-run the Step 2 command plus `pnpm vitest run src/balance.test.ts`.
- [ ] **Step 5: Commit.** Stage `siteRuntime` and `sub2apiAuth` changes, then commit `feat(auth): add TFlow site adapter`.

### Task 4: Add group-aware AIBuddy login

**Files:** `ui/desktop/src/aibuddyAuthIpc.ts`, `aibuddyAuthIpc.test.ts`, `preload.ts`, `preload.loginIpc.test-d.ts`, `components/auth/AIBuddyLoginForm.tsx`, `components/auth/AIBuddyLoginForm.test.tsx`.

**Produces:** either `{ step: 'authenticated', credentials }` or `{ step: 'select-group', groups, pendingLoginId, account }`, plus `provisionAIBuddyGroup(pendingLoginId, groupId)`. The main process keeps the short-lived panel token and pending account data keyed by `pendingLoginId`; it expires after completion, cancellation, or a bounded timeout.

- [ ] **Step 1: Write the failing form tests.** A successful login with only ungrouped/no keys shows a `Choose a group` heading and does not call `setLoginCredentials`; a login with an existing grouped key persists immediately.
- [ ] **Step 2: Verify RED.** Run `cd ui/desktop && pnpm vitest run src/aibuddyAuthIpc.test.ts src/components/auth/AIBuddyLoginForm.test.tsx src/preload.loginIpc.test-d.ts`; current code always restarts after login.
- [ ] **Step 3: Implement selection.** Pass only the opaque pending ID, account fields, and group IDs/names to the renderer; show a required compact selector; provision and save only catalog-validated credentials after confirmation. Keep form errors actionable.
- [ ] **Step 4: Verify GREEN.** Re-run the Step 2 command.
- [ ] **Step 5: Commit.** Stage these files and commit `feat(auth): select TFlow group when needed`.

### Task 5: Route sidebar and models through adapters

**Files:** `ui/desktop/src/main.ts`, `balance.ts`, `balance.test.ts`, `hooks/useBalance.ts`, `hooks/useBalance.test.ts`, `components/Layout/BalanceWidget.tsx`, `BalanceWidget.test.tsx`, `UserAccountMenu.test.tsx`, `components/ModelAndProviderContext.tsx`, `ModelAndProviderContext.test.tsx`, `components/settings/models/subcomponents/SwitchModelModal.tsx`, `SwitchModelModal.predefinedOnly.test.tsx`.

**Produces:** adapter-dispatched `get-user-balance` and `list-models-via-api`, and default model selection from the first returned AIBuddy catalog item.

- [ ] **Step 1: Write failing tests.** Assert an AIBuddy account result contains `displayName: 'alice'` and `quota: 12.34`; assert `acpSaveDefaults('aibuddy', 'tflow-first-model')`; assert the sidebar omits unavailable new-api usage fields.
- [ ] **Step 2: Verify RED.** Run `cd ui/desktop && pnpm vitest run src/balance.test.ts src/hooks/useBalance.test.ts src/components/Layout/BalanceWidget.test.tsx src/components/Layout/UserAccountMenu.test.tsx src/components/ModelAndProviderContext.test.tsx src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx`; AIBuddy is currently suppressed and provider fallback is `heybuddy`.
- [ ] **Step 3: Implement adapter dispatch.** Replace PAT-only account and direct model calls. Model records carry adapter provider IDs. Represent unavailable usage as absent, show AIBuddy USD directly, remove AIBuddy suppression, save the first TFlow model after successful provision, and preserve the provider ID in the switcher.
- [ ] **Step 4: Verify GREEN.** Re-run the Step 2 command.
- [ ] **Step 5: Commit.** Stage affected account/model files and commit `feat(desktop): use site runtime for account and models`.

### Task 6: Add an AIBuddy menu-bar template asset

**Files:** `ui/desktop/src/images/aibuddy/iconTemplate.png` (new), `iconTemplate@2x.png` (new), `ui/desktop/src/brand.ts`, `brand.test.ts`, `main.ts`, `utils/tray.ts`, `utils/tray.test.ts` (new).

**Produces:** a `trayIconStem` per brand and pure tray path resolution whose AIBuddy first candidate is `aibuddy/iconTemplate.png`.

- [ ] **Step 1: Write failing tests.** Set `APP_EDITION=aibuddy`, expect `getAppTrayIconStem()` to return `aibuddy/iconTemplate`, and expect the resolver to prefer an AIBuddy resource path.
- [ ] **Step 2: Verify RED.** Run `cd ui/desktop && pnpm vitest run src/brand.test.ts src/utils/tray.test.ts`; tray selection currently uses the root HeyBuddy template.
- [ ] **Step 3: Implement assets and resolver.** Generate transparent monochrome 1x/2x PNGs from the approved AIBuddy mark at the existing template dimensions. Use the brand stem in startup tray creation and `setTrayRef`, retaining macOS template rendering and all HeyBuddy resource paths.
- [ ] **Step 4: Verify GREEN.** Re-run the Step 2 command.
- [ ] **Step 5: Commit.** Stage the two images and tray/brand code, then commit `feat(branding): add AIBuddy tray icon`.

### Task 7: Format and verify integration

**Files:** Formatter output only, if needed.

- [ ] **Step 1: Format.** Run `cargo fmt`, then `cd ui/desktop && pnpm exec prettier --write src/siteRuntime src/sub2apiAuth.ts src/aibuddyAuthIpc.ts src/credentials.ts src/gooseServeEnv.ts src/main.ts src/balance.ts src/hooks/useBalance.ts src/components/auth/AIBuddyLoginForm.tsx src/components/Layout/BalanceWidget.tsx src/components/ModelAndProviderContext.tsx src/components/settings/models/subcomponents/SwitchModelModal.tsx src/utils/tray.ts src/brand.ts`.
- [ ] **Step 2: Run desktop coverage.** Run `cd ui/desktop && pnpm vitest run --coverage src/credentials.test.ts src/gooseServeEnv.test.ts src/sub2apiAuth.test.ts src/aibuddyAuthIpc.test.ts src/siteRuntime src/components/auth/AIBuddyLoginForm.test.tsx src/balance.test.ts src/hooks/useBalance.test.ts src/components/Layout/BalanceWidget.test.tsx src/components/Layout/UserAccountMenu.test.tsx src/components/ModelAndProviderContext.test.tsx src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx src/brand.test.ts src/utils/tray.test.ts`; expect PASS and 80% affected-path coverage.
- [ ] **Step 3: Run Rust validation.** Run `source bin/activate-hermit && cargo test -p goose-providers declarative::tests && cargo clippy -p goose-providers --all-targets -- -D warnings`; expect PASS.
- [ ] **Step 4: Inspect final changes.** Run `git diff --check main...HEAD` and `git status --short`; leave unrelated untracked files untouched.
- [ ] **Step 5: Commit formatter-only changes.** Stage only formatter output and commit `test: verify AIBuddy site runtime`.
