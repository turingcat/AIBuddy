# Desktop Toolbar And Account Menu Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一聊天输入区辅助按钮字号，并让账号弹出菜单始终与侧栏账号按钮等宽。

**Architecture:** 保留现有 `ChatInput`、`Button`、`UserAccountMenu` 和 Radix Dropdown Menu 结构，只在组件所有者处修正样式。输入区辅助操作明确使用 `text-xs`，发送/停止继续使用通用按钮的 `text-sm`；账号菜单宽度使用 Radix 的触发器宽度变量，不依赖可变侧栏的固定像素宽度。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Radix Dropdown Menu、Vitest、Testing Library、Electron Forge

## Global Constraints

- 所有功能代码必须先写失败测试，再写最小实现。
- 诊断、附件和语音在宽工具栏中必须使用 `text-xs`。
- 发送和停止在宽工具栏中必须保留 `text-sm`，不得改为 `text-xs`。
- 窄工具栏仍只显示现有图标，不改变控件取舍。
- 账号菜单必须与账号触发按钮等宽，并随可调整侧栏宽度变化。
- 不改变诊断、附件、语音、发送、停止、余额刷新、设置和退出登录的业务逻辑。
- 不引入生成的 OpenAPI 客户端，不暂存或提交 `Justfile`、`.pnpm-store/` 或忽略的二进制文件。
- 自动验收不得启动桌面应用或生成截图；最终界面由用户人工确认。

---

### Task 1: 统一聊天输入区辅助按钮字号

**Files:**
- Modify: `ui/desktop/src/components/ChatInput.test.tsx`
- Modify: `ui/desktop/src/components/ChatInput.tsx`

**Interfaces:**
- Consumes: `Button` 的 `size="sm"`、`shape="pill"` 和 `cn(...)` class 合并行为。
- Produces: 宽工具栏中诊断、附件、语音为 `text-xs`，发送、停止为 `text-sm` 的稳定视觉约定。

- [ ] **Step 1: 写辅助按钮字号失败测试**

在 `ChatInput.test.tsx` 的宽工具栏测试中断言附件和发送：

```tsx
const attachButton = screen.getByRole('button', { name: '附件' });
expect(attachButton).toHaveClass('text-xs');

const sendButton = screen.getByRole('button', { name: '发送' });
expect(sendButton).toHaveClass('text-sm');
expect(sendButton).not.toHaveClass('text-xs');
```

在诊断和语音测试中追加：

```tsx
const diagnosticsButton = screen.getByRole('button', { name: '诊断' });
const voiceButton = screen.getByRole('button', { name: '语音输入' });
expect(diagnosticsButton).toHaveClass('text-xs');
expect(voiceButton).toHaveClass('text-xs');
```

在已有宽屏停止测试中追加：

```tsx
const stopButton = screen.getByRole('button', { name: '停止' });
expect(stopButton).toHaveClass('text-sm');
expect(stopButton).not.toHaveClass('text-xs');
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/ChatInput.test.tsx
```

Expected: FAIL，诊断和语音仍继承通用 `Button` 的 `text-sm`，没有 `text-xs`；附件、发送和停止断言保持通过。

- [ ] **Step 3: 最小实现辅助按钮字号**

在 `ChatInput.tsx` 中只给诊断和语音按钮补充 `text-xs`，附件保留现有 `text-xs`：

```tsx
className="text-xs text-text-primary/70 hover:text-text-primary cursor-pointer transition-colors"
```

```tsx
className={cn(
  'text-xs transition-colors',
  isRecording
    ? 'text-red-500 hover:text-red-600'
    : 'text-text-primary/70 hover:text-text-primary',
  isTranscribing && 'animate-pulse opacity-50 cursor-not-allowed',
  !isEnabled && 'opacity-50 cursor-not-allowed'
)}
```

不要给发送或停止按钮添加 `text-xs`。

- [ ] **Step 4: 运行字号相关测试**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/ChatInput.test.tsx src/components/bottom_menu/ChatToolbarLabels.test.tsx
```

Expected: 两个测试文件全部 PASS；窄工具栏仍只显示模型、语音和发送/停止的现有图标组合。

- [ ] **Step 5: 提交字号修复**

```bash
git add ui/desktop/src/components/ChatInput.tsx ui/desktop/src/components/ChatInput.test.tsx
git commit -m "fix(desktop): align chat toolbar label sizes"
```

---

### Task 2: 让账号菜单匹配侧栏触发器宽度

**Files:**
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.test.tsx`
- Modify: `ui/desktop/src/components/Layout/UserAccountMenu.tsx`

**Interfaces:**
- Consumes: Radix Dropdown Menu 的 `--radix-dropdown-menu-trigger-width` CSS 变量。
- Produces: `DropdownMenuContent` 使用 `w-[var(--radix-dropdown-menu-trigger-width)]`，与账号触发按钮等宽。

- [ ] **Step 1: 写菜单宽度失败测试**

在 `UserAccountMenu.test.tsx` 的向上弹出测试中追加：

```tsx
const menu = screen.getByRole('menu');
expect(menu).toHaveClass('w-[var(--radix-dropdown-menu-trigger-width)]');
expect(menu).not.toHaveClass('w-64');
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/Layout/UserAccountMenu.test.tsx
```

Expected: FAIL，菜单仍使用固定 `w-64`。

- [ ] **Step 3: 使用触发器宽度变量**

将 `UserAccountMenu.tsx` 的菜单 class 改为：

```tsx
<DropdownMenuContent
  side="top"
  align="start"
  className="w-[var(--radix-dropdown-menu-trigger-width)]"
>
```

不改变菜单内容、弹出方向、对齐、刷新、设置或退出登录逻辑。

- [ ] **Step 4: 运行账号菜单测试**

Run:

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/Layout/UserAccountMenu.test.tsx
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交菜单宽度修复**

```bash
git add ui/desktop/src/components/Layout/UserAccountMenu.tsx ui/desktop/src/components/Layout/UserAccountMenu.test.tsx
git commit -m "fix(desktop): align account menu with sidebar"
```

---

### Task 3: 自动验证、重新打包与签名

**Files:**
- Verify only: `ui/desktop/src/**`
- Build input: `ui/desktop/src/bin/goose`（Git 忽略，不提交）
- Build output: `ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app`

**Interfaces:**
- Consumes: Tasks 1-2 的最终提交和现有 release `goose` 二进制。
- Produces: 通过自动测试和签名校验的 HeyBuddy 1.45.2 应用包，交给用户人工检查界面。

- [ ] **Step 1: 运行相关测试**

```bash
bin/pnpm --dir ui/desktop exec vitest run src/components/ChatInput.test.tsx src/components/bottom_menu/ChatToolbarLabels.test.tsx src/components/Layout/UserAccountMenu.test.tsx
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行桌面端全量测试与覆盖率**

```bash
bin/pnpm --dir ui/desktop test:run
bin/pnpm --dir ui/desktop test:coverage
```

Expected: 测试全部 PASS；记录 V8 覆盖率实际指标，并确认新增路径由聚焦测试执行。不得把仓库既有的全局低覆盖率误报为本分支测试失败。

- [ ] **Step 3: 运行类型、格式和 Rust 合并门禁**

```bash
bin/pnpm --dir ui/desktop run typecheck
bin/pnpm --dir ui/desktop exec prettier --check src/components/ChatInput.tsx src/components/ChatInput.test.tsx src/components/Layout/UserAccountMenu.tsx src/components/Layout/UserAccountMenu.test.tsx
git diff --check
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
```

Expected: 所有命令 exit 0。Prettier 只检查本分支改动文件，不把仓库其他既有格式问题归入本次改动。

- [ ] **Step 4: 确认打包输入包含 goose**

```bash
test -x ui/desktop/src/bin/goose
file ui/desktop/src/bin/goose
```

Expected: 文件存在且为 `Mach-O 64-bit executable arm64`。若隔离 worktree 中缺失，先从已验证的 `/Users/turingcat/Project/HeyBuddy/ui/desktop/src/bin/goose` 复制到这个 Git 忽略路径，再继续打包。

- [ ] **Step 5: 重新打包、签名并校验**

```bash
bin/pnpm --dir ui/desktop run package
codesign --force --deep --sign - ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app
codesign --verify --deep --strict --verbose=2 ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app
plutil -lint ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app/Contents/Info.plist
test -x ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app/Contents/Resources/bin/goose
```

Expected: 打包成功；codesign 报告 `valid on disk` 和 `satisfies its Designated Requirement`；plist 为 `OK`；最终包包含可执行 goose。

- [ ] **Step 6: 记录状态并交由用户人工确认**

```bash
git status --short --branch
git log --oneline -8
```

Expected: 功能分支源码干净，忽略的打包输入和输出不进入提交。不要启动 `.app` 或截图；告知用户最终包路径，由用户人工确认字号和菜单边界。
