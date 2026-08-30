# AIBuddy tflow 独立运行时设计

## 背景

HeyBuddy 与 AIBuddy 共用 Electron 桌面壳和 Goose 通用能力，但站点协议不同：

- HeyBuddy 使用公司 OA 登录和现有 new-api 账户接口。
- AIBuddy 全程使用 `https://tflow.online` 的 sub2api 面板及网关接口。

当前 AIBuddy 已能完成 sub2api 邮箱、阿里云验证码和 TOTP 登录，但登录后的账户、余额、API Key、模型和 provider 运行时仍部分复用了 HeyBuddy/OA 路径。自动创建的 `AIBuddy` Key 未携带 `group_id`，而 sub2api 网关会拒绝未分组 Key，因此模型目录和后续模型调用无法正常工作。

## 目标

1. AIBuddy 的登录、用户资料、余额、分组、API Key、模型目录和模型调用全部与 `tflow.online` 交互。
2. 登录后由用户明确选择一个 sub2api 可用分组，模型目录和实际调用始终使用该分组的 API Key。
3. AIBuddy 主界面用户名显示用户邮箱 `@` 前的部分，并显示 sub2api 的美元余额。
4. AIBuddy 使用独立的 Goose provider 和环境变量，不复用 HeyBuddy provider 的运行时身份。
5. 梳理站点无关的认证后运行流程，使后续站点通过新增适配器快速接入。
6. HeyBuddy 的 OA 登录、账户、余额、模型和调用行为保持不变。

## 非目标

- 不修改 tflow.online 或 sub2api 服务端。
- 不接入注册、找回密码或第三方 OAuth。
- 不在本次提供登录后的分组切换；切换分组通过退出后重新登录完成。
- 不跨多个 sub2api 分组合并模型或在单个会话中动态切换分组 Key。
- 不修改 Goose agent loop。

## sub2api 契约

设计依据为 `Wei-Shaw/sub2api` GitHub 仓库当前 `main` 分支。

### 用户与余额

使用面板 access token 请求：

```http
GET https://tflow.online/api/v1/auth/me
Authorization: Bearer <access-token>
```

标准响应 `data` 至少包含：

```json
{
  "email": "alice@example.com",
  "username": "alice",
  "balance": 12.34
}
```

AIBuddy 不采用 sub2api 的 `username` 作为桌面展示名，而是从 `email` 派生 `alice`。`balance` 已是美元金额，不执行 new-api quota 换算。

### 可用分组

使用面板 access token 请求：

```http
GET https://tflow.online/api/v1/groups/available
Authorization: Bearer <access-token>
```

登录成功后进入分组选择步骤。即使只有一个分组，也展示已选分组后由用户确认继续；零分组时阻止凭据落盘并显示明确错误。

### API Key

选定分组后，查询该分组下名称完全等于 `AIBuddy` 的有效 Key：

```http
GET https://tflow.online/api/v1/keys?page=1&page_size=100&search=AIBuddy&status=active&group_id=<group-id>
Authorization: Bearer <access-token>
```

仅复用 `name === "AIBuddy"`、`status === "active"` 且 `group_id` 等于所选分组的 Key。旧版本创建的未分组 Key 不复用也不删除。

不存在时创建：

```http
POST https://tflow.online/api/v1/keys
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: <uuid>

{
  "name": "AIBuddy",
  "group_id": 123
}
```

### 模型和调用

使用所选分组的 API Key 请求：

```http
GET https://tflow.online/v1/models
Authorization: Bearer <api-key>
```

返回 OpenAI 兼容的 `{ "object": "list", "data": [...] }`。模型请求继续使用同一网关基址和 API Key，通过 OpenAI 兼容端点发送。分组选择后必须先成功读取非空模型列表，才能保存凭据并进入主界面。

## 架构

### 站点运行时模型

新增站点无关的数据模型，统一表示桌面端在登录后需要的能力：

- `siteKind`：稳定站点协议标识，例如 `oa`、`sub2api`。
- `account`：邮箱、显示名和余额等账户摘要。
- `target`：模型调用目标；OA 为隐式单目标，sub2api 为用户选择的分组。
- `gateway`：provider ID、网关基址和 API Key。
- `session`：站点面板令牌及站点特有的可选会话字段。

本地凭据继续加密保存，但由扁平的 HeyBuddy 字段扩展为可以表达站点、账户、目标和网关的信息。读取逻辑兼容现有 OA 凭据和本分支早期 AIBuddy 凭据，写入统一的新结构。敏感令牌不进入 renderer 持久状态。

### 站点适配器

主进程建立窄接口的站点适配器注册表。通用编排层负责：

1. 根据 edition 选择适配器。
2. 执行登录并处理适配器返回的挑战状态。
3. 获取账户摘要和可用调用目标。
4. 根据用户选择 provision 网关访问凭据。
5. 验证并标准化模型目录。
6. 保存统一凭据并生成 Goose provider 环境。
7. 在主界面刷新账户摘要、余额和模型。

适配器只负责协议差异：

- OA 适配器封装现有 OA 登录、PAT/new-api 账户接口和 HeyBuddy 网关。
- sub2api 适配器封装验证码/TOTP、`/auth/me`、可用分组、分组 Key 和 tflow 网关。

通用层不包含 URL 字符串、响应包格式或站点字段名。新增站点时注册新的 adapter 和 edition 配置，不修改主界面账户菜单、模型选择器或 Goose 启动编排。

### Provider 隔离

保留现有 `heybuddy` declarative provider，并新增 `aibuddy` provider：

- HeyBuddy：`HEYBUDDY_BASE_URL`、`HEYBUDDY_API_KEY`、`GOOSE_PROVIDER=heybuddy`。
- AIBuddy：`AIBUDDY_BASE_URL`、`AIBUDDY_API_KEY`、`GOOSE_PROVIDER=aibuddy`。

两个 provider 都可使用 OpenAI 兼容引擎和动态模型，但拥有独立 ID、显示名称和环境变量。凭据到 Goose 环境的映射由站点运行时统一入口完成，不能根据 UI 品牌猜测。

### Renderer 登录状态

登录视图保持 edition 专属表单，但消费统一的主进程结果状态：

- OA：账号密码 -> 完成。
- tflow：邮箱密码和阿里云验证码 -> 可选 TOTP -> 分组选择 -> provisioning -> 完成。

tflow 登录状态在 renderer 中只保留临时流程标识和可展示数据。access token 只在主进程流程状态中使用，最终通过加密凭据持久化。

分组选择界面显示分组名称，提供返回登录和继续操作。提交期间禁止重复请求。provisioning 失败或模型为空时保留当前分组选择，允许用户改选或重试。

### 账户和余额

主界面继续通过一个站点无关 IPC 获取账户摘要。主进程根据已保存凭据的 `siteKind` 分派：

- OA 适配器调用现有 `/api/user/self` 和 `/api/status`，保留 quota 换算、已用额度和请求数。
- sub2api 适配器调用 `/api/v1/auth/me`，返回邮箱前缀和美元余额；没有已用额度和请求数字段时不在 Tooltip 中伪造数据。

账户菜单只消费标准化结果，不包含 edition 判断。AIBuddy 不再隐藏余额组件。

### 模型目录

模型 IPC 使用统一凭据中的 `gateway` 请求 `/models`，并标准化为当前 renderer 使用的模型结构。provider ID随模型一起返回，避免 renderer 回退到硬编码的 `heybuddy`。

首次进入主界面时，如果当前默认 provider 与凭据中的 provider 不一致，使用模型目录第一项写入对应 provider 的默认模型。AIBuddy 旧版本保存的 `heybuddy` 默认值因此会迁移到 `aibuddy`，后续模型切换和请求都保持同一 provider。

## 错误处理

- 面板 access token 无效：返回 unauthorized，主界面提示重新登录。
- 用户资料缺少合法邮箱或余额：认证后流程失败，不保存不完整凭据。
- 无可用分组：停留在登录流程并提示账号没有可用模型分组。
- Key 查询或创建失败：保留分组选择，显示 sub2api 的 `message` 和 `reason`。
- `/v1/models` 返回 HTTP 错误、格式错误或空列表：不保存凭据，允许选择其他分组。
- 已保存凭据无法迁移：按未登录处理，不把错误字段注入 Goose 子进程。
- OA 和 sub2api 错误消息互不转换，不泄漏令牌或 API Key。

## 测试

所有功能代码先写失败测试，覆盖以下路径：

1. 统一凭据的新格式、旧 OA 凭据迁移和早期 AIBuddy 凭据兼容。
2. 站点注册表选择 OA/sub2api 适配器，未知站点明确失败。
3. OA 适配器保持现有登录、余额、模型和 provider 环境。
4. sub2api 普通登录、TOTP、`/auth/me` 账户解析和邮箱前缀派生。
5. 零/单个/多个可用分组及 renderer 分组选择状态。
6. 仅复用所选分组的精确名称有效 Key，创建请求携带 `group_id` 和幂等键。
7. Key provision 后模型验证成功、HTTP 失败、响应格式异常和空模型。
8. AIBuddy 余额按美元直接显示，缺失的已用额度和请求数不显示。
9. 模型目录携带 `aibuddy` provider，旧默认 provider 自动纠正。
10. Goose 子进程分别收到 `HEYBUDDY_*` 或 `AIBUDDY_*`，不存在交叉注入。
11. 登录到主界面的 AIBuddy 集成路径，以及 HeyBuddy OA 回归路径。

受影响模块维持至少 80% path coverage，并运行桌面端相关单元测试、类型检查、格式检查和最终 AIBuddy 本地打包验证。
