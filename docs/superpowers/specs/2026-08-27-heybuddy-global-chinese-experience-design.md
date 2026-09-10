# HeyBuddy 全局中文体验设计

## 背景与目标

HeyBuddy 当前基于 Goose 的 Agent 核心和 Electron Desktop UI。目标是把身份、会话标题、思考语言、模型默认值、导航、扩展、会话操作和用户菜单统一调整为更适合 HeyBuddy 中文用户的体验。

用户已确认采用“全局替换”方案，因此 Agent 身份、标题生成和中文思考要求会同时影响 Goose CLI 及其他调用同一核心的客户端；桌面 UI 的默认文案和 `zh-CN` 文案同步调整。

## 已确认的产品决策

1. Agent 的品牌身份为 HeyBuddy。用户询问身份或打招呼时，回复以“我是HeyBuddy”开头。
2. Agent 的思考、工具说明和最终回复优先使用中文；代码、命令、路径、API 字段和其他技术标识保持原文。模型供应商的隐藏推理 token 无法由客户端完全控制，系统提示只约束可见思考/推理内容和输出语言。
3. 会话标题统一要求生成简短中文标题，只输出标题，不输出解释。
4. 新会话没有默认模型时，使用当前已加载模型列表的第一项，并保存对应 Provider/Model；已有默认配置不覆盖。
5. 会话删除通过垃圾箱图标触发，并在真正删除前确认；确认后清理会话快照、相关待处理请求并刷新列表。
6. `Recipes` 在用户界面中显示为“模板”，`Subrecipes` 显示为“子模板”，相关表单、按钮、说明和状态使用一致术语；内部路由和 API 标识不变。
7. `Scheduler` 在用户界面中显示为“定时任务”，相关说明和操作文案同步修改。
8. 扩展页面中的默认扩展、可用扩展、内置扩展名称和描述中文化；自定义扩展名称保留用户或服务端提供的名称。
9. 主会话底部工具栏在图标后显示短中文标签，例如“模型”“目录”“上下文”“扩展”“诊断”“附件”“语音”“发送”；输入卡片默认宽度适当增加。
10. 首页问候显示为“早上好，我是广林AI助手”“下午好，我是广林AI助手”或“晚上好，我是广林AI助手”。
11. 左下角用户区显示余额和登录用户名称，名称优先取 `display_name`，为空时取 `name`。点击后向上弹出菜单，菜单中包含“设置”和“退出登录”；余额使用正常主题颜色，截图中的红色仅视为位置标注。

## 架构设计

### Agent 核心提示词

修改核心 `system.md`，把 Goose 身份替换为 HeyBuddy，并增加中文语言、身份和输出约束。修改 `session_name.md`，将标题生成任务、示例和输出限制改为中文。这样所有使用核心 prompt 模板的客户端都会得到一致的身份和标题行为。

Agent 的默认模型逻辑放在 Desktop 的模型/Provider 状态层：读取 ACP 默认值；当 Provider 或 Model 缺失时读取已加载模型列表，取第一项，调用已有默认值保存接口。模型列表为空或读取失败时不伪造模型，继续显示可选择状态并给出原有错误处理。

### Desktop 导航与会话操作

`NavigationPanel` 继续负责侧栏布局和会话列表数据，`SessionRow` 增加独立的删除按钮。删除按钮阻止事件冒泡，避免误打开会话；确认后复用现有 `acpDeleteSession`、`acpChatSessionActions.deleteSnapshot` 和权限/elicitation 清理逻辑，并派发已有会话删除事件。

导航、模板、定时任务和扩展页优先使用 React Intl 消息。面向内置扩展的名称和描述通过稳定的扩展 ID 映射到本地化文案；未知或自定义扩展仍显示服务端提供的名称与描述。

### 用户菜单

抽取一个侧栏用户菜单组件，使用现有余额 hook/API 作为唯一数据源，避免重复轮询。组件读取余额响应中的 `displayName`/`userName`，按回退规则得到展示名；加载、未登录、无 PAT 和请求失败状态沿用现有余额状态。

用户触发器替换侧栏底部的“设置”导航行，显示余额和名称。菜单使用现有 DropdownMenu 基础组件，打开方向为顶部；菜单顶部展示名称与余额，菜单项导航至设置页并执行现有退出登录流程。余额不使用特殊红色样式。

### 主会话工具栏

在模型、目录、上下文、扩展、诊断、附件、语音和发送控件的现有 Tooltip/按钮结构中加入可收缩的短中文标签，保留无障碍 `aria-label` 和窄窗口下的图标布局。首页 `Hub` 的容器宽度从当前值增加一个响应式档位，不改变消息提交和会话创建流程。

## 错误处理与兼容性

- 默认模型读取失败或模型列表为空时，不写入无效配置，不覆盖已有配置。
- 删除失败时保留列表项并显示错误提示；删除成功后再清理前端快照，防止 UI 与后端状态不一致。
- 用户资料字段缺失时使用 `name`，两者均为空时显示“未登录用户”或当前已有的安全占位文案。
- 内部仍使用 `recipe`、`schedule`、`extension` 等 API、路由和类型名称，避免破坏 ACP 协议、深链接和已有数据。
- 中文提示词属于全局行为变更，CLI 和其他客户端会同步获得 HeyBuddy 身份及中文输出要求。

## 影响范围与文件职责

- `crates/goose/src/prompts/system.md`：全局 Agent 身份和语言约束。
- `crates/goose/src/prompts/session_name.md`：全局中文会话标题约束。
- `crates/goose/src/session/session_naming.rs` 及相关测试：验证标题 prompt 构造和输出处理不被破坏。
- `ui/desktop/src/components/ModelAndProviderContext.tsx`、模型选择组件及测试：首个可用模型默认逻辑。
- `ui/desktop/src/components/Layout/NavigationPanel.tsx`、会话 ACP 辅助逻辑及测试：会话垃圾箱和删除流程。
- `ui/desktop/src/components/Layout/BalanceWidget.tsx`、新增用户菜单组件及测试：余额、display name 回退和菜单交互。
- `ui/desktop/src/hooks/useNavigationItems.ts`、模板/定时任务/扩展页面及相关组件：导航和页面中文文案。
- `ui/desktop/src/components/settings/extensions/`、内置扩展文案资源：扩展名称和描述中文化。
- `ui/desktop/src/components/ChatInput.tsx`、底部工具栏组件和 `Hub.tsx`：工具标签与输入区域宽度。
- `ui/desktop/src/i18n/messages/zh-CN.json` 及对应默认消息：统一中文术语和完整本地化覆盖。

## 验证方案

### Agent 与模型

- 单元测试验证 system prompt 含 HeyBuddy 身份和中文输出约束。
- 单元测试验证标题 prompt 要求中文、只输出标题。
- UI 单元测试验证默认值缺失时选择模型列表第一项并保存，已有默认值保持不变，空列表不写入配置。

### Desktop UI

- 会话行测试验证垃圾箱按钮存在、阻止行点击，并在确认后调用删除流程。
- 用户菜单测试验证 `display_name` 优先、空值回退到 `name`，以及设置菜单项和向上打开行为。
- 本地化校验验证导航、模板、定时任务、扩展和工具栏关键文案不回退到英文。
- 运行 `pnpm --filter goose-app test:run`、`pnpm --filter goose-app typecheck`、格式检查和相关 Rust 测试。
- 使用 Node 24 重新构建 Desktop 包，检查应用可启动且构建产物包含 HeyBuddy 相关文案。
