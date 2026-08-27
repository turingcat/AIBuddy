# Final review fix report

## 结论

已在 `feat/heybuddy-chinese-ui` 上一次性修复 `final-review-findings.md` 的 1 项 Critical 与 5 项 Important finding。未修改 `Justfile` 或 `ui/desktop/src/api`，未合并、未推送。上游 `caf59517cc280dd3523a80131f388024eaaede9d` 不包含这些 fork-specific 中文体验修复。

实现提交：`56b5ef609d394293dc10c1079299e924927ae26b`。

## Critical 1：生产认证 URL 默认值

- 修改：`authConfig.ts` 新增生产常量并使无 env 默认值为 `https://ai.linyeyun.cn`；`vite.main.config.mts` 的两个编译期定义使用生产默认值；显式 `HEYBUDDY_AUTH_API_BASE_URL` 仍优先，显式传入本地 fallback 仍可用。
- 测试：`ui/desktop/src/authConfig.test.ts`。
- RED：无 env 测试期望生产 URL，实际得到 `http://localhost:3001`，1 failed。
- GREEN：focused UI 命令中该文件通过；覆盖 env override、空 env、无 env 和显式本地 fallback。

## Important 1：连续中文标题不机械截断

- 修改：`session_naming.rs` 与 `cli_common.rs` 对含中文的归一化标题保留完整内容；非中文标题继续使用 100 字符安全限制。未改内部 ID/API，桌面侧栏继续负责视觉 ellipsis。
- 测试：两文件各新增超过 100 个连续中文字符的单测。
- RED：两项测试均得到 100 字符加 `...` 的机械截断结果，2 failed。
- GREEN：`cargo test -p goose session_naming` 为 4 passed；`cargo test -p goose --lib providers::cli_common::tests` 为 13 passed。

## Important 2：聊天栏诊断、语音与停止文案

- 修改：`ChatInput.tsx` 增加 React Intl descriptors；宽屏显示 `诊断`、`语音`、`停止`，窄屏语音/停止保持 icon-only，并提供随未配置、录音、转写状态变化的中文 aria-label 与 tooltip。
- 测试：`ui/desktop/src/components/ChatInput.test.tsx` 覆盖宽屏、窄屏、未配置和 streaming 状态。
- RED：缺少中文诊断/语音/停止标签及窄屏可访问文案，3 failed。
- GREEN：focused UI 命令中全部相关状态测试通过。

## Important 3：扩展名称与描述一致本地化

- 修改：`ExtensionMenu.tsx` 和 `RecipeExtensionSelector.tsx` 复用 `getLocalizedExtensionCopy`；搜索同时包含本地化文案和原始名称/描述 aliases；辅助输入类型仅做兼容扩宽。未知自定义扩展继续显示原始名称格式化结果和原始描述，内部 extension name/recipe payload 不变。
- 测试：`ExtensionMenu.test.tsx`、`RecipeExtensionSelector.test.tsx` 覆盖内置中文名称/描述、英文 alias 搜索、未知扩展回退和原始 ID payload。
- RED：内置扩展仍显示英文且描述缺失，4 failed。
- GREEN：focused UI 命令中两文件测试通过。

## Important 4：定时任务动态文案

- 修改：新增 `scheduleDisplay.ts`，加载 `cronstrue/locales/zh_CN` 并根据 `intl.locale` 选择 locale；列表和详情统一本地化 cron、`Session`、`Running for`、时长单位和 `Unknown`，非法 cron 保留原值。
- 测试：`ScheduleDynamicCopy.test.tsx` 覆盖列表中文 cron、未知时长，以及详情中文 cron 和 65 秒时长。
- RED：cron 显示 `At 09:00 AM`，检查结果仍为英文，3 failed。
- GREEN：focused UI 命令中 3 项动态行为测试通过。

## Important 5：规范性身份 prompt 与双路径一致性

- 修改：共享 `system.md` 与 `PromptManager` fallback 改为“当用户问候你或询问你的身份时，你的回复必须以‘我是HeyBuddy’开头”，移除可选的“你可以说”；更新 5 个 snapshots。legacy agent 与 state machine 均通过同一 `PromptManager` 构建 prompt。
- 测试：`prompt_manager.rs` 的身份断言及 default/code-mode snapshots。
- RED：规范性句子断言缺失，1 failed。
- GREEN：`cargo test -p goose prompt_manager` 15 passed；`cargo test -p goose --features code-mode prompt_manager` 15 passed。

## 最终验证命令

- `CI=true PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm exec vitest run src/authConfig.test.ts src/components/ChatInput.test.tsx src/components/bottom_menu/ExtensionMenu.test.tsx src/components/recipes/shared/__tests__/RecipeExtensionSelector.test.tsx src/components/schedule/__tests__/ScheduleDynamicCopy.test.tsx`（在 `ui/desktop`）：5 files、18 tests passed。
- `CI=true PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm run typecheck`（在 `ui/desktop`）：exit 0。
- `cargo test -p goose session_naming`：4 passed。
- `cargo test -p goose --lib providers::cli_common::tests`：13 passed。
- `cargo test -p goose prompt_manager`：15 passed。
- `cargo test -p goose --features code-mode prompt_manager`：15 passed。
- `cargo fmt --all -- --check`：exit 0。
- `git diff --check`：exit 0。
- forbidden-path diff check：exit 0。

## 自审与残余担忧

- 自审确认改动仅覆盖六项 findings；无 `Justfile`、`ui/desktop/src/api`、内部 IDs/API、合并或推送变更。
- `pnpm i18n:validate-zh-CN` 的既有 extra key `navigation.itemApps` 仍存在，本轮新增 11 个 catalog key 已同步；该既有项不在本轮范围。
- Hermit 在受限环境打印 metadata cache `operation not permitted`，但 Rust 命令继续并以 0 退出。
- code-mode 链接打印既有 compact-unwind 大小警告，但测试以 0 退出。

## Scoped re-review 修复（2026-08-27）

### Important：ChatInput 转写态 tooltip

- 修改：`ChatInput.tsx` 的转写态语音按钮不再使用原生 `disabled`；`isTranscribing` 合并进 `aria-disabled` 与点击早退。按钮保留 `animate-pulse`、低透明度和禁用光标，因此仍表达不可操作状态，同时可以获得焦点和 hover 以显示中文 tooltip。
- 测试：`ChatInput.test.tsx` 新增窄栏转写态测试，覆盖 `转写中…` aria-label、aria-disabled、可聚焦/hover tooltip，以及点击不调用开始或停止录音；新增窄栏录音态测试，覆盖 `停止录音` aria-label/tooltip 和停止动作。
- RED：`CI=true PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm exec vitest run src/components/ChatInput.test.tsx` 为 1 failed、6 passed；当前按钮仍有原生 `disabled`，且 `aria-disabled` 实际为 `false`。
- GREEN：同一 focused 命令为 1 file、7 tests passed。

### Important：混合语言标题边界

- 修改：`cli_common.rs` 新增两条标题路径共享的 `preserves_untruncated_chinese_title` 判定。只有标题包含中文且其余字符均为 Han、Unicode 空白或 Unicode 标点时才保留完整内容；字母/数字混入的超长候选继续经过 `safe_truncate(..., 100)`。CLI 对超长混合候选在中文短语归一化前应用安全边界，普通短混合输入的既有中文短语提取行为不变；`session_naming.rs` 复用同一 helper。
- 测试：`session_naming.rs` 与 `cli_common.rs` 各新增“120 个英文字符夹一个中文字符”回归测试，手工断言 97 字符加 `...`；两路径原有超过 100 字纯连续中文完整保留测试继续覆盖另一侧边界。
- RED：`cargo test -p goose session_naming` 为 4 passed、1 failed，实际返回完整 121 字混合标题；`cargo test -p goose --lib providers::cli_common::tests` 为 13 passed、1 failed，实际返回仅 `中`。
- GREEN：前一命令 5 passed；后一命令 14 passed，包含普通短混合输入的既有回归用例。

### Re-review 最终验证

- `CI=true PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm exec vitest run src/components/ChatInput.test.tsx`（在 `ui/desktop`）：1 file、7 tests passed。
- `cargo test -p goose session_naming`：5 passed。
- `cargo test -p goose --lib providers::cli_common::tests`：14 passed。
- `CI=true PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm run typecheck`（在 `ui/desktop`）：exit 0。
- `cargo fmt --all -- --check`：exit 0。
- `git diff --check`：exit 0。

### Re-review 残余担忧

- 无新增功能性担忧。Hermit metadata cache 权限提示仍存在，但所有 Rust 命令均继续并以 0 退出。
