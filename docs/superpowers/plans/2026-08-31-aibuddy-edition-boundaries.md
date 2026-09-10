# AIBuddy Edition Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AIBuddy desktop edition use its own runtime identity, show user-visible tool images, present TFlow entitlements in its account menu, and ship a clean macOS template tray icon without changing HeyBuddy behavior.

**Architecture:** Keep edition decisions at explicit boundaries: a main-process identity/migration module, a renderer brand component, a tool-result media partition, and an edition-specific account presentation. The TFlow adapter owns the `/subscriptions/progress` response contract and passes server-provided remaining USD values through to the renderer. Existing shared login, refresh-token retry, settings, and HeyBuddy balance paths remain intact.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library, Python 3/Pillow, pnpm, Electron Forge.

## Global Constraints

- Do not check upstream unless the user explicitly requests it.
- Work only on `fix/aibuddy-brand-image-account-menu` until all focused tests and checks pass.
- Preserve all HeyBuddy branding, OA credentials, balance presentation, and menu behavior.
- Set the Electron application name before the first `app.getPath('userData')` call.
- Migrate legacy HeyBuddy data only when the legacy credentials decode as AIBuddy `sub2api`; never migrate OA credentials or sessions, and never overwrite existing AIBuddy files.
- Render tool images only when annotations omit `audience` or include `user`; never show assistant-only images.
- Use TFlow's server-provided `remaining_usd`; do not derive or clamp it in the client.
- Hide subscription periods absent from the progress response.
- Keep generated menu-bar assets deterministic, RGBA, exactly 22x22 and 44x44, with transparent margins.
- All functional changes require unit tests covering at least 80% of the changed code paths.
- Do not commit `.claude/`, `.codex/`, `.pnpm-store/`, `.serena/`, `.superpowers/brainstorm/`, or the unrelated `2026-08-30` plan.
- Do not run Cargo build/test; this change is confined to the desktop UI and the user requested the macOS desktop build.

---

### Task 1: Initialize Electron identity before resolving user data paths

**Files:**
- Create: `ui/desktop/src/appIdentity.ts`
- Create: `ui/desktop/src/appIdentity.test.ts`
- Modify: `ui/desktop/src/main.ts:75-132`

**Interfaces:**
- Consumes: `getAppDisplayName(): string` from `brand.ts` and Electron's `App.setName/getPath` methods.
- Produces: `initializeAppIdentity(app): AppDataPaths`, where `AppDataPaths` contains `userDataDir`, `settingsFile`, `credentialsFile`, and `startupLogsDir`.

- [ ] **Step 1: Write the failing identity-order tests**

```ts
it('sets the AIBuddy name before reading userData', () => {
  const calls: string[] = [];
  const app = {
    setName: (name: string) => calls.push(`setName:${name}`),
    getPath: (name: string) => {
      calls.push(`getPath:${name}`);
      return '/tmp/Application Support/AIBuddy';
    },
  };

  expect(initializeAppIdentity(app)).toMatchObject({
    settingsFile: '/tmp/Application Support/AIBuddy/settings.json',
    credentialsFile: '/tmp/Application Support/AIBuddy/credentials.json',
  });
  expect(calls.slice(0, 2)).toEqual(['setName:AIBuddy', 'getPath:userData']);
});

it('uses HeyBuddy without changing its path family', () => {
  vi.stubEnv('APP_EDITION', 'heybuddy');
  const calls: string[] = [];
  const app = {
    setName: (name: string) => calls.push(`setName:${name}`),
    getPath: (name: string) => {
      calls.push(`getPath:${name}`);
      return '/tmp/Application Support/HeyBuddy';
    },
  };

  expect(initializeAppIdentity(app).userDataDir).toBe(
    '/tmp/Application Support/HeyBuddy'
  );
  expect(calls.slice(0, 2)).toEqual(['setName:HeyBuddy', 'getPath:userData']);
});
```

- [ ] **Step 2: Run the tests and confirm they fail because the module does not exist**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/appIdentity.test.ts`

Expected: FAIL with an unresolved `./appIdentity` import.

- [ ] **Step 3: Implement the identity/path module and replace main-process module constants**

```ts
export interface AppIdentityTarget {
  setName(name: string): void;
  getPath(name: 'userData'): string;
}

export function initializeAppIdentity(app: AppIdentityTarget): AppDataPaths {
  app.setName(getAppDisplayName());
  const userDataDir = app.getPath('userData');
  return {
    userDataDir,
    settingsFile: path.join(userDataDir, 'settings.json'),
    credentialsFile: path.join(userDataDir, 'credentials.json'),
    startupLogsDir: path.join(userDataDir, 'startup-logs'),
  };
}
```

Call this immediately after imports in `main.ts`, before any other `app.getPath('userData')`, and bind the existing uppercase constants from its result.

- [ ] **Step 4: Run focused tests in both editions**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/appIdentity.test.ts src/brand.test.ts`

Expected: PASS.

Run: `cd ui/desktop && APP_EDITION=heybuddy pnpm exec vitest run src/appIdentity.test.ts src/brand.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the identity boundary**

```bash
git add ui/desktop/src/appIdentity.ts ui/desktop/src/appIdentity.test.ts ui/desktop/src/main.ts
git commit -m "fix(aibuddy): initialize desktop identity before user data"
```

---

### Task 2: Migrate only confirmed AIBuddy legacy data

**Files:**
- Create: `ui/desktop/src/aibuddyDataMigration.ts`
- Create: `ui/desktop/src/aibuddyDataMigration.test.ts`
- Modify: `ui/desktop/src/credentials.ts`
- Modify: `ui/desktop/src/credentials.test.ts`
- Modify: `ui/desktop/src/main.ts`

**Interfaces:**
- Consumes: `AppEdition`, `LoginCredentials`, `CredentialsCodec`, legacy/target user-data directory paths.
- Produces: `decodeCredentialsFile(filePath, codec): LoginCredentials | null` for read-only validation and `migrateLegacyAIBuddyData(options): MigrationResult`.

- [ ] **Step 1: Add failing migration-path tests**

Cover these named paths with isolated temporary directories and direct file-content assertions:

- `migrates legacy sub2api envelope and settings into an empty AIBuddy directory`
- `migrates normalized sub2api envelope and settings into an empty AIBuddy directory`
- `does nothing in the HeyBuddy edition`
- `rejects OA credentials and does not copy settings`
- `rejects invalid credentials and leaves the target empty`
- `rejects undecryptable credentials and leaves the target empty`
- `does not overwrite an existing AIBuddy credentials file`
- `does not overwrite an existing AIBuddy settings file after credential migration`

Also add a `credentials.test.ts` assertion that `decodeCredentialsFile` reads legacy plaintext without rewriting the source file.

- [ ] **Step 2: Run the tests and confirm red behavior**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/aibuddyDataMigration.test.ts src/credentials.test.ts`

Expected: FAIL because the migration and read-only decoder are not implemented.

- [ ] **Step 3: Extract read-only credential decoding**

Refactor `readCredentials` so parsing/normalization is shared while only `readCredentials` retains the current legacy plaintext rewrite:

```ts
export function decodeCredentialsFile(
  filePath: string,
  codec: CredentialsCodec
): LoginCredentials | null;
```

The new function must never mutate `filePath`. Keep `readCredentials`, `writeCredentials`, refresh-token normalization, and file permission behavior compatible with their existing tests.

- [ ] **Step 4: Implement guarded migration with atomic destination writes**

```ts
export function migrateLegacyAIBuddyData({
  edition,
  legacyUserDataDir,
  targetUserDataDir,
  codec,
}: MigrationOptions): MigrationResult {
  // Return without writes unless edition === 'aibuddy' and target credentials are absent.
  // Decode legacy credentials read-only and require siteKind/authKind === 'sub2api'.
  // Write target credentials through writeCredentials.
  // Copy settings only after credential migration succeeds and only when target settings are absent.
}
```

Use an adjacent temporary file plus `renameSync` for the settings copy. Delete only the temporary file on failure; never touch source files or pre-existing target files.

- [ ] **Step 5: Invoke migration after AIBuddy identity resolution**

In `main.ts`, derive the legacy directory as `path.join(path.dirname(userDataDir), 'HeyBuddy')` and invoke migration before settings or credentials are first read. Log only an error when migration fails; normal login must continue.

- [ ] **Step 6: Run focused migration and credential tests**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/aibuddyDataMigration.test.ts src/credentials.test.ts src/appIdentity.test.ts`

Expected: PASS for successful migration, OA/invalid rejection, and no-overwrite paths.

- [ ] **Step 7: Commit the migration boundary**

```bash
git add ui/desktop/src/aibuddyDataMigration.ts ui/desktop/src/aibuddyDataMigration.test.ts ui/desktop/src/credentials.ts ui/desktop/src/credentials.test.ts ui/desktop/src/main.ts
git commit -m "fix(aibuddy): isolate and migrate desktop user data"
```

---

### Task 3: Render edition-specific chat branding

**Files:**
- Create: `ui/desktop/src/components/ChatBrand.tsx`
- Create: `ui/desktop/src/components/ChatBrand.test.tsx`
- Modify: `ui/desktop/src/components/BaseChat.tsx:421-432`
- Modify: `ui/desktop/src/components/BaseChat.test.tsx`

**Interfaces:**
- Consumes: `getAppEdition()` and the existing Goose/AIBuddy image assets.
- Produces: `<ChatBrand />`, responsible only for edition-specific icon, label, and destination URL.

- [ ] **Step 1: Write failing brand component tests**

```ts
it('renders AIBuddy identity and TFlow destination', () => {
  vi.stubEnv('APP_EDITION', 'aibuddy');
  render(<ChatBrand />);
  expect(screen.getByRole('link', { name: /AIBuddy/ })).toHaveAttribute(
    'href',
    'https://tflow.online'
  );
  expect(screen.getByRole('img', { name: 'AIBuddy' })).toBeInTheDocument();
});

it('preserves HeyBuddy identity and repository destination', () => {
  vi.stubEnv('APP_EDITION', 'heybuddy');
  render(<ChatBrand />);
  expect(screen.getByRole('link', { name: /HeyBuddy/ })).toHaveAttribute(
    'href',
    'https://github.com/turingcat/HeyBuddy'
  );
  expect(screen.getByText('HeyBuddy')).toBeInTheDocument();
});
```

Add a BaseChat assertion that the header delegates to `ChatBrand` and no hard-coded product link remains in `BaseChat`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/components/ChatBrand.test.tsx src/components/BaseChat.test.tsx`

Expected: FAIL because `ChatBrand` does not exist.

- [ ] **Step 3: Implement `ChatBrand` and use it from `BaseChat`**

Use the existing full-color `src/images/aibuddy/icon.png` for AIBuddy and preserve the current Goose component/classes for HeyBuddy. Keep `EnvironmentBadge` beside the new component so it remains an environment concern rather than a brand concern.

- [ ] **Step 4: Run both edition variants**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/components/ChatBrand.test.tsx src/components/BaseChat.test.tsx`

Expected: PASS.

Run: `cd ui/desktop && APP_EDITION=heybuddy pnpm exec vitest run src/components/ChatBrand.test.tsx src/components/BaseChat.test.tsx`

Expected: PASS with unchanged HeyBuddy copy/link.

- [ ] **Step 5: Commit renderer branding**

```bash
git add ui/desktop/src/components/ChatBrand.tsx ui/desktop/src/components/ChatBrand.test.tsx ui/desktop/src/components/BaseChat.tsx ui/desktop/src/components/BaseChat.test.tsx
git commit -m "fix(aibuddy): apply edition branding to chat header"
```

---

### Task 4: Lift user-visible tool images out of collapsed output

**Files:**
- Create: `ui/desktop/src/toolResultContent.ts`
- Create: `ui/desktop/src/toolResultContent.test.ts`
- Modify: `ui/desktop/src/components/ToolCallWithResponse.tsx`
- Modify: `ui/desktop/src/components/ToolCallWithResponse.test.tsx`

**Interfaces:**
- Consumes: `ContentBlock[]` nested in successful `toolResult.value.content`.
- Produces: `partitionUserVisibleToolResultContent(toolResult): { images: ImageContent[]; details: ContentBlock[] }`.

- [ ] **Step 1: Write failing partition tests**

Test all annotation and result paths with these exact table rows: no audience is visible, user audience is visible, combined assistant/user audience is visible, and assistant-only audience is hidden. Add named tests `keeps visible text/resource/audio blocks in details` and `returns empty partitions for pending, error, missing, and malformed content`.

In the component test, supply a complete base64 `image/png` block and assert the image is visible before expanding output, its `src` has the `data:image/png;base64,` prefix plus the exact payload, and it does not also appear inside the expandable result list.

- [ ] **Step 2: Run the tests and confirm red behavior**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/toolResultContent.test.ts src/components/ToolCallWithResponse.test.tsx`

Expected: FAIL because the partition helper and always-visible media area are absent.

- [ ] **Step 3: Implement the typed partition helper**

```ts
export function partitionUserVisibleToolResultContent(
  toolResult: unknown
): { images: ImageContent[]; details: ContentBlock[] };
```

Accept only `status === 'success'` with an array `value.content`. Filter out assistant-only blocks first, then partition blocks whose `type === 'image'`, `mimeType` starts with `image/`, and `data` is a string. Do not duplicate image blocks in `details`.

- [ ] **Step 4: Render an always-visible media area**

Use the existing `ImagePreview` directly below the tool activity card:

```tsx
{images.length > 0 && (
  <div className="mt-2 space-y-2" data-testid="tool-result-images">
    {images.map((image, index) => (
      <ImagePreview
        key={`${image.mimeType}-${index}`}
        src={`data:${image.mimeType};base64,${image.data}`}
      />
    ))}
  </div>
)}
```

Keep logs, text, resource data, and debugging details in the current expandable UI. Image load failure must use `ImagePreview`'s existing visible error state while leaving the tool card intact.

- [ ] **Step 5: Run helper, component, and security tests**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/toolResultContent.test.ts src/components/ToolCallWithResponse.test.tsx src/components/ToolCallWithResponse.security.test.ts`

Expected: PASS with no assistant-only leakage or duplicate image.

- [ ] **Step 6: Commit tool image rendering**

```bash
git add ui/desktop/src/toolResultContent.ts ui/desktop/src/toolResultContent.test.ts ui/desktop/src/components/ToolCallWithResponse.tsx ui/desktop/src/components/ToolCallWithResponse.test.tsx
git commit -m "fix(chat): display user-visible tool images inline"
```

---

### Task 5: Model TFlow subscription periods from server remaining values

**Files:**
- Modify: `ui/desktop/src/siteRuntime/sub2apiAdapter.ts`
- Modify: `ui/desktop/src/siteRuntime/sub2apiAdapter.test.ts`
- Modify: `ui/desktop/src/balance.ts`
- Modify: `ui/desktop/src/balance.test.ts`
- Modify: `ui/desktop/src/main.ts:2010-2065`

**Interfaces:**
- Produces from adapter:

```ts
export type SubscriptionRemainingUSD = {
  daily?: number;
  weekly?: number;
  monthly?: number;
};

export type Sub2apiEntitlement =
  | { kind: 'balance'; displayName: string; balance: number }
  | {
      kind: 'subscription';
      displayName: string;
      groupName: string;
      remainingUSD: SubscriptionRemainingUSD;
    };
```

- Produces to renderer: a matching `BalanceData` subscription variant with `remainingUSD` unchanged.

- [ ] **Step 1: Replace summary-based tests with failing progress-contract tests**

Cover:

- no `groupId` calls only `/auth/me` and returns metered balance;
- matching numeric/string `subscription.group_id` selects the correct item;
- daily-only, weekly-only, monthly-only, and all-period responses preserve exact `remaining_usd` values;
- missing periods remain absent;
- unmatched group falls back to account balance;
- malformed matching progress data throws instead of fabricating values;
- 401 continues to throw `Sub2apiUnauthorizedError` for the existing refresh-token retry.

Include a value such as `remaining_usd: -1.25` and assert it is passed through unchanged, proving the client does not clamp or calculate.

- [ ] **Step 2: Run adapter tests and confirm old `/summary` behavior fails**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/siteRuntime/sub2apiAdapter.test.ts src/balance.test.ts`

Expected: FAIL because the adapter still calls `/subscriptions/summary` and exposes only daily limit/used fields.

- [ ] **Step 3: Implement `/subscriptions/progress` parsing**

Request `GET /api/v1/subscriptions/progress` with the existing panel access token. Match `String(item.subscription.group_id) === groupId`, take `progress.group_name`, and copy finite numeric `daily/weekly/monthly.remaining_usd` values into `remainingUSD`. Require at least one valid configured period for a matched subscription; otherwise throw the current subscription response error.

- [ ] **Step 4: Extend `BalanceData` and main-process mapping**

Make `BalanceData` a discriminated union so metered/HeyBuddy fields remain unchanged and subscriptions carry only their relevant period values. In `main.ts`, pass `remainingUSD` through directly and keep the fixed USD currency config. Do not use `Math.max`, limit-used subtraction, or a client default of zero.

- [ ] **Step 5: Run adapter and balance tests**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/siteRuntime/sub2apiAdapter.test.ts src/balance.test.ts`

Expected: PASS for all period, fallback, malformed, and unauthorized paths.

- [ ] **Step 6: Commit the TFlow entitlement contract**

```bash
git add ui/desktop/src/siteRuntime/sub2apiAdapter.ts ui/desktop/src/siteRuntime/sub2apiAdapter.test.ts ui/desktop/src/balance.ts ui/desktop/src/balance.test.ts ui/desktop/src/main.ts
git commit -m "fix(aibuddy): use TFlow remaining subscription quotas"
```

---

### Task 6: Give AIBuddy its own account trigger and entitlement menu

**Files:**
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.tsx`
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.test.tsx`
- Modify: `ui/desktop/src/components/Layout/BalanceWidget.tsx`
- Modify: `ui/desktop/src/components/Layout/BalanceWidget.test.tsx`
- Modify: `ui/desktop/src/i18n/messages/en.json` (generated)
- Modify: `ui/desktop/src/i18n/messages/zh-CN.json`

**Interfaces:**
- Consumes: edition, `BalanceState`, `BalanceData.remainingUSD`, and `CurrencyConfig`.
- Produces: unchanged `HeyBuddyAccountMenu` behavior and an AIBuddy presentation whose trigger contains username only.

- [ ] **Step 1: Write failing AIBuddy menu tests**

Under `APP_EDITION=aibuddy`, test:

- a very long username truncates visually, remains the trigger's accessible name, and has a `title` with the full value;
- the trigger has no `balance-value`, currency, or remaining-quota text;
- metered menu shows username on its own line and one `Current balance` row;
- subscription menu shows only configured `Daily remaining`, `Weekly remaining`, and `Monthly remaining` rows;
- each amount uses the existing currency formatter with the fixed USD currency config;
- loading, unauthorized, error, refresh, settings, and logout paths remain operable;
- refresh selection does not close the menu.

Keep the existing tests under `APP_EDITION=heybuddy` and assert the trigger still contains its current balance summary.

- [ ] **Step 2: Run menu/widget tests in both editions and confirm AIBuddy failures**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/components/Layout/UserAccountMenu.test.tsx src/components/Layout/BalanceWidget.test.tsx`

Expected: FAIL because the shared menu still shows the HeyBuddy one-line balance layout.

- [ ] **Step 3: Implement edition-specific account content**

Keep shared dropdown actions and refresh behavior, but branch presentation at `getAppEdition()`:

```tsx
const triggerBalance = edition === 'heybuddy' ? <BalanceStatus state={state} /> : null;

{edition === 'aibuddy' ? (
  <AIBuddyEntitlementSummary state={state} accountName={accountName} />
) : (
  <HeyBuddyAccountSummary state={state} accountName={accountName} />
)}
```

The AIBuddy summary uses a vertical layout: username first, entitlement rows below, refresh icon aligned without forcing username and quota onto one line. Do not nest cards or add explanatory copy.

- [ ] **Step 4: Add and compile localized labels**

Add message IDs for `Current balance`, `Daily remaining`, `Weekly remaining`, and `Monthly remaining`, with concise Chinese translations. Run:

`cd ui/desktop && pnpm run i18n:extract && pnpm run i18n:compile && pnpm run i18n:validate-zh-CN`

Expected: PASS; generated catalogs contain all four labels.

- [ ] **Step 5: Run both edition suites**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm exec vitest run src/components/Layout/UserAccountMenu.test.tsx src/components/Layout/BalanceWidget.test.tsx`

Expected: PASS for AIBuddy username-only trigger and entitlement rows.

Run: `cd ui/desktop && APP_EDITION=heybuddy pnpm exec vitest run src/components/Layout/UserAccountMenu.test.tsx src/components/Layout/BalanceWidget.test.tsx`

Expected: PASS with existing HeyBuddy presentation.

- [ ] **Step 6: Commit the account menu boundary**

```bash
git add ui/desktop/src/components/Layout/UserAccountMenu.tsx ui/desktop/src/components/Layout/UserAccountMenu.test.tsx ui/desktop/src/components/Layout/BalanceWidget.tsx ui/desktop/src/components/Layout/BalanceWidget.test.tsx ui/desktop/src/i18n/messages/en.json ui/desktop/src/i18n/messages/zh-CN.json
git commit -m "fix(aibuddy): separate account entitlement presentation"
```

---

### Task 7: Generate and verify the Minimal Bot macOS tray glyph

**Files:**
- Modify: `ui/desktop/src/images/prepare.py`
- Create: `ui/desktop/src/images/test_prepare.py`
- Regenerate: `ui/desktop/src/images/aibuddy/iconTemplate.png`
- Regenerate: `ui/desktop/src/images/aibuddy/iconTemplate@2x.png`

**Interfaces:**
- Produces: `render_aibuddy_tray_glyph(size: int) -> Image.Image`, `write_aibuddy_tray_glyphs(output_dir: Path) -> None`, and `verify_aibuddy_tray_glyph(image, expected_size) -> list[str]`.

- [ ] **Step 1: Write failing deterministic asset tests**

Using Python `unittest`, assert both sizes:

```py
self.assertEqual(image.mode, "RGBA")
self.assertEqual(image.size, (size, size))
self.assertIsNotNone(image.getchannel("A").getbbox())
self.assertGreater(bbox[0], 0)
self.assertGreater(bbox[1], 0)
self.assertLess(bbox[2], size)
self.assertLess(bbox[3], size)
self.assertEqual(render_aibuddy_tray_glyph(size).tobytes(), image.tobytes())
```

Also assert the alpha silhouette contains a centered antenna, rounded robot head, and two transparent eye holes at both resolutions. Verify the checked-in PNG bytes decode to the renderer output.

- [ ] **Step 2: Run and confirm the current extracted-logo glyph fails**

Run: `cd ui/desktop/src/images && python3 -m unittest test_prepare.py`

Expected: FAIL because Minimal Bot rendering/verification does not exist and checked-in assets use the old silhouette.

- [ ] **Step 3: Implement a supersampled alpha-mask renderer**

Draw at 4x resolution with Pillow, then downsample with LANCZOS. Use a rounded robot head, short centered antenna, and two eye cutouts; write black RGB with the generated alpha mask so macOS can tint the template image. Add an `--aibuddy-tray-only` CLI flag that calls `write_aibuddy_tray_glyphs(SCRIPT_DIR / 'aibuddy')`. Keep the HeyBuddy tray generation path unchanged.

- [ ] **Step 4: Regenerate only AIBuddy template PNGs**

Run: `cd ui/desktop && python3 src/images/prepare.py --aibuddy-tray-only`

Expected: only `src/images/aibuddy/iconTemplate.png` and `iconTemplate@2x.png` are regenerated; full-color `icon.png`, `icon.icns`, and `icon.ico` are untouched. Confirm `git diff --stat` lists only those two PNGs plus generator/test source.

- [ ] **Step 5: Verify tests and preparation checks**

Run: `cd ui/desktop/src/images && python3 -m unittest test_prepare.py`

Expected: PASS.

Run: `cd ui/desktop && python3 src/images/prepare.py --verify`

Expected: PASS for existing general assets and the new AIBuddy template checks.

- [ ] **Step 6: Commit the tray glyph**

```bash
git add ui/desktop/src/images/prepare.py ui/desktop/src/images/test_prepare.py ui/desktop/src/images/aibuddy/iconTemplate.png ui/desktop/src/images/aibuddy/iconTemplate@2x.png
git commit -m "fix(aibuddy): refine macOS menu bar template icon"
```

---

### Task 8: Verify, merge to main, push, and build the macOS app

**Files:**
- Modify: none expected beyond formatter-generated changes already included above.

- [ ] **Step 1: Run focused path coverage in AIBuddy mode**

Run:

```bash
cd ui/desktop
APP_EDITION=aibuddy pnpm exec vitest run \
  src/appIdentity.test.ts \
  src/aibuddyDataMigration.test.ts \
  src/credentials.test.ts \
  src/brand.test.ts \
  src/components/ChatBrand.test.tsx \
  src/components/BaseChat.test.tsx \
  src/toolResultContent.test.ts \
  src/components/ToolCallWithResponse.test.tsx \
  src/components/ToolCallWithResponse.security.test.ts \
  src/siteRuntime/sub2apiAdapter.test.ts \
  src/balance.test.ts \
  src/components/Layout/UserAccountMenu.test.tsx \
  src/components/Layout/BalanceWidget.test.tsx \
  --coverage
```

Expected: PASS; changed functional modules have at least 80% exercised branches/functions/lines and all design path families are represented.

- [ ] **Step 2: Run HeyBuddy regression tests**

Run:

```bash
cd ui/desktop
APP_EDITION=heybuddy pnpm exec vitest run \
  src/appIdentity.test.ts \
  src/credentials.test.ts \
  src/brand.test.ts \
  src/components/ChatBrand.test.tsx \
  src/components/BaseChat.test.tsx \
  src/components/ToolCallWithResponse.test.tsx \
  src/components/Layout/UserAccountMenu.test.tsx \
  src/components/Layout/BalanceWidget.test.tsx
```

Expected: PASS with unchanged HeyBuddy header, menu, and account behavior.

- [ ] **Step 3: Run desktop static checks and asset tests**

Run:

```bash
cd ui/desktop
pnpm run typecheck
pnpm run lint:check
pnpm run format:check
pnpm run i18n:check
python3 -m unittest src/images/test_prepare.py
python3 src/images/prepare.py --verify
```

Expected: all commands PASS. If the package exposes different lint/format script names, use the existing repository commands that map to ESLint and Prettier without changing unrelated files.

- [ ] **Step 4: Review the exact commit and file set**

Run: `git diff --check && git status --short && git log --oneline main..HEAD`

Expected: no whitespace errors; only approved source/tests/assets/spec/plan are tracked; unrelated untracked artifacts remain uncommitted.

- [ ] **Step 5: Merge the verified branch into local main**

Switch to `main`, confirm it has no tracked local modifications, then merge `fix/aibuddy-brand-image-account-menu` with a non-interactive merge. Do not discard or clean unrelated untracked user files.

- [ ] **Step 6: Push the resulting local main to remote main**

Run: `git push origin main`

Expected: remote `main` advances to the verified merge result without force pushing.

- [ ] **Step 7: Build the latest AIBuddy macOS app from main**

Run: `cd ui/desktop && APP_EDITION=aibuddy pnpm run package:macos`

Expected: Electron Forge packages `ui/desktop/out/AIBuddy-darwin-arm64/AIBuddy.app` successfully.

- [ ] **Step 8: Open the packaged app for manual testing**

Run: `open ui/desktop/out/AIBuddy-darwin-arm64/AIBuddy.app`

Expected: macOS launches AIBuddy; header/menu identity, inline generated image, account menu, migrated login, and template tray glyph are available for manual verification.

## Self-Review

- **Spec coverage:** Tasks 1-2 cover runtime name, path order, and guarded data migration; Task 3 covers header identity/link; Task 4 covers user-visible images and assistant-only filtering; Tasks 5-6 cover TFlow progress parsing and edition-specific account presentation; Task 7 covers the selected Minimal Bot asset; Task 8 covers both editions, path coverage, merge/push, and the requested macOS build.
- **Placeholder scan:** No implementation step relies on `TODO`, `TBD`, omitted test bodies, or an undefined later interface. Each path has a named assertion or an explicit code example.
- **Type consistency:** `Sub2apiEntitlement.remainingUSD` flows unchanged into the subscription variant of `BalanceData`, then into `AIBuddyEntitlementSummary`. Period keys are consistently `daily`, `weekly`, and `monthly`; amounts are consistently USD numbers.
- **Behavior boundary:** HeyBuddy regression tests remain explicit in Tasks 1, 3, 6, and 8. OA credentials are explicitly rejected from migration. TFlow 401 handling stays on the existing token-refresh path.
- **Calculation boundary:** The only subscription values shown are server `remaining_usd`; the plan explicitly tests negative pass-through and forbids client subtraction/clamping/default zero.
