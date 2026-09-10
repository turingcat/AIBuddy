# AIBuddy Product Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the dual-edition desktop fork into a single-product AIBuddy application with no active HeyBuddy/OA implementation and with independently owned Goose configuration and session data.

**Architecture:** Fix product identity at the desktop product layer, retain Goose compatibility identifiers in the shared engine, and isolate the embedded backend by forcing an AIBuddy-owned `GOOSE_PATH_ROOT`. Add a product-boundary audit so future merges from HeyBuddy `shared` cannot silently reintroduce HeyBuddy services or edition branching.

**Tech Stack:** Rust workspace, Electron, TypeScript, React, Vite, Electron Forge, Vitest, Node.js scripts, declarative Goose providers.

## Global Constraints

- Keep the inheritance chain `Goose -> HeyBuddy shared -> AIBuddy`; do not change the `upstream` remote away from `turingcat/HeyBuddy`.
- Synchronize AIBuddy from `upstream/shared`, not `upstream/main`.
- AIBuddy is a single product; active source must not select between HeyBuddy and AIBuddy editions.
- Remove OA login, `ai.linyeyun.cn`, HeyBuddy provider credentials, and HeyBuddy-to-AIBuddy migration from active code.
- Preserve generic Goose crate, binary, protocol-internal, and compatibility identifiers where renaming would fork the engine unnecessarily.
- Store embedded Goose state below `<AIBuddy userData>/goose` and override inherited `GOOSE_PATH_ROOT`.
- Do not delete or modify existing HeyBuddy data.
- Preserve existing AIBuddy-owned data.
- Add unit tests for all changed functional behavior and maintain at least 80% path coverage for changed functional code.
- Run `cargo fmt` for Rust changes. Run build, full test, typecheck, and clippy commands only after the user explicitly requests them, per repository instructions.

---

### Task 1: Establish the Product-Boundary Audit

**Files:**
- Create: `ui/desktop/scripts/check-product-boundary.js`
- Create: `ui/desktop/scripts/check-product-boundary.test.js`
- Modify: `ui/desktop/package.json`

**Interfaces:**
- Produces: `findProductBoundaryViolations(rootDir): Array<{ file: string; pattern: string }>` and CLI command `pnpm run check:product-boundary`.
- Consumes: repository-relative active-source allowlist; historical files under `docs/superpowers/` are excluded.

- [ ] Write tests using a temporary fixture tree that detect `ai.linyeyun.cn`, `HEYBUDDY_AUTH_API_BASE_URL`, the bundled `heybuddy` provider definition, and `APP_EDITION` conditionals while ignoring historical design documents.
- [ ] Run `cd ui/desktop && pnpm vitest run scripts/check-product-boundary.test.js` and confirm the tests fail because the checker does not exist.
- [ ] Implement a deterministic filesystem walk over active product paths: `src`, `scripts`, `branding`, desktop root configuration files, and `crates/goose-providers` supplied as an explicit extra root by the CLI wrapper.
- [ ] Make violations print as `path: pattern` and exit nonzero; avoid scanning generated output, dependencies, snapshots, or historical plans/specs.
- [ ] Add `check:product-boundary` to `package.json`.
- [ ] Run the focused test and confirm it passes. Run the checker once and record the expected current violations as the baseline for later tasks; this command is expected to fail at this stage.
- [ ] Commit with `test: guard AIBuddy product boundary`.

### Task 2: Make Branding and Packaging AIBuddy-Only

**Files:**
- Modify: `ui/desktop/branding/brands.json`
- Modify: `ui/desktop/scripts/brand.js`
- Modify: `ui/desktop/scripts/brand.test.js`
- Modify: `ui/desktop/src/brand.ts`
- Modify: `ui/desktop/src/brand.test.ts`
- Modify: `ui/desktop/src/viteMainConfig.ts`
- Modify: `ui/desktop/src/viteMainConfig.test.ts`
- Modify: `ui/desktop/vite.main.config.mts`
- Modify: `ui/desktop/vite.renderer.config.mts`
- Modify: `ui/desktop/forge.config.ts`
- Modify: `ui/desktop/scripts/forge-config.test.js`
- Modify: `ui/desktop/package.json`
- Modify: `ui/desktop/scripts/windows-package.js`
- Modify: `ui/desktop/scripts/windows-package.test.js`

**Interfaces:**
- Produces: a frozen AIBuddy brand object and constant helpers `getAppDisplayName()`, `getAppIconStem()`, `getAppTrayIconStem()`, `getAppProtocol()`, and `getAppProtocolPrefix()`.
- Removes: `AppEdition`, `getAppEdition()`, edition arguments, `validate:edition`, and `APP_EDITION` build requirements.

- [ ] Rewrite brand and packaging tests first to assert fixed AIBuddy name, bundle ID `com.electron.aibuddy`, protocol `aibuddy`, artifact name, and AIBuddy icon without setting `APP_EDITION`.
- [ ] Run the focused brand, Vite, Forge, and Windows packaging tests and confirm they fail against dual-edition behavior.
- [ ] Reduce `brands.json` to one AIBuddy record or replace it with an AIBuddy-only manifest while preserving one source of packaging truth.
- [ ] Simplify brand helpers and Vite definitions so no runtime or build-time edition selection remains.
- [ ] Remove edition validation from package scripts and make bundle/debug paths use the fixed AIBuddy artifact name.
- [ ] Change Forge publisher fallback repository from `HeyBuddy` to `AIBuddy`.
- [ ] Run the focused tests and confirm they pass.
- [ ] Commit with `refactor(branding): make desktop AIBuddy-only`.

### Task 3: Remove OA Authentication and Keep Only TFlow

**Files:**
- Delete: `ui/desktop/src/oaLogin.ts`
- Delete: `ui/desktop/src/oaLogin.test.ts`
- Delete: `ui/desktop/src/login.ts`
- Delete: `ui/desktop/src/login.test.ts`
- Modify: `ui/desktop/src/authConfig.ts`
- Modify: `ui/desktop/src/authConfig.test.ts`
- Modify: `ui/desktop/src/components/auth/LoginView.tsx`
- Modify: `ui/desktop/src/components/auth/LoginView.test.tsx`
- Modify: `ui/desktop/src/main.ts`
- Modify: `ui/desktop/src/preload.ts`
- Modify: `ui/desktop/src/preload.loginIpc.test-d.ts`
- Modify: `ui/desktop/src/types/electron.d.ts`
- Modify: `ui/desktop/vite.main.config.mts`
- Modify: `ui/desktop/src/viteMainConfig.ts`
- Modify: `ui/desktop/src/viteMainConfig.test.ts`
- Modify: `ui/desktop/.env.production`

**Interfaces:**
- Produces: AIBuddy auth configuration with TFlow/Sub2API base URL and existing AIBuddy IPC methods only.
- Removes: renderer `login()`, `login` IPC, `performOaLogin`, `runOaLogin`, `AuthMode = 'oa'`, and `HEYBUDDY_AUTH_API_BASE_URL`.

- [ ] Change LoginView and auth configuration tests first to assert the AIBuddy form is unconditional and OA IPC/configuration is absent.
- [ ] Run the focused auth, LoginView, AIBuddy auth IPC, and preload type tests; confirm the new assertions fail.
- [ ] Make `LoginView` render `AIBuddyLoginForm` directly.
- [ ] Collapse auth configuration to AIBuddy/TFlow values and retain only the existing AIBuddy override variable if the current deployment requires it.
- [ ] Remove OA imports, handler registration, preload exposure, and Electron API types from the main-process boundary.
- [ ] Delete OA-only implementation and tests after callers are removed.
- [ ] Run focused tests and confirm they pass.
- [ ] Run `rg -n 'ai\.linyeyun\.cn|HEYBUDDY_AUTH|performOaLogin|HeyBuddyLoginForm' ui/desktop/src ui/desktop/.env.production` and confirm no active matches.
- [ ] Commit with `refactor(auth): remove HeyBuddy OA integration`.

### Task 4: Make Provider and Account Behavior AIBuddy-Only

**Files:**
- Delete: `crates/goose-providers/src/declarative/definitions/heybuddy.json`
- Modify: `crates/goose-providers/src/declarative.rs`
- Modify: `ui/desktop/src/gooseServeEnv.ts`
- Modify: `ui/desktop/src/gooseServeEnv.test.ts`
- Modify: `ui/desktop/src/credentials.ts`
- Modify: `ui/desktop/src/credentials.test.ts`
- Modify: `ui/desktop/src/components/ModelAndProviderContext.tsx`
- Modify: `ui/desktop/src/components/ModelAndProviderContext.test.tsx`
- Modify: `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx`
- Modify: `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx`
- Modify: `ui/desktop/src/components/settings/models/ModelsSection.noReset.test.tsx`
- Modify: `ui/desktop/src/components/Layout/BalanceWidget.tsx`
- Modify: `ui/desktop/src/components/Layout/BalanceWidget.test.tsx`
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.tsx`
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.test.tsx`

**Interfaces:**
- Produces: `buildGooseServeEnv(credentials)` that emits only `AIBUDDY_BASE_URL`, `AIBUDDY_API_KEY`, and `GOOSE_PROVIDER=aibuddy`.
- Removes: `buildHeyBuddyEnv`, HeyBuddy credential discriminants, HeyBuddy provider fallback, and HeyBuddy account/balance branches.

- [ ] Update provider environment and UI tests first so defaults and account presentation are AIBuddy-only.
- [ ] Run focused tests and the declarative provider unit test; confirm failures against HeyBuddy fallbacks.
- [ ] Remove `heybuddy` from the declarative provider registry and update provider validation tests.
- [ ] Collapse credential types to the AIBuddy form while preserving backward decoding only if needed for already-written AIBuddy credentials; do not accept HeyBuddy/OA credentials.
- [ ] Replace model-provider fallbacks with `aibuddy`.
- [ ] Remove HeyBuddy balance and account components, leaving the existing TFlow entitlement presentation.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit with `refactor(aibuddy): remove HeyBuddy provider paths`.

### Task 5: Remove Edition Conditionals and HeyBuddy Visible Identity

**Files:**
- Modify: `ui/desktop/src/components/ChatBrand.tsx`
- Modify: `ui/desktop/src/components/ChatBrand.test.tsx`
- Modify: `ui/desktop/src/components/Hub.tsx`
- Modify: `ui/desktop/src/components/Hub.test.tsx`
- Modify: `ui/desktop/src/i18n/index.ts`
- Modify: `ui/desktop/src/i18n/brandValues.test.tsx`
- Modify: `ui/desktop/src/recipe/deeplink.test.ts`
- Modify: `ui/desktop/src/components/settings/extensions/deeplink.test.ts`
- Modify: `ui/desktop/src/components/settings/app/AppSettingsSection.tsx`
- Modify: `ui/desktop/src/components/settings/extensions/subcomponents/ExtensionList.test.tsx`
- Modify: `crates/goose/src/prompts/system.md`
- Modify: `crates/goose/src/agents/prompt_manager.rs`
- Modify: `crates/goose/src/agents/state_machine/tests/provider_lifecycle.rs`
- Modify: `crates/goose/src/agents/snapshots/goose__agents__prompt_manager__tests__*.snap`
- Modify: `README.md`

**Interfaces:**
- Produces: fixed AIBuddy visible identity and `aibuddy://` deep-link acceptance.
- Removes: edition-dependent copy, HeyBuddy repository links, HeyBuddy assistant prompt, and `goose://` product deep links.

- [ ] Update UI identity and deep-link tests first to assert only AIBuddy behavior.
- [ ] Update prompt tests first to assert the assistant identifies as AIBuddy and retains the existing Chinese-language requirement.
- [ ] Run the focused desktop tests and focused Goose prompt/state-machine tests; confirm failures before implementation.
- [ ] Remove edition branches from chat, hub, i18n brand values, and deep-link handling.
- [ ] Replace active user-visible HeyBuddy account/extension copy and repository links with AIBuddy equivalents.
- [ ] Change the shared system prompt and matching snapshots from HeyBuddy to AIBuddy in both legacy and state-machine test paths, preserving agent-loop parity.
- [ ] Update the root README to describe AIBuddy, TFlow authentication at a product level, and the `Goose -> HeyBuddy shared -> AIBuddy` inheritance model without documenting secrets.
- [ ] Run focused tests and confirm they pass.
- [ ] Run `cargo fmt` because Rust source changed.
- [ ] Commit with `refactor(identity): use AIBuddy across active surfaces`.

### Task 6: Isolate the Embedded Goose Data Root

**Files:**
- Modify: `ui/desktop/src/appIdentity.ts`
- Modify: `ui/desktop/src/appIdentity.test.ts`
- Modify: `ui/desktop/src/main.ts`
- Modify: `ui/desktop/src/gooseServeEnv.ts`
- Modify: `ui/desktop/src/gooseServeEnv.test.ts`
- Modify: `ui/desktop/src/gooseServe.test.ts`

**Interfaces:**
- Produces: `AppDataPaths.goosePathRoot: string`, equal to `path.join(userDataDir, 'goose')`.
- Consumes: `initializeAppIdentity(app)` result when composing the embedded `goose serve` environment.

- [ ] Add an `appIdentity` test asserting `setName('AIBuddy')` occurs before `getPath('userData')` and that `goosePathRoot` is nested under that returned directory.
- [ ] Add an environment-composition test with a hostile inherited `GOOSE_PATH_ROOT=/shared/heybuddy` and assert the output uses the AIBuddy-owned root.
- [ ] Add or adapt the `startGooseServe` process-boundary test to capture the child environment and assert the isolated root reaches the process.
- [ ] Run focused tests and confirm the new assertions fail.
- [ ] Extend `AppDataPaths` and pass the owned root explicitly through main-process environment composition.
- [ ] Ensure the owned root overwrites inherited values after all environment spreads; do not mutate global `process.env`.
- [ ] Confirm recipe selection and other main-process code use the same `appConfig.GOOSE_PATH_ROOT` value.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit with `feat(aibuddy): isolate Goose application data`.

### Task 7: Remove HeyBuddy Data Migration

**Files:**
- Delete: `ui/desktop/src/aibuddyDataMigration.ts`
- Delete: `ui/desktop/src/aibuddyDataMigration.test.ts`
- Modify: `ui/desktop/src/main.ts`
- Modify: `ui/desktop/src/appIdentity.test.ts`
- Modify: `ui/desktop/src/credentials.ts`
- Modify: `ui/desktop/src/credentials.test.ts`

**Interfaces:**
- Removes: `migrateLegacyAIBuddyData`, migration-time credential decoding helpers that have no normal login use, and startup access to the sibling `HeyBuddy` userData directory.

- [ ] Add a startup-order regression assertion that settings and credentials are read only from AIBuddy paths and no sibling product path is resolved.
- [ ] Run the focused identity/startup test and confirm it fails while migration exists.
- [ ] Remove migration registration and imports from `main.ts`.
- [ ] Delete the migration module and tests.
- [ ] Remove credential codec exports only used by migration, retaining normal encrypted read/write behavior.
- [ ] Run focused identity and credential tests and confirm they pass.
- [ ] Run `rg -n 'migrateLegacyAIBuddyData|aibuddyDataMigration|Application Support/HeyBuddy' ui/desktop/src` and confirm no active matches.
- [ ] Commit with `refactor(aibuddy): stop importing HeyBuddy data`.

### Task 8: Document Synchronization and Complete the Boundary Audit

**Files:**
- Modify: `AGENTS.md` if it is tracked in this repository; otherwise create: `docs/aibuddy-upstream-sync.md`
- Modify: `README.md`
- Modify: `ui/desktop/scripts/check-product-boundary.js`
- Modify: `ui/desktop/scripts/check-product-boundary.test.js`

**Interfaces:**
- Produces: documented `upstream/shared` workflow and a zero-violation product-boundary command.

- [ ] Document that normal AIBuddy updates fetch and merge `upstream/shared`, never `upstream/main`, and list the shared/product-specific contract from the design.
- [ ] Add final audit fixtures for any legitimate Goose compatibility identifiers discovered during implementation, using narrow path-and-pattern allowances rather than global exclusions.
- [ ] Run the product-boundary unit test and `pnpm run check:product-boundary`; confirm both pass with zero active HeyBuddy/OA violations.
- [ ] Run `rg -n -i 'ai\.linyeyun\.cn|HEYBUDDY_AUTH|登录 HeyBuddy|公司OA|GOOSE_PROVIDER.*heybuddy|APP_EDITION' ui/desktop crates/goose-providers crates/goose/src/prompts README.md` and classify every remaining match. Remove active product matches; keep only justified compatibility or historical references outside these paths.
- [ ] Run `git diff --check` and `cargo fmt --check`.
- [ ] Ask the user whether to run the repository-authorized build, full desktop tests with coverage, typecheck, and clippy verification. If approved, run `cd ui/desktop && pnpm test -- --coverage`, `cd ui/desktop && pnpm run typecheck`, the focused Rust crate tests, `cargo build`, and `cargo clippy --all-targets -- -D warnings`.
- [ ] Perform the manual two-application package verification only after the user authorizes building packages: verify clean AIBuddy login, empty AIBuddy sessions/models, and unchanged HeyBuddy state.
- [ ] Commit with `docs: define AIBuddy shared synchronization`.
