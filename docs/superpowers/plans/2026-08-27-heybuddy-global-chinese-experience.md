# HeyBuddy Global Chinese Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HeyBuddy and Goose clients use HeyBuddy identity and Chinese Agent behavior while improving the Desktop model defaults, navigation, session actions, localization, chat toolbar, greeting, and account menu.

**Architecture:** Keep protocol, route, API, and Rust/TypeScript identifiers unchanged. Change the shared Agent prompt templates for the confirmed global identity/language behavior, then update Desktop state and presentation layers around existing ACP, balance, session, and React Intl abstractions. Extract only the new behavior that needs independent tests: default-model resolution, session deletion, account display-name fallback, extension copy lookup, and toolbar labels.

**Tech Stack:** Rust prompt templates and unit tests; Electron/React/TypeScript; React Intl; Vitest; existing ACP client and DropdownMenu/ConfirmationModal primitives; pnpm workspace; Node 24.

## Global Constraints

- Work only on `feat/heybuddy-chinese-ui` inside `/Users/turingcat/Project/HeyBuddy/.worktrees/heybuddy-chinese-ui`.
- Preserve the pre-existing `Justfile` change in the original checkout; do not copy or commit it.
- Global Agent identity, Chinese thinking/output instructions, and Chinese session-title instructions apply to Goose CLI and other shared-core clients as confirmed by the user.
- Desktop model fallback uses the first item returned by the loaded model list; it must not hardcode a model ID or overwrite a complete existing default.
- UI protocol names and internal identifiers such as `recipe`, `schedule`, `extension`, `providerId`, and `modelId` remain unchanged.
- User-facing Chinese copy must use the existing React Intl/default-message architecture; no generated API client changes.
- Destructive session deletion requires confirmation and must clean frontend state only after the ACP delete succeeds.
- Every functional behavior change gets a unit test; use the existing test utilities and keep the project’s 80% path-coverage requirement in mind.
- Use Node 24 (`PATH="/opt/homebrew/opt/node@24/bin:$PATH"`) for UI checks.

---

## Task 1: Replace the shared Agent identity and language instructions

**Files:**
- Modify: `crates/goose/src/prompts/system.md`
- Modify: `crates/goose/src/agents/prompt_manager.rs`
- Test: `crates/goose/src/agents/prompt_manager.rs` existing prompt-rendering tests and snapshots under `crates/goose/src/agents/snapshots/`

**Interfaces:**
- Consumes: existing `PromptManager::builder().build()` system prompt rendering.
- Produces: every rendered shared system prompt identifies the agent as HeyBuddy and includes explicit Chinese language instructions without changing tool/extension context fields.

- [ ] **Step 1: Add a failing prompt assertion**

Extend the existing prompt-manager test module with a test that renders the normal prompt and asserts it contains `HeyBuddy`, `使用中文`, and the identity instruction containing `我是HeyBuddy`; assert it no longer contains the old opening identity `You are a general-purpose AI agent called goose`.

```rust
#[test]
fn shared_system_prompt_uses_heybuddy_chinese_identity() {
    let prompt = PromptManager::with_timestamp(DateTime::<Utc>::from_timestamp(0, 0).unwrap())
        .builder()
        .build();

    assert!(prompt.contains("HeyBuddy"));
    assert!(prompt.contains("使用中文"));
    assert!(prompt.contains("我是HeyBuddy"));
    assert!(!prompt.contains("called goose"));
}
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
cargo test -p goose prompt_manager::tests::shared_system_prompt_uses_heybuddy_chinese_identity -- --exact
```

Expected: FAIL because `system.md` still renders the Goose identity and has no Chinese identity instruction.

- [ ] **Step 3: Implement the minimal shared prompt change**

Replace the opening identity in `system.md` with HeyBuddy wording and add a concise language section requiring Chinese for visible reasoning, tool explanations, and final responses while preserving code, commands, paths, and protocol identifiers. Keep the existing extension and response-guideline sections intact. Update prompt snapshots only where the rendered opening text changes.

- [ ] **Step 4: Run the focused test and prompt snapshot tests**

Run:

```bash
cargo test -p goose prompt_manager -- --nocapture
```

Expected: PASS with no snapshot mismatch after intentional snapshot updates.

- [ ] **Step 5: Commit the task**

```bash
git add crates/goose/src/prompts/system.md crates/goose/src/agents/prompt_manager.rs crates/goose/src/agents/snapshots
git commit -m "feat(prompt): use HeyBuddy Chinese agent identity"
```

## Task 2: Make shared session-title generation Chinese

**Files:**
- Modify: `crates/goose/src/prompts/session_name.md`
- Modify: `crates/goose/src/session/session_naming.rs`
- Modify: `crates/goose/src/providers/cli_common.rs` only if the expected marker/suffix test needs a Chinese-specific assertion
- Test: `crates/goose/src/session/session_naming.rs` tests and `crates/goose/tests/acp_common_tests/mod.rs` title fixture expectations

**Interfaces:**
- Consumes: existing `generate_session_name(provider, model_config, session_id, messages)` flow.
- Produces: the same title extraction/notification API, with a Chinese-only title-generation instruction and no explanatory output.

- [ ] **Step 1: Add a failing title-prompt test**

Extract or expose a small testable helper that renders the session-name instruction, then add a test asserting the prompt contains `请用简洁的中文` and `只输出标题`, while not containing the old English task sentence.

```rust
#[test]
fn session_name_prompt_requires_a_short_chinese_title() {
    let prompt = render_session_name_prompt_for_test();

    assert!(prompt.contains("简洁的中文"));
    assert!(prompt.contains("只输出标题"));
    assert!(!prompt.contains("Generate short title"));
}
```

- [ ] **Step 2: Run the focused title test and verify it fails for the old prompt**

Run:

```bash
cargo test -p goose session_naming::tests::session_name_prompt_requires_a_short_chinese_title -- --exact
```

Expected: FAIL because the bundled `session_name.md` is still English.

- [ ] **Step 3: Implement the Chinese title template**

Rewrite `session_name.md` to require a concise Chinese title of no more than four meaningful words/short phrases, return only the title, and never return reasoning or explanatory punctuation. Keep the existing marker and suffix flow unchanged so CLI providers continue to parse the response.

- [ ] **Step 4: Verify title generation and existing extraction behavior**

Run:

```bash
cargo test -p goose session_naming -- --nocapture
cargo test -p goose --test acp_server_test test_session_name_update_notification -- --nocapture
```

Expected: PASS; fixture output may remain English because it is a mock provider response, while the prompt assertion proves the production instruction is Chinese.

- [ ] **Step 5: Commit the task**

```bash
git add crates/goose/src/prompts/session_name.md crates/goose/src/session/session_naming.rs crates/goose/src/providers/cli_common.rs crates/goose/tests/acp_common_tests/mod.rs
git commit -m "feat(prompt): generate Chinese session titles"
```

## Task 3: Select and persist the first available Desktop model

**Files:**
- Modify: `ui/desktop/src/components/ModelAndProviderContext.tsx`
- Modify: `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx` only if the model-list loader must be shared
- Test: `ui/desktop/src/components/ModelAndProviderContext.test.tsx` (create beside the context if no focused test exists)

**Interfaces:**
- Consumes: `acpReadDefaults`, `acpSaveDefaults`, `window.electron.listModelsViaApi`, and existing `GOOSE_DEFAULT_PROVIDER`/`GOOSE_DEFAULT_MODEL` app config.
- Produces: `getFallbackModelAndProvider()` that returns a complete configured default or the first loaded model and saves it once.

- [ ] **Step 1: Add failing tests for the three fallback branches**

Cover: complete configured default is returned unchanged; missing model uses `listModelsViaApi()[0]` and calls `acpSaveDefaults(provider, first.id)`; an empty model list returns the existing incomplete fallback without saving. Use the existing Vitest module-mocking conventions for ACP providers and `window.appConfig`.

```ts
it('uses the first loaded model when no complete default exists', async () => {
  mockReadDefaults.mockResolvedValue({ providerId: null, modelId: null });
  mockListModelsViaApi.mockResolvedValue([
    { id: 'first-model', name: 'first-model', contextLimit: 128000, reasoning: true },
    { id: 'second-model', name: 'second-model', contextLimit: 128000, reasoning: false },
  ]);

  const result = await getFallbackModelAndProviderForTest();

  expect(result).toEqual({ provider: 'heybuddy', model: 'first-model' });
  expect(mockSaveDefaults).toHaveBeenCalledWith('heybuddy', 'first-model');
});
```

- [ ] **Step 2: Run the focused tests and verify the first-model case fails**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/components/ModelAndProviderContext.test.tsx
```

Expected: FAIL because the current fallback only reads app-config values and never loads the first model.

- [ ] **Step 3: Implement first-model fallback**

Keep complete app-config defaults as the first branch. If the model is missing, call `window.electron.listModelsViaApi()`, select index `0`, use the configured provider or `heybuddy`, save through `acpSaveDefaults`, and return the pair. Treat an empty response as no fallback model and preserve the existing error-safe return behavior.

- [ ] **Step 4: Run focused and existing model tests**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/components/ModelAndProviderContext.test.tsx src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx src/components/settings/models/bottom_bar/ModelsBottomBar.test.tsx
```

Expected: PASS with existing model-selection behavior unchanged.

- [ ] **Step 5: Commit the task**

```bash
git add ui/desktop/src/components/ModelAndProviderContext.tsx ui/desktop/src/components/ModelAndProviderContext.test.tsx ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx
git commit -m "feat(models): default to first available HeyBuddy model"
```

## Task 4: Add a confirmed trash action to sidebar sessions

**Files:**
- Modify: `ui/desktop/src/components/Layout/NavigationPanel.tsx`
- Modify: `ui/desktop/src/acp/sessions.ts` only if a small reusable delete operation is needed
- Test: `ui/desktop/src/components/Layout/NavigationPanel.test.tsx` (create or extend the focused sidebar test)

**Interfaces:**
- Consumes: `acpDeleteSession`, `acpChatSessionActions.deleteSnapshot`, `cancelAcpPermissionRequestsForSession`, `cancelAcpElicitationRequestsForSession`, `AppEvents`, and `ConfirmationModal`.
- Produces: a `SessionRow` trash button that confirms, deletes via ACP, cleans local state after success, refreshes the sidebar, and does not trigger row navigation.

- [ ] **Step 1: Add failing interaction tests**

Render a sidebar session row with the existing test wrapper and assert: a button with an accessible Chinese delete label is present; clicking it does not call the row navigation handler; confirming calls `acpDeleteSession` with the session ID and dispatches the deletion event; rejecting leaves the session untouched; a rejected ACP deletion displays an error and does not remove the local snapshot.

```tsx
it('confirms and deletes a sidebar session without opening it', async () => {
  const user = userEvent.setup();
  render(<NavigationPanelTestHarness />);

  await user.click(screen.getByRole('button', { name: '删除会话' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '确认删除' }));

  expect(mockDeleteSession).toHaveBeenCalledWith('session-1');
  expect(mockHandleSessionClick).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/components/Layout/NavigationPanel.test.tsx
```

Expected: FAIL because `SessionRow` has no delete button or delete callback.

- [ ] **Step 3: Implement the delete callback and button**

Add a `Trash2` button inside `SessionRow`, call `event.stopPropagation()`, and expose a callback to the parent. In `Navigation`, keep the pending session in state and render the existing confirmation primitive. On confirmation, call ACP delete first; after success dispatch `SESSION_DELETED`, cancel permission/elicitation requests, delete the chat snapshot, clear pending state, and call `fetchSessions`. On failure, keep the row and show the existing toast error pattern.

- [ ] **Step 4: Run session and sidebar tests**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/components/Layout/NavigationPanel.test.tsx src/components/sessions/SessionListView.test.tsx src/acp/__tests__/sessions.test.ts
```

Expected: PASS, including existing session-list deletion behavior.

- [ ] **Step 5: Commit the task**

```bash
git add ui/desktop/src/components/Layout/NavigationPanel.tsx ui/desktop/src/components/Layout/NavigationPanel.test.tsx ui/desktop/src/acp/sessions.ts
git commit -m "feat(sessions): add sidebar delete action"
```

## Task 5: Localize navigation, templates, scheduled tasks, and extensions

**Files:**
- Modify: `ui/desktop/src/hooks/useNavigationItems.ts`
- Modify: `ui/desktop/src/components/recipes/` affected view/form/activity files
- Modify: `ui/desktop/src/components/schedule/` affected view/detail files
- Modify: `ui/desktop/src/components/extensions/ExtensionsView.tsx`
- Modify: `ui/desktop/src/components/settings/extensions/subcomponents/ExtensionList.tsx`
- Modify: `ui/desktop/src/components/settings/extensions/bundled-extensions.json` or add a local extension-copy map beside `ExtensionList.tsx`
- Modify: `ui/desktop/src/i18n/messages/zh-CN.json` and affected `defaultMessage` descriptors
- Test: existing recipe/schedule/extension tests plus focused copy-map tests

**Interfaces:**
- Consumes: stable nav IDs, recipe/schedule routes, extension IDs, and React Intl.
- Produces: Chinese labels and descriptions while preserving all internal names, routes, deep links, and extension behavior.

- [ ] **Step 1: Add failing copy assertions**

Add focused assertions for `getNavItemLabel`/message descriptors and extension copy resolution: `recipes` displays “模板”, `scheduler` displays “定时任务”, the extension list headings display “默认扩展” and “可用扩展”, and built-ins map `developer`, `computercontroller`, `autovisualiser`, `memory`, and `tutorial` to Chinese names/descriptions. Add a recipe copy assertion for “子模板” where the current English text says Subrecipe.

```ts
it('uses Chinese navigation terminology', () => {
  expect(formatNavLabel('recipes')).toBe('模板');
  expect(formatNavLabel('scheduler')).toBe('定时任务');
});

it('localizes built-in extension copy by stable id', () => {
  expect(getLocalizedExtensionCopy('developer')).toEqual({
    title: '开发工具',
    description: expect.stringContaining('开发'),
  });
});
```

- [ ] **Step 2: Run the focused copy tests and verify they fail**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/hooks/useNavigationItems.test.ts src/components/settings/extensions/subcomponents/ExtensionList.test.tsx
```

Expected: FAIL because the current nav and extension copy are English and the current main branch may omit the recipes nav item.

- [ ] **Step 3: Implement the terminology and copy map**

Ensure the visible nav includes the existing recipes route as “模板” without renaming its `/recipes` path. Replace user-facing Recipe/Subrecipe/Scheduler wording in the affected recipes and schedule surfaces. Add React Intl descriptors for extension headings, built-in names, built-in descriptions, search/empty states, install/configure actions, and extension type labels. Use the extension stable ID/name for lookup and fall back to the provided custom description for unknown extensions.

- [ ] **Step 4: Run all affected UI tests and locale validation**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/hooks/useNavigationItems.test.ts src/components/settings/extensions/subcomponents/ExtensionList.test.tsx src/components/settings/extensions/bundled-extensions.test.ts src/components/recipes src/components/schedule
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app i18n:validate-zh-CN
```

Expected: PASS with no missing or malformed Chinese message entries.

- [ ] **Step 5: Commit the task**

```bash
git add ui/desktop/src/hooks/useNavigationItems.ts ui/desktop/src/components/recipes ui/desktop/src/components/schedule ui/desktop/src/components/extensions/ExtensionsView.tsx ui/desktop/src/components/settings/extensions ui/desktop/src/i18n/messages/zh-CN.json
git commit -m "feat(i18n): localize templates schedules and extensions"
```

## Task 6: Add Chinese greeting and labeled chat controls

**Files:**
- Modify: `ui/desktop/src/components/Hub.tsx`
- Modify: `ui/desktop/src/components/ChatInput.tsx`
- Modify: `ui/desktop/src/components/bottom_menu/DirSwitcher.tsx`
- Modify: `ui/desktop/src/components/bottom_menu/ContextWindowIndicator.tsx`
- Modify: `ui/desktop/src/components/bottom_menu/BottomMenuExtensionSelection.tsx`
- Modify: `ui/desktop/src/components/settings/models/bottom_bar/ModelsBottomBar.tsx`
- Modify: `ui/desktop/src/i18n/messages/zh-CN.json` and affected default message descriptors
- Test: `ui/desktop/src/components/Hub.test.tsx` and focused toolbar tests

**Interfaces:**
- Consumes: existing `Hub` clock/greeting, chat toolbar controls, and responsive class names.
- Produces: greeting suffix “，我是广林AI助手”, visible 2–4 character Chinese control labels, and a wider default new-chat input card.

- [ ] **Step 1: Add failing greeting and control-label assertions**

Add a Hub test with a fixed morning clock or extracted greeting formatter and assert “早上好，我是广林AI助手”. Add toolbar assertions that the model, directory, context, extension, attachment, and send controls expose their Chinese label text while retaining accessible labels.

```tsx
it('adds the Guanglin assistant identity to the morning greeting', () => {
  expect(formatHubGreeting('早上好')).toBe('早上好，我是广林AI助手');
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/components/Hub.test.tsx src/components/bottom_menu src/components/settings/models/bottom_bar/ModelsBottomBar.test.tsx
```

Expected: FAIL because the greeting has no suffix and the toolbar currently renders mostly icon-only controls.

- [ ] **Step 3: Implement the greeting, labels, and width change**

Add one localized assistant suffix after the existing time-of-day message. Add short labels adjacent to each icon in the non-narrow toolbar layout, use the same message descriptors in tooltips/aria labels, and keep the narrow layout icon-only when space is constrained. Increase the Hub content max width from `max-w-2xl` to the next responsive width that preserves the sidebar/main layout.

- [ ] **Step 4: Run focused UI tests and formatting**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/components/Hub.test.tsx src/components/bottom_menu src/components/settings/models/bottom_bar/ModelsBottomBar.test.tsx
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app typecheck
```

Expected: PASS with no TypeScript errors and no control losing its original click behavior.

- [ ] **Step 5: Commit the task**

```bash
git add ui/desktop/src/components/Hub.tsx ui/desktop/src/components/ChatInput.tsx ui/desktop/src/components/bottom_menu ui/desktop/src/components/settings/models/bottom_bar/ModelsBottomBar.tsx ui/desktop/src/i18n/messages/zh-CN.json
git commit -m "feat(ui): add Chinese greeting and chat control labels"
```

## Task 7: Replace the sidebar settings row with the account menu

**Files:**
- Create: `ui/desktop/src/components/Layout/UserAccountMenu.tsx`
- Create: `ui/desktop/src/components/Layout/UserAccountMenu.test.tsx`
- Modify: `ui/desktop/src/components/Layout/NavigationPanel.tsx`
- Modify: `ui/desktop/src/components/Layout/BalanceWidget.tsx` or extract its ready/loading/error display helpers for reuse
- Modify: `ui/desktop/src/i18n/messages/zh-CN.json`

**Interfaces:**
- Consumes: `useBalance`, `BalanceData.displayName`, `BalanceData.userName`, `formatQuotaWithCurrency`, `handleNavClick('/settings')`, and the existing logout IPC flow.
- Produces: `UserAccountMenu` with a bottom trigger showing balance plus display name, top-opening menu, normal theme-colored balance, Settings action, and Logout action.

- [ ] **Step 1: Add failing account-menu tests**

Test display-name priority, name fallback, both-empty placeholder, balance rendering in the menu header, Settings navigation, Logout invocation, and the trigger/menu placement classes or `side="top"` behavior.

```tsx
it('falls back to the login name when display name is empty', async () => {
  mockBalanceState({
    status: 'ready',
    balance: { displayName: '', userName: 'linye', quota: 1000, usedQuota: 0, requestCount: 1 },
    currency: usdCurrency,
  });

  render(<UserAccountMenu onOpenSettings={mockOpenSettings} onLogout={mockLogout} />);

  expect(screen.getByText('linye')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /linye/ }));
  expect(screen.getByText('设置')).toBeInTheDocument();
  expect(screen.getByText('退出登录')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/components/Layout/UserAccountMenu.test.tsx
```

Expected: FAIL because the component does not yet exist.

- [ ] **Step 3: Implement the account menu with existing balance state**

Create the menu component around `useBalance`. Derive `displayName || userName || '未登录用户'`, render the existing formatted balance in the menu header using normal theme colors, use `DropdownMenuContent side="top" align="start"`, and wire Settings to the existing navigation callback. Reuse the existing logout IPC/credential-clear and restart behavior rather than creating a second logout implementation. Keep refresh and error states accessible.

- [ ] **Step 4: Replace the bottom sidebar Settings row and run tests**

Replace the `BalanceWidget` + `SETTINGS_NAV_ITEM` block with `UserAccountMenu`, retain the balance refresh behavior, and run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run -- src/components/Layout/UserAccountMenu.test.tsx src/components/Layout/BalanceWidget.test.tsx src/components/Layout/NavigationPanel.test.tsx
```

Expected: PASS; the old Settings nav row is absent and the user menu is reachable from the bottom-left account area.

- [ ] **Step 5: Commit the task**

```bash
git add ui/desktop/src/components/Layout/UserAccountMenu.tsx ui/desktop/src/components/Layout/UserAccountMenu.test.tsx ui/desktop/src/components/Layout/NavigationPanel.tsx ui/desktop/src/components/Layout/BalanceWidget.tsx ui/desktop/src/i18n/messages/zh-CN.json
git commit -m "feat(ui): add account menu to sidebar"
```

## Task 8: Full verification and HeyBuddy packaging

**Files:**
- Modify: only files required by failing verification or formatting; do not modify `Justfile`.
- Verify: all task files, generated UI build output, and packaged application.

**Interfaces:**
- Consumes: all implemented prompt, model, session, localization, toolbar, greeting, and account-menu behavior.
- Produces: a verified Desktop package with no source changes omitted from tests.

- [ ] **Step 1: Run formatting and static checks**

Run:

```bash
cargo fmt --all -- --check
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the complete UI test suite**

Run:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter goose-app test:run
```

Expected: 0 failed tests and 0 unhandled errors. If the existing Node 26/localStorage or loopback-listener failures recur, rerun with Node 24 and the required local permission before assessing the code.

- [ ] **Step 3: Run focused Rust tests and record unrelated failures accurately**

Run:

```bash
cargo test -p goose prompt_manager
cargo test -p goose session_naming
```

Expected: both changed prompt-test commands pass. Do not attribute unrelated pre-existing compaction failures to this feature; report them separately if the full Rust suite is run.

- [ ] **Step 4: Build the Desktop package**

Run from `ui/desktop`:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" CI=true pnpm run package
```

Expected: package completes and produces `ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app`.

- [ ] **Step 5: Verify the packaged application and repository state**

Run:

```bash
codesign --verify --deep --strict ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app
git status --short --branch
git log --oneline --decorate -8
```

Expected: codesign verification exits 0, only intentional feature commits are present, and no `Justfile` change is staged or committed.
