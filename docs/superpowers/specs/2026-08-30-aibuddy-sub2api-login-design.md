# AIBuddy sub2api 登录设计

## 背景

HeyBuddy 与 AIBuddy 共用桌面端代码，但认证来源不同：

- HeyBuddy 继续使用 `ai.linyeyun.cn` 的公司 OA 登录接口。
- AIBuddy 使用 `tflow.online` 部署的 sub2api 邮箱登录接口。

tflow.online 已启用阿里云验证码 2.0。AIBuddy 当前未生成或提交 `captchaVerifyParam`，因此 sub2api 返回 `ALIYUN_CAPTCHA_VERIFICATION_FAILED`。

## 目标

1. AIBuddy 按 sub2api 当前公开契约完成邮箱、密码和阿里云验证码登录。
2. 登录后自动复用名为 `AIBuddy` 的有效 API Key；不存在时自动创建。
3. 将网关地址和 API Key 写入现有本地加密凭证，重启后由 `heybuddy` provider 使用。
4. 支持 sub2api 的 TOTP 二次验证响应。
5. HeyBuddy 的 OA 登录行为保持不变。

## 非目标

- 不修改 tflow.online 或 sub2api 服务端。
- 不新增注册、找回密码或第三方 OAuth 流程。
- 不在本次接入 sub2api 余额协议；AIBuddy 不显示现有 new-api 专用余额组件。
- 不改变 goose agent loop 或 provider 行为。

## 上游契约

设计依据为 `Wei-Shaw/sub2api` GitHub 仓库 `main` 分支提交 `b5827cfd54d58c248a9480b800444d0b40f0c6ea`，并用 tflow.online 的公开设置接口验证当前生产配置。

### 公开设置

`GET /api/v1/settings/public`

使用字段：

- `aliyun_captcha_enabled`
- `aliyun_captcha_scene_id`
- `aliyun_captcha_prefix`
- `aliyun_captcha_region`
- `api_base_url`

### 登录

`POST /api/v1/auth/login`

```json
{
  "email": "user@example.com",
  "password": "password",
  "turnstile_token": "captchaVerifyParam"
}
```

阿里云的 `captchaVerifyParam` 按 sub2api 约定复用 `turnstile_token` 字段。成功响应返回 access token；启用 TOTP 的用户先收到 `requires_2fa`、`temp_token` 和脱敏邮箱。

### TOTP

`POST /api/v1/auth/login/2fa`

```json
{
  "temp_token": "temporary-token",
  "totp_code": "123456"
}
```

### API Key

- `GET /api/v1/keys?page=1&page_size=100&search=AIBuddy&status=active`
- `POST /api/v1/keys`

创建请求体为 `{ "name": "AIBuddy" }`，并发送每次 provisioning 流程稳定、不同流程唯一的 `Idempotency-Key`，防止网络重试产生重复 Key。

## 架构

### Edition 配置

品牌清单增加认证类型和默认认证地址：

- HeyBuddy：`oa`、`https://ai.linyeyun.cn`
- AIBuddy：`sub2api`、`https://tflow.online`

主进程构建配置按 `APP_EDITION` 选择默认地址。HeyBuddy 保留现有地址覆盖能力；AIBuddy 提供独立地址覆盖变量，避免全局 `.env.production` 把 AIBuddy 误指向 OA 服务。

### 主进程认证客户端

新增独立的 sub2api 客户端模块，负责：

- 获取公开设置。
- 初次邮箱密码登录。
- 完成 TOTP 登录。
- 解包 `{ code, message, reason, data }` 响应。
- 查找或创建 AIBuddy API Key。
- 生成现有 `LoginCredentials`。

HTTP 方法接受可注入的 fetch 和幂等键生成器，便于单元测试。主进程通过 IPC 暴露窄接口，renderer 不持有跨域请求逻辑。

### Renderer 登录入口

现有 `LoginView` 根据 `APP_EDITION` 分流：

- HeyBuddy 渲染原 OA 表单并调用现有 `login()`。
- AIBuddy 渲染邮箱表单、阿里云验证控件和必要时出现的 TOTP 输入步骤。

认证成功后，两条路径都调用现有 `setLoginCredentials()` 和 `restartApp()`。

### 阿里云验证码控件

React 控件遵循 sub2api `AliyunCaptchaWidget.vue` 的生命周期：

1. 在加载 SDK 前设置 `window.AliyunCaptchaConfig`。
2. 从 `https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js` 加载脚本。
3. 以 popup 模式初始化，使用公开设置中的 SceneId、prefix、region。
4. SDK 回调只缓存并返回 `captchaVerifyParam`，不在控件内调用业务接口。
5. 登录请求结束后重置一次性证明；失败时用户必须重新验证。
6. 卸载时清理定时器、等待中的 Promise 和 SDK 遗留弹窗节点。

控件暴露 `verify()` 和 `reset()`。用户可主动点击验证；提交表单时若尚未验证，则程序化打开验证弹窗并等待结果。

### CSP

主进程动态 CSP 与 HTML 初始 CSP 的 `script-src`、`style-src` 增加阿里云 CDN 白名单。现有 `connect-src` 和 `frame-src` 已允许 HTTPS，不扩大其他能力。

## 数据流

1. AIBuddy 登录页挂载，通过 IPC 获取公开设置。
2. 验证码启用且配置完整时初始化阿里云 SDK；配置不完整时阻止登录并显示配置错误。
3. 用户提交邮箱和密码，控件返回一次性证明。
4. 主进程调用 sub2api 登录接口。
5. 若需要 TOTP，renderer 切换到验证码步骤；完成后取得 access token。
6. 主进程查询精确名称为 `AIBuddy` 且状态为 active 的 Key。
7. 找到时复用最新 Key；未找到时用幂等键创建。
8. 将凭证写为：
   - `token`: sub2api access token
   - `baseUrl`: 公开 `api_base_url` 规范化后追加 `/v1`
   - `apiKey`: 复用或创建的完整 Key
   - `authKind`: `sub2api`
9. 应用重启，现有 provider 环境变量映射继续使用 `baseUrl` 和 `apiKey`。

HeyBuddy 登录凭证写入 `authKind: oa`；旧凭证缺少该字段时按 OA 处理，保持向后兼容。

## 错误处理

- 设置接口网络、超时、HTTP 和响应格式错误转换为中文可读消息。
- sub2api 业务错误优先显示 `message`，保留稳定 `reason` 供测试和后续本地化。
- 用户关闭验证码弹窗时不发送登录请求，恢复可重试状态。
- SDK 加载失败时显示验证码加载失败，不降级为无验证码登录。
- TOTP 错误保留 TOTP 步骤，允许重试；重新提交账号密码会重新走验证码。
- Key 查询失败不自动创建，避免服务异常时产生重复 Key。
- Key 创建使用幂等键；创建成功但响应丢失时，同一流程重试可得到同一结果。
- API Base URL 或 Key 响应缺失时不写入本地凭证。

## UI

AIBuddy 页面沿用现有紧凑登录卡片：

- 标题使用 `AIBuddy`。
- 字段为邮箱和密码。
- 验证控件显示未验证、验证中、已验证三种状态。
- TOTP 响应出现后显示六位验证码输入、确认和返回账号登录操作。
- 设置加载和提交期间禁用相关操作，避免重复请求。

不增加说明性营销文案或嵌套卡片。

## 测试

按测试先行覆盖以下路径：

1. Edition 配置分别解析 OA 和 sub2api 地址，AIBuddy 不受 HeyBuddy 环境变量污染。
2. 公开设置响应解包和错误分类。
3. 登录请求准确提交 `email/password/turnstile_token`。
4. 普通登录与 TOTP 分支。
5. 精确复用 active 的 `AIBuddy` Key。
6. 无可用 Key 时发送幂等创建请求。
7. Key 查询失败时不创建，响应字段缺失时不生成凭证。
8. 阿里云控件初始化、验证、关闭、重置、脚本错误和卸载清理。
9. LoginView 的 HeyBuddy OA 路径保持不变。
10. LoginView 的 AIBuddy 普通登录、TOTP 和错误重试路径。
11. CSP 仅增加所需阿里云 CDN 来源。
12. AIBuddy 隐藏 new-api 专用余额组件，HeyBuddy 保持显示。

执行针对性的 Vitest 测试、桌面 typecheck 和格式检查。Rust 代码不变，不需要 cargo 测试。
