# HeyBuddy Desktop Input And Account Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一新对话与已有会话的桌面端输入框宽度，修正附件按钮排版，将余额刷新移入账号摘要行，并按会话状态显示删除按钮。

**Architecture:** 保留现有 `ChatInput`、`ChatInputCard`、`useBalance` 和 ACP 会话删除流程，只在各自所有者组件内调整布局和交互。输入框最大宽度由 `ChatInputCard` 导出的单一常量控制；账号菜单复用 `BalanceStatus` 与 `BalanceRefreshButton`；会话删除按钮通过当前会话状态和 Tailwind group 状态控制显隐。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Radix Dropdown Menu、Lucide React、Vitest、Testing Library、Electron Forge

## Global Constraints

- 所有功能代码必须先写失败测试，再写最小实现。
- 桌面端类型只使用 ACP SDK 类型或 `ui/desktop/src/types/*`，不得引入生成的 OpenAPI 客户端。
- 新对话和已有会话输入框最大宽度必须统一为 `max-w-4xl` 并水平居中。
- 不改变聊天提交、附件选择、余额查询、ACP 会话删除和本地清理业务逻辑。
- 不改变窄工具栏现有的控件取舍。
- 不暂存或提交用户现有的 `Justfile` 和 `.pnpm-store/`。

---

### Task 1: 统一输入框宽度与工具栏排版

**Files:**
- Create: `ui/desktop/src/components/ChatInputCard.test.tsx`
- Modify: `ui/desktop/src/components/ChatInputCard.tsx`
- Modify: `ui/desktop/src/components/Hub.tsx`
- Modify: `ui/desktop/src/components/Hub.test.tsx`
- Modify: `ui/desktop/src/components/BaseChat.tsx`
- Modify: `ui/desktop/src/components/ChatInput.tsx`
- Modify: `ui/desktop/src/components/ChatInput.test.tsx`

**Interfaces:**
- Consumes: `ChatInputCard({ className, children })`, `Button` 的 `shape="pill"` 与 `size="sm"` 变体。
- Produces: `CHAT_INPUT_MAX_WIDTH_CLASS: 'max-w-4xl'`，供 `ChatInputCard` 与 `Hub` 共用。

- [ ] **Step 1: 为统一最大宽度写失败测试**

新建 `ChatInputCard.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatInputCard, CHAT_INPUT_MAX_WIDTH_CLASS } from './ChatInputCard';

describe('ChatInputCard', () => {
  it('centers chat inputs with the shared desktop maximum width', () => {
    render(<ChatInputCard>输入区</ChatInputCard>);

    expect(screen.getByText('输入区')).toHaveClass(
      'w-full',
      'mx-auto',
      CHAT_INPUT_MAX_WIDTH_CLASS
    );
  });
});
```

更新 `Hub.test.tsx` 的 `ChatInputCard` mock，使其同时导出 `CHAT_INPUT_MAX_WIDTH_CLASS: 'max-w-4xl'`；在问候测试中追加：

```tsx
expect(screen.getByText('早上好，我是广林AI助手').parentElement).toHaveClass(
  'w-full',
  'max-w-4xl'
);
```

- [ ] **Step 2: 运行宽度测试并确认按预期失败**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/ChatInputCard.test.tsx src/components/Hub.test.tsx
```

Expected: FAIL，因为 `CHAT_INPUT_MAX_WIDTH_CLASS` 尚未导出，Hub 仍使用 `max-w-3xl`。

- [ ] **Step 3: 实现共享宽度和已有会话响应式留白**

在 `ChatInputCard.tsx` 中导出并应用共享宽度：

```tsx
export const CHAT_INPUT_MAX_WIDTH_CLASS = 'max-w-4xl';

export const ChatInputCard: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => (
  <div
    className={cn(
      'w-full mx-auto rounded-2xl border border-border-primary shadow-sm overflow-hidden bg-background-primary',
      CHAT_INPUT_MAX_WIDTH_CLASS,
      className
    )}
  >
    {children}
  </div>
);
```

在 `Hub.tsx` 中导入常量，并把内容容器改为：

```tsx
<div className={`w-full ${CHAT_INPUT_MAX_WIDTH_CLASS}`}>
```

在 `BaseChat.tsx` 中移除覆盖居中的 `mx-4`，保留窄窗口左右各 16px 的可用空间：

```tsx
className={cn(
  'relative z-10 mb-4 w-[calc(100%-2rem)]',
  !disableAnimation && 'animate-[fadein_400ms_ease-in_forwards]'
)}
```

- [ ] **Step 4: 运行宽度测试并确认通过**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/ChatInputCard.test.tsx src/components/Hub.test.tsx
```

Expected: 相关测试全部 PASS。

- [ ] **Step 5: 为附件按钮尺寸与间距写失败测试**

在 `ChatInput.test.tsx` 的宽工具栏测试中追加：

```tsx
const attachButton = screen.getByRole('button', { name: '附件' });
expect(attachButton).toHaveClass('text-xs', 'mr-1');
expect(attachButton).not.toHaveClass('w-8', 'rounded-full');
```

- [ ] **Step 6: 运行附件按钮测试并确认按预期失败**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/ChatInput.test.tsx
```

Expected: FAIL，因为附件按钮仍为 `shape="round"`，且没有 `text-xs mr-1`。

- [ ] **Step 7: 修正附件按钮排版**

在 `ChatInput.tsx` 的附件按钮上使用自然宽度 pill，并增加 4px 外边距；结合底栏现有 `gap-2`，附件与发送之间形成约 12px 间距：

```tsx
<Button
  type="button"
  onClick={handleFileSelect}
  disabled={isFilePickerOpen}
  aria-label={intl.formatMessage(i18n.attachFile)}
  variant="ghost"
  size="sm"
  shape="pill"
  className={cn(
    'mr-1 text-xs text-text-primary/70 hover:text-text-primary transition-colors',
    isFilePickerOpen ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
  )}
>
```

- [ ] **Step 8: 运行输入区相关测试并确认通过**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/ChatInputCard.test.tsx src/components/Hub.test.tsx src/components/ChatInput.test.tsx
```

Expected: 相关测试全部 PASS，窄工具栏测试仍只显示模型与发送按钮。

- [ ] **Step 9: 提交输入区改动**

```bash
git add ui/desktop/src/components/ChatInputCard.tsx ui/desktop/src/components/ChatInputCard.test.tsx ui/desktop/src/components/Hub.tsx ui/desktop/src/components/Hub.test.tsx ui/desktop/src/components/BaseChat.tsx ui/desktop/src/components/ChatInput.tsx ui/desktop/src/components/ChatInput.test.tsx
git commit -m "fix(desktop): align chat input layouts"
```

---

### Task 2: 将余额刷新合并到账号摘要行

**Files:**
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.tsx`
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.test.tsx`

**Interfaces:**
- Consumes: `useBalance(): { state, refreshing, refresh }`、`BalanceStatus`、`BalanceRefreshButton`。
- Produces: `data-testid="account-menu-summary"` 的单行账号摘要；余额刷新以普通按钮呈现，不再作为 `menuitem`。

- [ ] **Step 1: 写账号摘要与刷新按钮失败测试**

在测试消息中加入：

```tsx
'balanceWidget.refresh': '刷新余额',
```

把 `mockBalanceState` 改为接收可选刷新状态：

```tsx
function mockBalanceState(state: BalanceState, refreshing = false) {
  mockUseBalance.mockReturnValue({ state, refreshing, refresh: mockRefresh });
}
```

新增测试：

```tsx
it('places the account name, balance, and refresh button in one summary row', async () => {
  mockBalanceState({
    status: 'ready',
    balance: {
      displayName: '林也',
      userName: 'linye',
      quota: 5_000_000,
      usedQuota: 0,
      requestCount: 1,
    },
    currency: DEFAULT_CURRENCY_CONFIG,
    updatedAt: Date.now(),
  });
  renderMenu();

  await userEvent.click(screen.getByRole('button', { name: /林也/ }));

  const summary = screen.getByTestId('account-menu-summary');
  expect(within(summary).getByText('林也')).toBeInTheDocument();
  expect(within(summary).getByTestId('balance-value')).toBeInTheDocument();
  expect(within(summary).getByRole('button', { name: '刷新余额' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: '刷新余额' })).toBeNull();
});

it('refreshes from the summary icon without closing the account menu', async () => {
  mockBalanceState({ status: 'loading' }, true);
  renderMenu();

  await userEvent.click(screen.getByRole('button', { name: /未登录用户/ }));
  const refreshButton = screen.getByRole('button', { name: '刷新余额' });
  expect(refreshButton.querySelector('svg')).toHaveClass('animate-spin');
  await userEvent.click(refreshButton);

  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('menu')).toBeInTheDocument();
});
```

同时从 `@testing-library/react` 导入 `within`。

删除原先依赖首个菜单项的键盘刷新测试，因为刷新入口不再属于命令菜单。

- [ ] **Step 2: 运行账号菜单测试并确认按预期失败**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/Layout/UserAccountMenu.test.tsx
```

Expected: FAIL，因为摘要仍分为两行且刷新仍是 `menuitem`。

- [ ] **Step 3: 实现单行摘要与图标刷新**

在 `UserAccountMenu.tsx` 中移除直接使用的 `RefreshCw` 和 `refresh` 文案，改为导入：

```tsx
import { BalanceRefreshButton, BalanceStatus } from './BalanceWidget';
```

将菜单头部和刷新菜单项替换为：

```tsx
<div
  className="flex min-w-0 items-center gap-2 px-2 py-2"
  data-testid="account-menu-summary"
>
  <UserRound className="size-4 shrink-0 text-text-secondary" />
  <span className="min-w-0 flex-1 truncate font-medium">{accountName}</span>
  <span className="min-w-0 shrink-0 text-xs text-text-primary">
    <BalanceStatus state={state} />
  </span>
  <BalanceRefreshButton refreshing={refreshing} onRefresh={refresh} />
</div>
<DropdownMenuSeparator />
```

保留“设置”和“退出登录”两个 `DropdownMenuItem`。

- [ ] **Step 4: 运行账号菜单测试并确认通过**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/Layout/UserAccountMenu.test.tsx
```

Expected: 全部 PASS；刷新按钮可点击，旋转状态正确，菜单保持打开。

- [ ] **Step 5: 提交账号菜单改动**

```bash
git add ui/desktop/src/components/Layout/UserAccountMenu.tsx ui/desktop/src/components/Layout/UserAccountMenu.test.tsx
git commit -m "fix(desktop): streamline account balance menu"
```

---

### Task 3: 按会话状态显示删除按钮

**Files:**
- Modify: `ui/desktop/src/components/Layout/NavigationPanel.tsx`
- Modify: `ui/desktop/src/components/Layout/NavigationPanel.test.tsx`

**Interfaces:**
- Consumes: `SessionRowProps.active`、现有 `onDelete()` 与确认弹窗流程。
- Produces: 当前会话常显、其他会话在 group hover 或 focus-within 时显示的删除按钮。

- [ ] **Step 1: 写删除按钮显隐失败测试**

在 `NavigationPanel.test.tsx` 的 hoisted mock 中加入可变活动会话引用：

```tsx
activeSession: { id: undefined as string | undefined },
```

让 `useNavigationSessions` mock 返回：

```tsx
activeSessionId: activeSession.id,
```

在 `beforeEach` 中重置 `activeSession.id = undefined`，并新增：

```tsx
it('hides inactive delete buttons until row hover or keyboard focus', () => {
  renderNavigation();

  expect(deleteButton()).toHaveClass(
    'opacity-0',
    'pointer-events-none',
    'group-hover:opacity-100',
    'group-hover:pointer-events-auto',
    'group-focus-within:opacity-100',
    'group-focus-within:pointer-events-auto'
  );
  expect(deleteButton().parentElement).toHaveClass('group');
});

it('keeps the active session delete button visible', () => {
  activeSession.id = session.id;
  renderNavigation();

  expect(deleteButton()).toHaveClass('opacity-100', 'pointer-events-auto');
  expect(deleteButton()).not.toHaveClass('opacity-0', 'pointer-events-none');
});
```

- [ ] **Step 2: 运行侧栏测试并确认按预期失败**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/Layout/NavigationPanel.test.tsx
```

Expected: 新测试 FAIL，因为会话行没有 `group`，删除按钮始终可见。

- [ ] **Step 3: 实现 hover、focus 和 active 状态**

在 `NavigationPanel.tsx` 的会话行基础 class 中加入 `group`：

```tsx
'group flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer text-sm'
```

将删除按钮 class 改为：

```tsx
className={cn(
  'flex-shrink-0 rounded p-1 text-text-secondary transition-opacity',
  'hover:bg-background-secondary hover:text-text-primary',
  active
    ? 'opacity-100 pointer-events-auto'
    : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto'
)}
```

不改变按钮点击处理和 `event.stopPropagation()`。

- [ ] **Step 4: 运行侧栏测试并确认通过**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/Layout/NavigationPanel.test.tsx
```

Expected: 全部 PASS，包括原有确认、取消、防重复和 ACP 删除清理测试。

- [ ] **Step 5: 提交侧栏改动**

```bash
git add ui/desktop/src/components/Layout/NavigationPanel.tsx ui/desktop/src/components/Layout/NavigationPanel.test.tsx
git commit -m "fix(desktop): reveal session deletion contextually"
```

---

### Task 4: 完整验证、打包与签名

**Files:**
- Verify only: `ui/desktop/src/**`
- Build output: `ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app`

**Interfaces:**
- Consumes: Tasks 1-3 的最终 UI 和测试。
- Produces: 通过测试、类型检查和签名校验的 HeyBuddy 1.45.2 桌面应用包。

- [ ] **Step 1: 运行相关测试集合**

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/ChatInputCard.test.tsx src/components/Hub.test.tsx src/components/ChatInput.test.tsx src/components/Layout/UserAccountMenu.test.tsx src/components/Layout/NavigationPanel.test.tsx
```

Expected: 所有相关测试 PASS，无未处理错误。

- [ ] **Step 2: 运行桌面端全量测试**

```bash
bin/pnpm --dir ui/desktop test:run
```

Expected: 所有测试文件和测试用例 PASS，无未处理错误。

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
bin/pnpm --dir ui/desktop run typecheck
```

Expected: exit 0，无 TypeScript 错误。

- [ ] **Step 4: 生成 UI 覆盖率报告**

```bash
bin/pnpm --dir ui/desktop test:coverage
```

Expected: 测试全部 PASS 并生成 V8 覆盖率报告；本次新增的宽度、刷新、活动会话、非活动会话、hover/focus class 分支均由单元测试执行，新增行为路径覆盖率不低于 80%。

- [ ] **Step 5: 检查格式和差异**

```bash
bin/pnpm --dir ui/desktop exec prettier --check "src/**/*.{ts,tsx,css,json}"
git diff --check
```

Expected: Prettier 和 `git diff --check` 均 exit 0。

- [ ] **Step 6: 构建桌面应用包**

```bash
bin/pnpm --dir ui/desktop run package
```

Expected: `ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app` 生成成功。

- [ ] **Step 7: 对最终应用做 ad-hoc 深度签名并严格验证**

```bash
codesign --force --deep --sign - ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app
codesign --verify --deep --strict --verbose=2 ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app
plutil -lint ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app/Contents/Info.plist
```

Expected: codesign 报告 `valid on disk` 和 `satisfies its Designated Requirement`，plist 报告 `OK`。

- [ ] **Step 8: 桌面宽屏视觉核查**

启动最终应用包：

```bash
open ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app
```

分别打开新对话和已有会话，核对：

```text
新对话输入框与已有会话输入框均为相同最大宽度并水平居中；
附件为 text-xs 且与发送按钮无重叠；
账号菜单头部用户名、余额、刷新图标同排；
非活动会话垃圾箱默认隐藏，悬停/聚焦显示，活动会话常显。
```

- [ ] **Step 9: 记录最终状态，不提交用户文件**

```bash
git status --short --branch
git log --oneline -5
```

Expected: 仅保留用户原有 `M Justfile` 与 `?? .pnpm-store/`；功能提交位于 `feat/desktop-input-account-polish`。
