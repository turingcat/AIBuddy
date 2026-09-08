# HeyBuddy 三阶段实现拆分方案

@author: logic
@date: 2026-08-11

> 本文是 [产品目标与功能规划](./2026-08-11-product-goals-and-features-design.md) 第 6.4 节「三阶段实施」的文件级落地。每个子项落到具体文件、改动性质、依赖与验收标准。

---

## 0. 总体判断

经代码探查确认：**goose 后端几乎零改动**，真实工作量集中在桌面端（Electron/React），后端仅新增一份内置 declarative provider 模板。

- 模型列表经 goose 既有的 inventory refresh → `GET {base_url}/v1/models` 自动拉取。
- base_url / key 通过环境变量注入，吃 goose「环境变量 > config.yaml > keyring」的优先级，**无需改后端配置读取逻辑**。
- 环境变量命名：`HEYBUDDY_API_KEY`、`HEYBUDDY_BASE_URL`（独立命名，不复用上游 `ZHIPU_*`）。

## 0.1 已确认的四个决策

1. 阶段一用**隐藏/禁用**，不删除文件（可逆、利于上游同步、符合数据安全原则）。
2. 环境变量用 **`HEYBUDDY_API_KEY` / `HEYBUDDY_BASE_URL`**，新增独立 `heybuddy.json` provider 模板。
3. provider 模板（原阶段三的 3.1/3.2）**提前到阶段二**，让阶段二的桩能端到端验证注入链路。
4. 测试采用 **TDD**（先写失败测试 → 实现 → 验证 → 提交）；推翻此前「先实现后补」的倾向。

---

## 阶段一：UI 减法（隐藏所有 provider/模型配置入口）

独立可做，不依赖登录。目标：用户在 UI 上看不到任何 provider / API key / base_url 概念。

| # | 子项 | 文件 | 改动 |
|---|---|---|---|
| 1.1 | 移除 onboarding 的 provider 引导 | `ui/desktop/src/components/onboarding/OnboardingGuard.tsx:175-202` 不再渲染 `ProviderSelector` 等子组件（文件保留，仅注释渲染分支） | 隐藏 |
| 1.2 | 移除 SettingsView 的 Auth / Local Inference / ConfigSettings 分区 | `ui/desktop/src/components/settings/SettingsView.tsx` 移除对应 TabsTrigger/TabsContent（约 177-186、215-218、234-241、273-278、280-288）；`ui/desktop/src/contexts/FeaturesContext.tsx` 硬编码 `localInference:false` | 隐藏 |
| 1.3 | 摘掉所有 `setView('ConfigureProviders')` 入口 | `ui/desktop/src/utils/navigationUtils.ts`、`settings/models/subcomponents/ModelSettingsButtons.tsx:45-56`、`settings/models/subcomponents/SwitchModelModal.tsx:819`、`settings/models/bottom_bar/ModelsBottomBar.tsx`（路由 `App.tsx:634` 保留但不可达） | 隐藏入口 |
| 1.4 | SwitchModelModal 锁定到 predefined 分支 | `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx` 强制 `usePredefinedModels=true`（只列模型名 radio，无 provider 下拉/key/custom 输入） | 条件化渲染 |
| 1.5 | 移除「Reset Provider」按钮 | `ui/desktop/src/components/settings/models/ModelsSection.tsx:119` 不渲染 `ResetProviderSection` | 隐藏 |
| 1.6 | 预置 `GOOSE_PREDEFINED_MODELS` 占位 | `ui/desktop/src/main.ts:854-866` 的 `getBundledConfig` 先放空数组或桩，让 predefined 分支有数据可读 | 修改 |

**验收标准**：启动应用，全程找不到任何「配置 provider / 输入 API key / 添加自定义 provider / 本地模型」入口；模型选择器只显示模型名列表。

**阶段一不是可发布状态**：配置入口隐藏后、登录闸建立前，应用处于「能打开但没模型、无法登录」的不可用中间态，必须与阶段二衔接。

---

## 阶段二：登录闸 + 配置注入骨架（含 provider 模板，桩接口）

### 后端（Rust，极小改动）

| # | 子项 | 文件 | 改动 |
|---|---|---|---|
| 2.1 | 新增内置 `heybuddy` declarative provider | 新建 `crates/goose-providers/src/declarative/definitions/heybuddy.json`：`engine:openai`、`api_key_env:HEYBUDDY_API_KEY`、`base_url:${HEYBUDDY_BASE_URL}`、`dynamic_models:true`、`skip_canonical_filtering:true` | 新增 |
| 2.2 | 注册该 provider | `crates/goose-providers/src/declarative.rs` 的 `expose_declarative_providers!` 宏追加 `heybuddy`（自动经 `register_declarative_providers` 注册，`all_bundled_providers_are_valid` 测试自动覆盖校验） | 修改 |

### 桌面端主进程（Electron main）

| # | 子项 | 文件 | 改动 |
|---|---|---|---|
| 2.3 | 新增凭证文件读写模块 | `ui/desktop/src/main.ts:172` 附近新增 `CREDENTIALS_FILE = path.join(app.getPath('userData'), 'credentials.json')`；仿 `getSettings/updateSettings`（L180-210）写 `getCredentials/writeCredentials/clearCredentials`（权限 0o600） | 新增 |
| 2.4 | 新增登录态 IPC 通道 | `ui/desktop/src/main.ts` 新增 `ipcMain.handle('get-login-credentials' / 'set-login-credentials' / 'clear-login-credentials' / 'is-logged-in')` | 新增 |
| 2.5 | spawn goose serve 时注入 `HEYBUDDY_*` 环境变量 | `ui/desktop/src/main.ts:1149-1151` 的 `startGooseServe({env})` 追加 `HEYBUDDY_BASE_URL`、`HEYBUDDY_API_KEY`（值来自 `getCredentials()`，经 `buildGooseServeEnv` 合并） | 修改 |

### 桌面端渲染进程（React）

| # | 子项 | 文件 | 改动 |
|---|---|---|---|
| 2.6 | preload 暴露登录态 IPC | `ui/desktop/src/preload.ts` ElectronAPI type（约 L134）+ electronAPI 实现（约 L256）加 `getLoginCredentials / setLoginCredentials / clearLoginCredentials / isLoggedIn` | 新增 |
| 2.7 | OnboardingGuard 判定改为「是否登录」 | `ui/desktop/src/components/onboarding/OnboardingGuard.tsx:165` `hasProvider`→`isLoggedIn`（调 `window.electron.getLoginCredentials()`）；L175-202 渲染登录页或 `navigate('/login')` | 修改 |
| 2.8 | 新增 `/login` 路由 + LoginView 组件 | `ui/desktop/src/App.tsx:632-637` 间加免守卫 `<Route path="login">`；新建 `ui/desktop/src/components/auth/LoginView.tsx` | 新增 |
| 2.9 | 登录用桩接口（mock） | LoginView 暂调本地 mock（返回固定的桩 `{token, base_url, key}`），写凭证文件 | 新增 |

**验收标准**：
- 未登录 → 停在登录页，进不了主界面。
- 桩登录 → 凭证写入 `credentials.json`；主界面可进；goose serve 子进程环境含 `HEYBUDDY_BASE_URL` / `HEYBUDDY_API_KEY`（日志可验证）。
- 用一个本地 mock `/v1/models` 端点 + 桩 base_url，可看到模型列表被拉回（验证 2.1/2.2 的 provider 模板接通了注入链路）。

---

## 阶段三：真实对接（端到端跑通）

| # | 子项 | 文件 | 改动 |
|---|---|---|---|
| 3.1 | 真实登录接口对接 | `ui/desktop/src/components/auth/LoginView.tsx` 的桩换成服务端真实登录 API（契约见规划文档第 7.1 节），取 `{token, base_url, key}` 写凭证 | 修改 |
| 3.2 | 模型列表拉取 | **无需改动**——goose inventory refresh 自动 `GET {base_url}/v1/models`，UI 经 `acpListProviderDetails` 拿到 | 无 |
| 3.3 | 选模型发对话 | **无需改动**——`SwitchModelModal` predefined 分支 + `ModelAndProviderContext.changeModel` 现成 | 无 |

**验收标准**：真实登录 → 服务端下发 base_url/key → goose 拉到 `/v1/models` 模型列表 → 用户选模型名 → 发起对话成功。

---

## 阶段间依赖

```
阶段一（UI 减法，独立可做）
   │  完成后处于不可用中间态，必须衔接阶段二
   ▼
阶段二（登录闸 + 注入骨架 + provider 模板，桩接口）
   │  本身可独立验证；Rust 改动极小
   ▼
阶段三（真实接口对接，端到端）
```

- 阶段二、三不阻塞服务端设计——服务端 API 可与阶段一、二并行开发（契约见规划文档第 7 节）。
- 阶段二的 provider 模板（2.1/2.2）已提前，使阶段二能端到端验证注入链路。

## 测试策略

- 采用 **TDD**：每个子项先写失败测试 → 实现最小代码使测试通过 → 验证 → 提交（与 writing-plans skill 默认一致）。
- 桌面端 TS/React 改动用仓库既有的 vitest + playwright；后端 Rust 改动用 cargo test。
- 覆盖率指标遵循 AGENTS.md：路径覆盖 ≥ 80%。
- `heybuddy.json` provider 模板由 goose 现成的 `all_bundled_providers_are_valid` 测试自动覆盖校验，无需额外单测。

## 分支策略

依 AGENTS.md：每个阶段（或阶段内可独立验证的子项组）在新分支上开发，充分测试验证后才能合并到 `main`。
