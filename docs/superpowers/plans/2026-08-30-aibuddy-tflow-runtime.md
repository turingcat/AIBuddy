# AIBuddy tflow Site Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AIBuddy use tflow.online for account data, group-scoped API keys, models, and inference through a reusable site-adapter runtime while preserving HeyBuddy OA behavior.

**Architecture:** Keep edition-specific login forms, but move all authenticated post-login behavior behind a main-process `SiteAdapter` registry. Persist a normalized credential record containing site, session, account, target, and gateway data; dispatch account refresh, provider environment, and model catalog through the selected adapter instead of edition checks.

**Tech Stack:** TypeScript, React, Electron IPC/net.fetch, Vitest/Testing Library, Rust declarative providers, OpenAI-compatible sub2api gateway.

## Global Constraints

- AIBuddy external traffic must use `https://tflow.online`; HeyBuddy OA behavior must remain unchanged.
- AIBuddy uses an explicit user-selected sub2api group and never reuses an ungrouped API Key.
- AIBuddy username is the current tflow email prefix before `@`; balance is the sub2api USD amount.
- Renderer code must not import generated OpenAPI code from `ui/desktop/src/api`.
- Sensitive access tokens and API keys must not be logged or exposed through model/account display objects.
- Every production behavior is introduced with a failing test first, and affected modules maintain at least 80% path coverage.
- Run `cargo fmt` after Rust changes and do not merge or push from this plan.

---

### Task 1: Normalize Stored Site Credentials

**Files:**

- Create: `ui/desktop/src/siteRuntime/types.ts`
- Modify: `ui/desktop/src/credentials.ts`
- Modify: `ui/desktop/src/credentials.test.ts`
- Modify: `ui/desktop/src/oaLogin.ts`
- Modify: `ui/desktop/src/oaLogin.test.ts`

**Interfaces:**

- Produces `SiteKind`, `SiteAccountIdentity`, `SiteTarget`, `GatewayCredentials`, and normalized `LoginCredentials`.
- `readCredentials()` always returns the normalized structure, including when the encrypted payload contains a legacy flat OA or early AIBuddy record.
- Later tasks consume `credentials.siteKind`, `credentials.session`, `credentials.account`, `credentials.target`, and `credentials.gateway`.

- [ ] **Step 1: Write failing normalized credential tests**

Add cases that expect a v2 inner credential record to round-trip and legacy records to normalize:

```ts
expect(readCredentials(tmpFile, identityCodec)).toEqual({
  schemaVersion: 2,
  siteKind: 'oa',
  session: { accessToken: 'legacy', pat: 'legacy-pat' },
  account: {},
  gateway: { providerId: 'heybuddy', baseUrl: 'https://oa.example/v1', apiKey: 'oa-key' },
});

fs.writeFileSync(
  tmpFile,
  JSON.stringify({
    token: 'tflow-token',
    baseUrl: 'https://tflow.online/v1',
    apiKey: 'old-key',
    authKind: 'sub2api',
  })
);
expect(readCredentials(tmpFile, identityCodec)).toEqual({
  schemaVersion: 2,
  siteKind: 'sub2api',
  session: { accessToken: 'tflow-token' },
  account: {},
  gateway: { providerId: 'aibuddy', baseUrl: 'https://tflow.online/v1', apiKey: 'old-key' },
});
```

- [ ] **Step 2: Run the credential and OA tests to verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run src/credentials.test.ts src/oaLogin.test.ts
```

Expected: FAIL because `LoginCredentials` is still flat and legacy reads are not normalized.

- [ ] **Step 3: Add site runtime credential types and migration**

Define the stable persisted shape:

```ts
export type SiteKind = 'oa' | 'sub2api';

export interface SiteAccountIdentity {
  email?: string;
}

export interface SiteTarget {
  id: string;
  name: string;
}

export interface GatewayCredentials {
  providerId: string;
  baseUrl: string;
  apiKey: string;
}

export interface LoginCredentials {
  schemaVersion: 2;
  siteKind: SiteKind;
  session: { accessToken: string; pat?: string };
  account: SiteAccountIdentity;
  target?: SiteTarget;
  gateway: GatewayCredentials;
}
```

Keep the outer encrypted envelope at `v: 1`; `schemaVersion` versions the decrypted payload. Make `validateFields()` accept only complete normalized credentials, and add a pure `normalizeLegacyCredentials()` for the previous flat forms. Update `performOaLogin()` to create a normalized `siteKind: 'oa'` result.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run:

```bash
cd ui/desktop
pnpm vitest run src/credentials.test.ts src/oaLogin.test.ts src/login.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add ui/desktop/src/siteRuntime/types.ts ui/desktop/src/credentials.ts ui/desktop/src/credentials.test.ts ui/desktop/src/oaLogin.ts ui/desktop/src/oaLogin.test.ts
git commit -m "refactor(auth): normalize site credentials"
```

### Task 2: Define the Site Adapter Registry

**Files:**

- Create: `ui/desktop/src/siteRuntime/registry.ts`
- Create: `ui/desktop/src/siteRuntime/registry.test.ts`
- Create: `ui/desktop/src/siteRuntime/gatewayModels.ts`
- Create: `ui/desktop/src/siteRuntime/gatewayModels.test.ts`
- Create: `ui/desktop/src/siteRuntime/oaAdapter.ts`
- Create: `ui/desktop/src/siteRuntime/oaAdapter.test.ts`

**Interfaces:**

- Consumes normalized `LoginCredentials` from Task 1.
- Produces `SiteAdapter`, `SiteRequestContext`, `SiteAccountSnapshot`, `SiteModel`, `SiteRuntimeInfo`, `fetchOpenAICompatibleModels()`, `createSiteAdapterRegistry()`, and the OA adapter.
- Later tasks register the sub2api adapter without modifying registry control flow.

- [ ] **Step 1: Write failing registry tests**

Cover exact adapter lookup and unknown-site failure:

```ts
const registry = createSiteAdapterRegistry([oaAdapter, sub2apiStub]);
expect(registry.get('oa')).toBe(oaAdapter);
expect(registry.get('sub2api')).toBe(sub2apiStub);
expect(() => registry.get('unknown' as SiteKind)).toThrow('Unsupported site: unknown');
```

Test that duplicate `siteKind` registration fails instead of silently replacing an adapter.

- [ ] **Step 2: Run the registry tests to verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run src/siteRuntime/registry.test.ts src/siteRuntime/gatewayModels.test.ts src/siteRuntime/oaAdapter.test.ts
```

Expected: FAIL because the registry and adapter contract do not exist.

- [ ] **Step 3: Implement the narrow adapter contract**

Use one interface for behavior shared after authentication:

```ts
export interface SiteAdapter {
  readonly siteKind: SiteKind;
  getRuntimeInfo(credentials: LoginCredentials): SiteRuntimeInfo;
  fetchAccount(credentials: LoginCredentials, context: SiteRequestContext): Promise<SiteAccountSnapshot>;
  fetchModels(credentials: LoginCredentials, fetchImpl: FetchLike): Promise<SiteModel[]>;
  buildProviderEnv(credentials: LoginCredentials): Record<string, string>;
}
```

`SiteRequestContext` contains the edition-resolved panel URL and injected fetch implementation. `SiteAccountSnapshot` contains `email`, `displayName`, `availableBalance`, optional `usedBalance`, optional `requestCount`, and a `CurrencyConfig`. `SiteModel` contains `id`, `name`, `providerId`, optional context limit, and optional reasoning support.

Implement `fetchOpenAICompatibleModels()` once and use it from both adapters. It validates HTTP status and `{ data: [{ id }] }`, attaches the adapter's provider ID, and rejects malformed or empty model lists when `requireNonEmpty` is true. Implement the OA adapter by delegating to existing new-api balance/currency functions and this shared model loader. Do not move OA login request parsing into the adapter in this task.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run:

```bash
cd ui/desktop
pnpm vitest run src/siteRuntime/registry.test.ts src/siteRuntime/gatewayModels.test.ts src/siteRuntime/oaAdapter.test.ts src/balance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add ui/desktop/src/siteRuntime/registry.ts ui/desktop/src/siteRuntime/registry.test.ts ui/desktop/src/siteRuntime/gatewayModels.ts ui/desktop/src/siteRuntime/gatewayModels.test.ts ui/desktop/src/siteRuntime/oaAdapter.ts ui/desktop/src/siteRuntime/oaAdapter.test.ts
git commit -m "feat(auth): add site runtime adapter registry"
```

### Task 3: Implement the sub2api Account, Group, Key, and Model Adapter

**Files:**

- Modify: `ui/desktop/src/sub2apiAuth.ts`
- Modify: `ui/desktop/src/sub2apiAuth.test.ts`
- Create: `ui/desktop/src/siteRuntime/sub2apiAdapter.ts`
- Create: `ui/desktop/src/siteRuntime/sub2apiAdapter.test.ts`

**Interfaces:**

- Produces `Sub2apiAccount`, `Sub2apiGroup`, `fetchSub2apiCurrentUser()`, `fetchSub2apiGroups()`, and `provisionSub2apiGroup()`.
- Registers `sub2apiAdapter: SiteAdapter` for account refresh, provider environment, and model loading.
- `provisionSub2apiGroup()` returns normalized credentials and the verified non-empty model catalog.

- [ ] **Step 1: Write failing sub2api contract tests**

Add independent tests for:

```ts
expect(await fetchSub2apiCurrentUser(panelUrl, 'jwt', fetchMock)).toEqual({
  email: 'alice@example.com',
  displayName: 'alice',
  balance: 12.34,
});

expect(await fetchSub2apiGroups(panelUrl, 'jwt', fetchMock)).toEqual([
  { id: '7', name: 'Composite' },
]);
```

For provisioning, assert the query includes `group_id=7`, an ungrouped exact-name Key is ignored, and creation sends:

```ts
expect.objectContaining({
  method: 'POST',
  body: JSON.stringify({ name: 'AIBuddy', group_id: 7 }),
})
```

Also cover missing email, invalid balance, zero groups, invalid group selection, model HTTP failure, malformed model data, and empty model data.

- [ ] **Step 2: Run sub2api tests to verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run src/sub2apiAuth.test.ts src/siteRuntime/sub2apiAdapter.test.ts
```

Expected: FAIL because current provisioning has no account/group stage and creates an ungrouped Key.

- [ ] **Step 3: Implement sub2api authenticated operations**

Reuse `requestEnvelope()` for panel JWT calls. Derive the display name only with:

```ts
function emailPrefix(email: string): string {
  return email.slice(0, email.indexOf('@'));
}
```

Require one non-empty prefix and a finite numeric `balance`. Parse available groups to string IDs and display names. Change Key lookup to include and verify `group_id`; create with numeric `group_id` and the existing stable idempotency key.

After obtaining the Key, call normalized `${settings.apiBaseUrl}/v1/models`; require at least one valid string model ID. Build normalized credentials with `siteKind: 'sub2api'`, provider ID `aibuddy`, account email, and selected target.

- [ ] **Step 4: Implement and register the sub2api adapter**

`fetchAccount()` calls `/api/v1/auth/me` with `credentials.session.accessToken`, returns USD currency config with `quotaPerUnit: 1`, and leaves used/request fields absent. `fetchModels()` calls the selected gateway with `credentials.gateway.apiKey`. `buildProviderEnv()` returns only:

```ts
{
  AIBUDDY_BASE_URL: credentials.gateway.baseUrl,
  AIBUDDY_API_KEY: credentials.gateway.apiKey,
  GOOSE_PROVIDER: 'aibuddy',
}
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
cd ui/desktop
pnpm vitest run src/sub2apiAuth.test.ts src/siteRuntime/sub2apiAdapter.test.ts src/siteRuntime/registry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add ui/desktop/src/sub2apiAuth.ts ui/desktop/src/sub2apiAuth.test.ts ui/desktop/src/siteRuntime/sub2apiAdapter.ts ui/desktop/src/siteRuntime/sub2apiAdapter.test.ts
git commit -m "feat(auth): add group-scoped sub2api adapter"
```

### Task 4: Keep tflow Tokens in the Main-Process Login Flow

**Files:**

- Create: `ui/desktop/src/siteRuntime/aibuddyLoginFlow.ts`
- Create: `ui/desktop/src/siteRuntime/aibuddyLoginFlow.test.ts`
- Modify: `ui/desktop/src/aibuddyAuthIpc.ts`
- Modify: `ui/desktop/src/aibuddyAuthIpc.test.ts`
- Modify: `ui/desktop/src/main.ts`
- Modify: `ui/desktop/src/preload.ts`
- Modify: `ui/desktop/src/preload.loginIpc.test-d.ts`

**Interfaces:**

- Produces opaque `flowId` results for `totp-required` and `group-selection-required`.
- Produces `selectAIBuddyGroup(flowId, groupId)` IPC; successful selection writes credentials in the main process and returns `{ ok: true, step: 'authenticated' }` without credentials.
- Consumes `writeCredentials()` and the sub2api functions from Tasks 1 and 3.

- [ ] **Step 1: Write failing flow tests**

Test these state transitions using injected fetch, UUID, clock, and credential writer:

```text
account login -> group-selection-required
account login -> totp-required -> group-selection-required
group selection -> provision -> credentials written -> authenticated
unknown/expired flow ID -> failure without fetch or write
group not in flow targets -> failure without Key creation
provision failure -> flow remains retryable
successful completion -> flow removed and cannot be replayed
```

Assert returned renderer results contain no `accessToken`, `apiKey`, `session`, or `gateway` property.

- [ ] **Step 2: Run flow and IPC tests to verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run src/siteRuntime/aibuddyLoginFlow.test.ts src/aibuddyAuthIpc.test.ts
pnpm run typecheck
```

Expected: FAIL because current IPC returns provisioned credentials directly and has no group-selection channel.

- [ ] **Step 3: Implement the expiring flow coordinator**

Store only main-process flow state:

```ts
interface PendingAIBuddyFlow {
  accessToken?: string;
  tempToken?: string;
  account?: Sub2apiAccount;
  groups?: Sub2apiGroup[];
  expiresAt: number;
}
```

Use a 10-minute expiry, delete expired entries on every operation, and use opaque UUID flow IDs. TOTP transitions replace the temporary token with the access token. Group selection verifies membership, provisions the group, writes normalized credentials through an injected callback, and clears the flow only after a successful write.

- [ ] **Step 4: Wire generic persistence into AIBuddy IPC**

Pass `credentialsWriter` from `main.ts` into `registerAIBuddyAuthIpc()`. Add `select-aibuddy-group`, update preload result types, and remove renderer-visible `creds` from AIBuddy authentication results. Keep OA IPC unchanged.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
cd ui/desktop
pnpm vitest run src/siteRuntime/aibuddyLoginFlow.test.ts src/aibuddyAuthIpc.test.ts src/oaLogin.test.ts
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add ui/desktop/src/siteRuntime/aibuddyLoginFlow.ts ui/desktop/src/siteRuntime/aibuddyLoginFlow.test.ts ui/desktop/src/aibuddyAuthIpc.ts ui/desktop/src/aibuddyAuthIpc.test.ts ui/desktop/src/main.ts ui/desktop/src/preload.ts ui/desktop/src/preload.loginIpc.test-d.ts
git commit -m "feat(auth): coordinate AIBuddy group login in main process"
```

### Task 5: Add the AIBuddy Group Selection UI

**Files:**

- Modify: `ui/desktop/src/components/auth/AIBuddyLoginForm.tsx`
- Modify: `ui/desktop/src/components/auth/AIBuddyLoginForm.test.tsx`
- Modify: `ui/desktop/src/components/auth/LoginView.test.tsx`

**Interfaces:**

- Consumes the opaque flow results and `window.electron.selectAIBuddyGroup()` from Task 4.
- Produces an account, TOTP, or group-selection renderer state; only successful group provisioning restarts the app.

- [ ] **Step 1: Write failing group-selection UI tests**

Add integration cases for:

```ts
expect(await screen.findByRole('combobox', { name: 'Model group' })).toBeInTheDocument();
expect(screen.getByText('alice')).toBeInTheDocument();
expect(restartApp).not.toHaveBeenCalled();

await userEvent.selectOptions(groupSelect, '7');
await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
expect(selectAIBuddyGroup).toHaveBeenCalledWith('flow-id', '7');
expect(restartApp).toHaveBeenCalledTimes(1);
```

Cover zero groups, retryable provisioning error, duplicate submission prevention, return-to-login cleanup, and TOTP-to-group transition.

- [ ] **Step 2: Run component tests to verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run src/components/auth/AIBuddyLoginForm.test.tsx src/components/auth/LoginView.test.tsx
```

Expected: FAIL because successful login currently persists credentials and restarts immediately.

- [ ] **Step 3: Implement the group-selection state**

Extend `LoginStep` with:

```ts
{
  kind: 'group';
  flowId: string;
  displayName: string;
  groups: { id: string; name: string }[];
}
```

Render a labeled group option control using the existing UI primitives. Preselect the only group but still require Continue. Keep errors inside the group state; disable Continue while submitting; call only `selectAIBuddyGroup()` and `restartApp()` on success. Do not call `setLoginCredentials()` in the AIBuddy form.

- [ ] **Step 4: Run component tests to verify GREEN**

Run:

```bash
cd ui/desktop
pnpm vitest run src/components/auth/AIBuddyLoginForm.test.tsx src/components/auth/LoginView.test.tsx src/components/auth/AliyunCaptcha.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add ui/desktop/src/components/auth/AIBuddyLoginForm.tsx ui/desktop/src/components/auth/AIBuddyLoginForm.test.tsx ui/desktop/src/components/auth/LoginView.test.tsx
git commit -m "feat(auth): select tflow model group during login"
```

### Task 6: Inject an Independent AIBuddy Provider Runtime

**Files:**

- Create: `crates/goose-providers/src/declarative/definitions/aibuddy.json`
- Modify: `crates/goose-providers/src/declarative.rs`
- Modify: `ui/desktop/src/gooseServeEnv.ts`
- Modify: `ui/desktop/src/gooseServeEnv.test.ts`
- Modify: `ui/desktop/src/main.ts`

**Interfaces:**

- Produces declarative provider ID `aibuddy` with `AIBUDDY_BASE_URL` and `AIBUDDY_API_KEY`.
- Replaces `buildHeyBuddyEnv()` with registry-backed `buildSiteProviderEnv()`.

- [ ] **Step 1: Write failing provider and environment tests**

Add a Rust test matching the existing HeyBuddy assertion:

```rust
assert_eq!(config["name"], "aibuddy");
assert_eq!(config["engine"], "openai");
assert_eq!(config["api_key_env"], "AIBUDDY_API_KEY");
assert_eq!(config["base_url"], "${AIBUDDY_BASE_URL}");
assert_eq!(config["dynamic_models"], true);
```

Add TypeScript tests proving OA emits only `HEYBUDDY_*`, sub2api emits only `AIBUDDY_*`, neither emits session tokens, and null credentials emit `{}`.

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run src/gooseServeEnv.test.ts
```

Run:

```bash
cargo test -p goose-providers declarative::tests::aibuddy_provider_is_bundled_and_valid
```

Expected: FAIL because `aibuddy` and generic environment dispatch do not exist.

- [ ] **Step 3: Add the declarative provider and environment dispatch**

Copy only the OpenAI-compatible capabilities of `heybuddy.json`, changing provider identity, display text, and environment names. Expose `aibuddy` in `expose_declarative_providers!`. Make `buildSiteProviderEnv()` retrieve the adapter by `credentials.siteKind` and delegate `buildProviderEnv()`.

Update `main.ts` to pass the resulting environment into `startGooseServe()`.

- [ ] **Step 4: Run focused tests to verify GREEN and format Rust**

Run:

```bash
cd ui/desktop
pnpm vitest run src/gooseServeEnv.test.ts src/siteRuntime/registry.test.ts
```

Run:

```bash
cargo fmt
cargo test -p goose-providers declarative::tests::aibuddy_provider_is_bundled_and_valid
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add crates/goose-providers/src/declarative/definitions/aibuddy.json crates/goose-providers/src/declarative.rs ui/desktop/src/gooseServeEnv.ts ui/desktop/src/gooseServeEnv.test.ts ui/desktop/src/main.ts
git commit -m "feat(provider): isolate AIBuddy tflow runtime"
```

### Task 7: Route Account, Balance, and Model IPC Through the Adapter

**Files:**

- Modify: `ui/desktop/src/balance.ts`
- Modify: `ui/desktop/src/balance.test.ts`
- Modify: `ui/desktop/src/main.ts`
- Modify: `ui/desktop/src/preload.ts`
- Modify: `ui/desktop/src/preload.loginIpc.test-d.ts`
- Modify: `ui/desktop/src/components/Layout/BalanceWidget.tsx`
- Modify: `ui/desktop/src/components/Layout/BalanceWidget.test.tsx`
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.test.tsx`
- Modify: `ui/desktop/src/components/ModelAndProviderContext.tsx`
- Modify: `ui/desktop/src/components/ModelAndProviderContext.test.tsx`
- Modify: `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx`
- Modify: `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx`

**Interfaces:**

- `get-user-balance` delegates `fetchAccount()` to the stored credential's adapter.
- `get-site-runtime-info` returns only `{ siteKind, providerId, targetName? }`.
- `list-models-via-api` delegates `fetchModels()` and returns models carrying `providerId`.

- [ ] **Step 1: Write failing account and balance tests**

Change `BalanceData.usedQuota` and `requestCount` to optional. Add tests proving an AIBuddy account result displays `alice` and `$12.34`, renders the balance widget, and omits Used/Requests tooltip lines when absent. Retain all HeyBuddy quota/currency assertions.

- [ ] **Step 2: Write failing model/provider tests**

Add cases where model IPC data is:

```ts
[{ id: 'gpt-5.6', name: 'gpt-5.6', providerId: 'aibuddy', contextLimit: null, reasoning: true }]
```

Expect fallback defaults to call `acpSaveDefaults('aibuddy', 'gpt-5.6')`. When ACP contains legacy `heybuddy` defaults but runtime info says `aibuddy`, expect correction to `aibuddy` and a valid tflow model. Verify the switch modal preserves each model's returned `providerId` rather than hardcoding `heybuddy`.

- [ ] **Step 3: Run account and model tests to verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run src/balance.test.ts src/components/Layout/BalanceWidget.test.tsx src/components/Layout/UserAccountMenu.test.tsx src/components/ModelAndProviderContext.test.tsx src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx
```

Expected: FAIL because AIBuddy balance is hidden and model/provider data is not adapter-derived.

- [ ] **Step 4: Implement adapter-backed IPC**

In `main.ts`, read normalized credentials once per handler, resolve the adapter from the registry, and delegate. Map `SiteAccountSnapshot` to `BalanceResult`; return not-logged-in before adapter lookup. Remove inline new-api and `/models` fetch logic from IPC handlers.

Expose `getSiteRuntimeInfo()` and extend model result typing with `providerId`; never expose tokens or API keys.

- [ ] **Step 5: Update renderer account and model consumers**

Remove the AIBuddy early return from `BalanceWidget`. Build Tooltip details from fields that are present. In `ModelAndProviderContext`, compare ACP defaults with `getSiteRuntimeInfo().providerId`; when missing or mismatched, load models and persist the first valid model for the runtime provider. Use `model.providerId` in `SwitchModelModal` mapping.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
cd ui/desktop
pnpm vitest run src/balance.test.ts src/hooks/useBalance.test.ts src/components/Layout/BalanceWidget.test.tsx src/components/Layout/UserAccountMenu.test.tsx src/components/ModelAndProviderContext.test.tsx src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add ui/desktop/src/balance.ts ui/desktop/src/balance.test.ts ui/desktop/src/main.ts ui/desktop/src/preload.ts ui/desktop/src/preload.loginIpc.test-d.ts ui/desktop/src/components/Layout/BalanceWidget.tsx ui/desktop/src/components/Layout/BalanceWidget.test.tsx ui/desktop/src/components/Layout/UserAccountMenu.test.tsx ui/desktop/src/components/ModelAndProviderContext.tsx ui/desktop/src/components/ModelAndProviderContext.test.tsx ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx
git commit -m "feat(runtime): route account and models by site adapter"
```

### Task 8: Integration, Coverage, and Local AIBuddy Package

**Files:**

- Modify: `ui/desktop/src/App.test.tsx`
- Modify: `ui/desktop/src/components/auth/LoginView.test.tsx`
- Modify only if present after branch updates: `goose-self-test.yaml`

**Interfaces:**

- Verifies the complete AIBuddy edition path and OA isolation.
- Produces a locally signed AIBuddy application for manual verification.

- [ ] **Step 1: Add failing integration assertions**

Cover this observable sequence:

```text
AIBuddy route -> captcha login -> optional TOTP -> group selection -> main-process persistence -> restart
restart -> aibuddy provider runtime -> tflow account summary -> tflow models -> aibuddy model default
HeyBuddy route -> OA login -> heybuddy provider runtime with no tflow calls
```

Use existing test seams; do not add production-only test hooks.

- [ ] **Step 2: Run integration tests to verify RED, then implement only missing glue**

Run:

```bash
cd ui/desktop
pnpm vitest run src/App.test.tsx src/components/auth/LoginView.test.tsx src/aibuddyAuthIpc.test.ts src/siteRuntime/aibuddyLoginFlow.test.ts
```

Expected before glue: at least one new end-to-end state assertion fails. Add only the missing wiring and rerun until PASS.

- [ ] **Step 3: Run the complete focused suite**

Run:

```bash
cd ui/desktop
pnpm vitest run src/authConfig.test.ts src/credentials.test.ts src/oaLogin.test.ts src/sub2apiAuth.test.ts src/aibuddyAuthIpc.test.ts src/siteRuntime/registry.test.ts src/siteRuntime/gatewayModels.test.ts src/siteRuntime/oaAdapter.test.ts src/siteRuntime/sub2apiAdapter.test.ts src/siteRuntime/aibuddyLoginFlow.test.ts src/gooseServeEnv.test.ts src/balance.test.ts src/hooks/useBalance.test.ts src/components/auth/AliyunCaptcha.test.tsx src/components/auth/AIBuddyLoginForm.test.tsx src/components/auth/LoginView.test.tsx src/components/Layout/BalanceWidget.test.tsx src/components/Layout/UserAccountMenu.test.tsx src/components/ModelAndProviderContext.test.tsx src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx src/App.test.tsx
```

Expected: PASS with no new warnings beyond repository-known toolchain warnings.

- [ ] **Step 4: Measure path coverage**

Run:

```bash
cd ui/desktop
pnpm vitest run --coverage src/sub2apiAuth.test.ts src/siteRuntime/registry.test.ts src/siteRuntime/gatewayModels.test.ts src/siteRuntime/oaAdapter.test.ts src/siteRuntime/sub2apiAdapter.test.ts src/siteRuntime/aibuddyLoginFlow.test.ts src/components/auth/AIBuddyLoginForm.test.tsx src/components/Layout/BalanceWidget.test.tsx src/components/ModelAndProviderContext.test.tsx
```

Expected: at least 80% branch/path coverage for every new or materially changed runtime module. Add one behavior-focused failing test at a time for uncovered paths, then rerun.

- [ ] **Step 5: Run static and formatting checks**

Run:

```bash
cd ui/desktop
pnpm run typecheck
pnpm prettier --check src
```

Run:

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
git diff --check
```

Expected: PASS. The repository currently has no `goose-self-test.yaml`; if it remains absent, record that fact instead of inventing a new recipe unrelated to this UI flow.

- [ ] **Step 6: Build and launch the AIBuddy package**

Run:

```bash
source bin/activate-hermit
just package-ui aibuddy
```

Verify:

```bash
codesign --verify --deep --strict ui/desktop/out/AIBuddy-darwin-arm64/AIBuddy.app
plutil -extract CFBundleIdentifier raw -o - ui/desktop/out/AIBuddy-darwin-arm64/AIBuddy.app/Contents/Info.plist
```

Expected Bundle ID: `com.electron.aibuddy`.

- [ ] **Step 7: Commit Task 8**

```bash
git add ui/desktop/src/App.test.tsx ui/desktop/src/components/auth/LoginView.test.tsx
git commit -m "test(auth): verify isolated AIBuddy tflow runtime"
```
