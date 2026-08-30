# AIBuddy sub2api Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AIBuddy desktop edition authenticate against tflow.online with Aliyun Captcha, provision a reusable AIBuddy API key, and preserve the HeyBuddy OA flow.

**Architecture:** Brand configuration selects an `oa` or `sub2api` main-process adapter. A focused sub2api HTTP module owns settings, login, TOTP, and API-key provisioning; narrow Electron IPC methods expose it to the renderer. The renderer uses a standalone Aliyun Captcha component and an AIBuddy form, while the existing `LoginView` only chooses the edition-specific form.

**Tech Stack:** Electron, React 18, TypeScript, Vite, Vitest, React Testing Library, Aliyun Captcha 2.0 browser SDK.

## Global Constraints

- HeyBuddy remains on OA authentication at `https://ai.linyeyun.cn`.
- AIBuddy uses sub2api authentication at `https://tflow.online`.
- Aliyun `captchaVerifyParam` is sent as `turnstile_token`.
- Reuse an exact-name active `AIBuddy` API key; create one only after a successful empty query.
- API-key creation sends a stable per-provisioning-flow `Idempotency-Key`.
- Persist the model endpoint as `<api_base_url>/v1` and the complete returned API key.
- Legacy credentials without `authKind` remain valid and are treated as OA credentials.
- AIBuddy does not show the new-api-only balance widget.
- Functional code receives unit tests with at least 80% path coverage.
- Do not modify the legacy or state-machine agent loops.

---

### Task 1: Edition-Specific Authentication Configuration

**Files:**

- Modify: `ui/desktop/branding/brands.json`
- Modify: `ui/desktop/scripts/brand.test.js`
- Modify: `ui/desktop/src/authConfig.ts`
- Modify: `ui/desktop/src/authConfig.test.ts`
- Modify: `ui/desktop/vite.main.config.mts`

**Interfaces:**

- Produces brand fields `authMode: 'oa' | 'sub2api'` and `authApiBaseUrl: string`.
- Produces `AuthConfig.mode`, `resolveAuthApiBaseUrl(environment, edition, fallback)`, and `resolveAuthMode(edition)`.
- AIBuddy consumes `AIBUDDY_AUTH_API_BASE_URL`; HeyBuddy continues to consume `HEYBUDDY_AUTH_API_BASE_URL`.

- [ ] **Step 1: Extend brand expectations with authentication metadata**

Add expected fields to both records in `scripts/brand.test.js`:

```js
authMode: 'oa',
authApiBaseUrl: 'https://ai.linyeyun.cn',
```

and:

```js
authMode: 'sub2api',
authApiBaseUrl: 'https://tflow.online',
```

- [ ] **Step 2: Add failing auth-config tests**

Cover these exact cases in `src/authConfig.test.ts`:

```ts
expect(resolveAuthApiBaseUrl({}, 'aibuddy')).toBe('https://tflow.online');
expect(
  resolveAuthApiBaseUrl({ HEYBUDDY_AUTH_API_BASE_URL: 'https://oa.example' }, 'aibuddy')
).toBe('https://tflow.online');
expect(
  resolveAuthApiBaseUrl({ AIBUDDY_AUTH_API_BASE_URL: 'https://api.example' }, 'aibuddy')
).toBe('https://api.example');
expect(resolveAuthMode('aibuddy')).toBe('sub2api');
expect(resolveAuthMode('heybuddy')).toBe('oa');
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
cd ui/desktop
pnpm vitest run scripts/brand.test.js src/authConfig.test.ts
```

Expected: FAIL because the brand fields and edition-aware resolver do not exist.

- [ ] **Step 4: Implement edition-specific config**

Add the two fields to `brands.json`. Define:

```ts
export type AuthMode = 'oa' | 'sub2api';
export interface AuthEnvironment {
  HEYBUDDY_AUTH_API_BASE_URL?: string;
  AIBUDDY_AUTH_API_BASE_URL?: string;
}
export function resolveAuthApiBaseUrl(
  environment: AuthEnvironment,
  edition: AppEdition = 'heybuddy',
  fallback?: string
): string;
export function resolveAuthMode(edition: AppEdition): AuthMode;
```

Update `vite.main.config.mts` to resolve the selected brand from `APP_EDITION`, inject the selected mode and URL, and ensure the global production `.env` HeyBuddy value cannot override AIBuddy.

- [ ] **Step 5: Run the tests and verify GREEN**

Run the command from Step 3. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/desktop/branding/brands.json ui/desktop/scripts/brand.test.js ui/desktop/src/authConfig.ts ui/desktop/src/authConfig.test.ts ui/desktop/vite.main.config.mts
git commit -m "feat(auth): configure authentication per desktop edition"
```

### Task 2: sub2api Authentication and API-Key Provisioning Client

**Files:**

- Create: `ui/desktop/src/sub2apiAuth.ts`
- Create: `ui/desktop/src/sub2apiAuth.test.ts`
- Modify: `ui/desktop/src/credentials.ts`
- Modify: `ui/desktop/src/credentials.test.ts`

**Interfaces:**

- Produces `Sub2apiPublicSettings`, `Sub2apiLoginStep`, `AIBuddyAuthResult`, and `AIBuddySettingsResult`.
- Produces `fetchSub2apiPublicSettings()`, `startSub2apiLogin()`, `completeSub2apiTotp()`, `provisionAIBuddyCredentials()`, `authenticateAIBuddy()`, and `completeAIBuddyAuthentication()`.
- Extends `LoginCredentials` with optional `authKind?: 'oa' | 'sub2api'`.

Use these exact IPC-facing result types:

```ts
export type AIBuddySettingsResult =
  | { ok: true; settings: Sub2apiPublicSettings }
  | { ok: false; message: string; reason?: string };

export type AIBuddyAuthResult =
  | { ok: true; step: 'authenticated'; creds: LoginCredentials }
  | {
      ok: true;
      step: 'totp-required';
      tempToken: string;
      maskedEmail?: string;
    }
  | { ok: false; message: string; reason?: string };
```

`authenticateAIBuddy()` fetches current settings, starts password login, and provisions credentials unless TOTP is required. `completeAIBuddyAuthentication()` completes TOTP, fetches current settings, and provisions credentials. Both convert thrown protocol errors to the result union.

- [ ] **Step 1: Write failing public-settings and login request tests**

Use injected `FetchLike` responses to assert:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  'https://tflow.online/api/v1/auth/login',
  expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'secret',
      turnstile_token: 'captcha-param',
    }),
  })
);
```

Also cover settings extraction, timeout, network failure, non-JSON response, nonzero envelope code, and missing required fields.

- [ ] **Step 2: Write failing normal-login and TOTP tests**

Assert a normal response returns `{ kind: 'authenticated', accessToken }`, while a `requires_2fa` response returns:

```ts
{
  kind: 'totp-required',
  tempToken: 'temp-token',
  maskedEmail: 'u***@example.com',
}
```

Assert `completeSub2apiTotp()` POSTs `temp_token` and a six-digit `totp_code` without a captcha field.

- [ ] **Step 3: Write failing API-key provisioning tests**

Cover four independent paths:

1. Exact-name active `AIBuddy` key is reused.
2. Partial-name results are ignored and POST creates `{ name: 'AIBuddy' }`.
3. Empty successful query creates with `Authorization: Bearer <token>` and `Idempotency-Key`.
4. Query errors do not issue POST; missing `key` or `api_base_url` rejects without credentials.

Expected credentials:

```ts
{
  token: 'access-token',
  baseUrl: 'https://tflow.online/v1',
  apiKey: 'sk-aibuddy',
  authKind: 'sub2api',
}
```

- [ ] **Step 4: Run the tests and verify RED**

```bash
cd ui/desktop
pnpm vitest run src/sub2apiAuth.test.ts src/credentials.test.ts
```

Expected: FAIL because the module and `authKind` contract do not exist.

- [ ] **Step 5: Implement the protocol module**

Use one envelope parser for `{ code, message, reason, data }`. Normalize panel URLs by removing trailing slashes and gateway URLs by appending exactly one `/v1`. Keep fetch, timeout, and idempotency-key generation injectable. Do not log passwords, access tokens, captcha proofs, or API keys.

- [ ] **Step 6: Run the tests and verify GREEN**

Run the command from Step 4. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/desktop/src/sub2apiAuth.ts ui/desktop/src/sub2apiAuth.test.ts ui/desktop/src/credentials.ts ui/desktop/src/credentials.test.ts
git commit -m "feat(auth): add sub2api authentication client"
```

### Task 3: Electron IPC Boundary for AIBuddy Authentication

**Files:**

- Modify: `ui/desktop/src/main.ts`
- Modify: `ui/desktop/src/preload.ts`
- Modify: `ui/desktop/src/preload.loginIpc.test-d.ts`
- Modify: `ui/desktop/src/oaLogin.ts`
- Modify: `ui/desktop/src/oaLogin.test.ts`

**Interfaces:**

- Produces renderer methods:
  - `getAIBuddyAuthSettings(): Promise<AIBuddySettingsResult>`
  - `loginViaAIBuddy(email, password, captchaProof): Promise<AIBuddyAuthResult>`
  - `completeAIBuddy2FA(tempToken, totpCode): Promise<AIBuddyAuthResult>`
- HeyBuddy `loginViaOA()` remains unchanged externally and now writes `authKind: 'oa'`.

- [ ] **Step 1: Add failing type-contract assertions**

Extend `preload.loginIpc.test-d.ts` with `expectTypeOf` assertions for all three methods and their exact Promise results.

- [ ] **Step 2: Add the failing OA credential regression assertion**

Update the OA success test to expect:

```ts
expect(result.authKind).toBe('oa');
```

- [ ] **Step 3: Run typecheck and OA test to verify RED**

```bash
cd ui/desktop
pnpm run typecheck
pnpm vitest run src/oaLogin.test.ts
```

Expected: typecheck and OA test fail on missing IPC members and `authKind`.

- [ ] **Step 4: Wire narrow IPC handlers**

In `main.ts`, register the three channels during main-process initialization. Each handler delegates to the tested sub2api functions using `authConfig.apiBaseUrl`, Electron `net.fetch`, and `crypto.randomUUID()`. Use result wrappers so business errors reach the renderer without Electron's remote-method prefix.

In `preload.ts`, expose only the three typed methods. Do not expose arbitrary URLs, headers, or fetch primitives.

- [ ] **Step 5: Run typecheck and tests to verify GREEN**

```bash
cd ui/desktop
pnpm run typecheck
pnpm vitest run src/oaLogin.test.ts src/sub2apiAuth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/desktop/src/main.ts ui/desktop/src/preload.ts ui/desktop/src/preload.loginIpc.test-d.ts ui/desktop/src/oaLogin.ts ui/desktop/src/oaLogin.test.ts
git commit -m "feat(auth): expose AIBuddy authentication over IPC"
```

### Task 4: Aliyun Captcha React Control and CSP

**Files:**

- Create: `ui/desktop/src/components/auth/AliyunCaptcha.tsx`
- Create: `ui/desktop/src/components/auth/AliyunCaptcha.test.tsx`
- Modify: `ui/desktop/src/vite-env.d.ts`
- Modify: `ui/desktop/src/utils/csp.ts`
- Modify: `ui/desktop/src/utils/__tests__/csp.test.ts`
- Modify: `ui/desktop/index.html`

**Interfaces:**

- Produces `AliyunCaptchaHandle` with `verify(): Promise<string | null>` and `reset(): void`.
- Consumes `sceneId`, `prefix`, and `region: 'cn' | 'sgp'`.
- Emits user-visible states `idle`, `verifying`, and `verified` through the rendered control.

- [ ] **Step 1: Write failing SDK initialization and verification tests**

Mock `window.initAliyunCaptcha` and assert the component sets:

```ts
window.AliyunCaptchaConfig = { region: 'cn', prefix: 'prefix-1' };
```

Assert SDK options use popup mode, SceneId, element/button selectors, and return `{ captchaResult: true }` after emitting the proof.

- [ ] **Step 2: Write failing lifecycle tests**

Cover cached proof reuse, programmatic verification, popup close returning `null`, `reset()` invalidating a proof, script load failure, and unmount cleanup of timers plus `aliyunCaptcha-window-popup` and `aliyunCaptcha-mask`.

- [ ] **Step 3: Add failing CSP assertions**

Assert dynamic CSP contains `https://*.alicdn.com` in `script-src` and `style-src`, while retaining the current connect and frame policies.

- [ ] **Step 4: Run tests and verify RED**

```bash
cd ui/desktop
pnpm vitest run src/components/auth/AliyunCaptcha.test.tsx src/utils/__tests__/csp.test.ts
```

Expected: FAIL because the component and CDN sources do not exist.

- [ ] **Step 5: Implement the component and CSP allowlist**

Port the behavior of sub2api's `AliyunCaptchaWidget.vue` without Vue dependencies. Load `https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js` once, configure before loading, use Lucide status icons, and keep the control at a stable full width and minimum height.

Update both runtime `buildCSP()` and the initial HTML meta policy so the first script load is allowed.

- [ ] **Step 6: Run tests and verify GREEN**

Run the command from Step 4. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/desktop/src/components/auth/AliyunCaptcha.tsx ui/desktop/src/components/auth/AliyunCaptcha.test.tsx ui/desktop/src/vite-env.d.ts ui/desktop/src/utils/csp.ts ui/desktop/src/utils/__tests__/csp.test.ts ui/desktop/index.html
git commit -m "feat(auth): add Aliyun captcha control"
```

### Task 5: AIBuddy Login and TOTP UI

**Files:**

- Create: `ui/desktop/src/components/auth/AIBuddyLoginForm.tsx`
- Create: `ui/desktop/src/components/auth/AIBuddyLoginForm.test.tsx`
- Modify: `ui/desktop/src/components/auth/LoginView.tsx`
- Modify: `ui/desktop/src/components/auth/LoginView.test.tsx`

**Interfaces:**

- `AIBuddyLoginForm` consumes only the typed preload methods and `AliyunCaptchaHandle`.
- `LoginView` selects `AIBuddyLoginForm` for `APP_EDITION=aibuddy`; the inline OA form remains the HeyBuddy branch.
- Both branches persist `LoginCredentials` and call `restartApp()` after complete authentication.

- [ ] **Step 1: Preserve the OA flow with an edition regression test**

Set `APP_EDITION=heybuddy` and retain the existing assertion that `login('seeyon6', 'test@1234')` is called and credentials are written.

- [ ] **Step 2: Write failing AIBuddy settings and login tests**

Set `APP_EDITION=aibuddy`, mock public settings with Aliyun enabled, and assert:

- The page labels the identifier as email and displays AIBuddy.
- OA `login()` is never called.
- Submit waits for a captcha proof and calls `loginViaAIBuddy(email, password, proof)`.
- Authenticated credentials are persisted and the app restarts.
- Settings load failure and incomplete Aliyun config disable submission with readable errors.

- [ ] **Step 3: Write failing TOTP tests**

Return `totp-required`, assert a stable six-digit input appears, then assert `completeAIBuddy2FA(tempToken, code)` persists returned credentials. Cover invalid code errors staying on the TOTP step and the back action returning to account login with the old captcha proof reset.

- [ ] **Step 4: Run tests and verify RED**

```bash
cd ui/desktop
pnpm vitest run src/components/auth/AIBuddyLoginForm.test.tsx src/components/auth/LoginView.test.tsx
```

Expected: FAIL because AIBuddy edition routing and form do not exist.

- [ ] **Step 5: Implement the edition-specific forms**

Use existing `Card`, `Input`, and `Button` primitives. Keep fixed button/control dimensions, use the brand title, prevent duplicate submissions, reset one-time captcha proof after every initial login attempt, and do not put the TOTP step inside another card.

- [ ] **Step 6: Run tests and verify GREEN**

Run the command from Step 4. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/desktop/src/components/auth/AIBuddyLoginForm.tsx ui/desktop/src/components/auth/AIBuddyLoginForm.test.tsx ui/desktop/src/components/auth/LoginView.tsx ui/desktop/src/components/auth/LoginView.test.tsx
git commit -m "feat(auth): add AIBuddy login experience"
```

### Task 6: Balance Visibility and End-to-End Regression Verification

**Files:**

- Modify: `ui/desktop/src/components/Layout/BalanceWidget.tsx`
- Modify: `ui/desktop/src/components/Layout/BalanceWidget.test.tsx`

**Interfaces:**

- AIBuddy renders no new-api balance status.
- HeyBuddy retains every existing balance state and refresh behavior.

- [ ] **Step 1: Write a failing AIBuddy visibility test**

With `APP_EDITION=aibuddy`, render `BalanceWidget` and assert `data-testid="balance-widget"` is absent and `getUserBalance` is not called. Retain the existing HeyBuddy path assertions with `APP_EDITION=heybuddy`.

- [ ] **Step 2: Run the test and verify RED**

```bash
cd ui/desktop
pnpm vitest run src/components/Layout/BalanceWidget.test.tsx
```

Expected: FAIL because the widget still fetches new-api balance for AIBuddy.

- [ ] **Step 3: Implement the edition guard**

Return `null` before invoking `useBalance` for AIBuddy by splitting the hook-using HeyBuddy implementation into a child component; this preserves React hook ordering.

- [ ] **Step 4: Run focused tests and coverage**

```bash
cd ui/desktop
pnpm vitest run \
  scripts/brand.test.js \
  src/authConfig.test.ts \
  src/sub2apiAuth.test.ts \
  src/oaLogin.test.ts \
  src/credentials.test.ts \
  src/components/auth/AliyunCaptcha.test.tsx \
  src/components/auth/AIBuddyLoginForm.test.tsx \
  src/components/auth/LoginView.test.tsx \
  src/components/Layout/BalanceWidget.test.tsx \
  src/utils/__tests__/csp.test.ts
pnpm vitest run --coverage \
  src/sub2apiAuth.test.ts \
  src/components/auth/AliyunCaptcha.test.tsx \
  src/components/auth/AIBuddyLoginForm.test.tsx
```

Expected: all tests pass and changed functional modules reach at least 80% branch/path coverage.

- [ ] **Step 5: Run type and formatting verification**

```bash
cd ui/desktop
pnpm run typecheck
pnpm exec prettier --check \
  branding/brands.json \
  scripts/brand.test.js \
  src/authConfig.ts \
  src/authConfig.test.ts \
  src/sub2apiAuth.ts \
  src/sub2apiAuth.test.ts \
  src/credentials.ts \
  src/credentials.test.ts \
  src/preload.ts \
  src/preload.loginIpc.test-d.ts \
  src/oaLogin.ts \
  src/oaLogin.test.ts \
  src/components/auth/AliyunCaptcha.tsx \
  src/components/auth/AliyunCaptcha.test.tsx \
  src/components/auth/AIBuddyLoginForm.tsx \
  src/components/auth/AIBuddyLoginForm.test.tsx \
  src/components/auth/LoginView.tsx \
  src/components/auth/LoginView.test.tsx \
  src/components/Layout/BalanceWidget.tsx \
  src/components/Layout/BalanceWidget.test.tsx \
  src/utils/csp.ts \
  src/utils/__tests__/csp.test.ts
cd ../..
cargo fmt --check
git diff --check
```

Expected: all commands exit zero with no warnings attributable to these changes.

- [ ] **Step 6: Review scope and commit**

Confirm the diff contains no sub2api balance implementation, no backend agent-loop changes, no secrets, and no unrelated generated files.

```bash
git add ui/desktop/src/components/Layout/BalanceWidget.tsx ui/desktop/src/components/Layout/BalanceWidget.test.tsx
git commit -m "test(auth): verify AIBuddy login integration"
```
