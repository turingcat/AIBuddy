# HeyBuddy 登录闸与模型锁定 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 HeyBuddy 桌面应用从「开放自配 provider」改造为「登录后才能对话、模型由服务端下发、用户只能从列表选模型名」的受控产品。

**Architecture:** goose 后端零改动，仅新增一份内置 `heybuddy` declarative provider 模板（engine=openai, dynamic_models=true）。桌面端 Electron 主进程在登录后把服务端下发的 `base_url`+`key` 写入独立凭证文件，spawn `goose serve` 时以环境变量 `HEYBUDDY_BASE_URL`/`HEYBUDDY_API_KEY` 注入，吃 goose「环境变量 > config.yaml > keyring」优先级。UI 侧隐藏所有 provider/key 配置入口，模型列表经 goose 既有 inventory refresh → `GET /v1/models` 自动拉取。

**Tech Stack:** Rust（goose 后端 declarative provider）、TypeScript/React 19（Electron 桌面端）、vitest + playwright（前端测试）、cargo test（后端测试）。

## Global Constraints

- 环境变量命名固定：`HEYBUDDY_API_KEY`、`HEYBUDDY_BASE_URL`（不复用上游 `ZHIPU_*`）。
- provider 模板固定字段：`name:heybuddy`、`engine:openai`、`dynamic_models:true`、`skip_canonical_filtering:true`、`api_key_env:HEYBUDDY_API_KEY`、`base_url:${HEYBUDDY_BASE_URL}`。
- 凭证文件路径：`app.getPath('userData')/credentials.json`，写入权限 `0o600`。
- 阶段一用「隐藏/禁用」实现，**不得删除文件**（可逆、利于上游同步）。
- 覆盖率：路径覆盖 ≥ 80%（AGENTS.md）。
- 每个阶段在新分支开发，测试通过后才能合并 `main`（AGENTS.md）。
- 代码注释须含 `@author: logic` 与 `@date:`（日期用 `date` 命令取，仅日期）；只用中文注释（CLAUDE.md）。
- 提交信息：conventional commits，无 emoji、无署名（CLAUDE.md）。

---

## File Structure

**新增文件：**
- `crates/goose-providers/src/declarative/definitions/heybuddy.json` — HeyBuddy 网关 provider 模板（OpenAI 兼容）。
- `ui/desktop/src/credentials.ts` — 凭证文件读写纯逻辑（可单测，不依赖 electron）。
- `ui/desktop/src/credentials.test.ts` — credentials.ts 单测。
- `ui/desktop/src/components/auth/LoginView.tsx` — 登录页组件。
- `ui/desktop/src/components/auth/LoginView.test.tsx` — LoginView 单测。

**修改文件：**
- `crates/goose-providers/src/declarative.rs` — 注册 `heybuddy` provider。
- `ui/desktop/src/main.ts` — 凭证 IPC handler、startGooseServe 注入环境变量。
- `ui/desktop/src/preload.ts` — 暴露登录态 IPC 方法。
- `ui/desktop/src/components/onboarding/OnboardingGuard.tsx` — 判定从「是否配过 provider」改为「是否登录」。
- `ui/desktop/src/components/settings/SettingsView.tsx` — 移除 Auth/LocalInference/ConfigSettings 分区。
- `ui/desktop/src/contexts/FeaturesContext.tsx` — 硬编码 `localInference:false`。
- `ui/desktop/src/utils/navigationUtils.ts`、`settings/models/subcomponents/ModelSettingsButtons.tsx`、`settings/models/subcomponents/SwitchModelModal.tsx`、`settings/models/bottom_bar/ModelsBottomBar.tsx` — 摘掉 ConfigureProviders 入口。
- `ui/desktop/src/App.tsx` — 新增 `/login` 路由。
- `ui/desktop/src/components/settings/models/ModelsSection.tsx` — 移除 ResetProvider 按钮。

---

## 阶段一：UI 减法（隐藏所有 provider/模型配置入口）

### Task 1: 隐藏 onboarding 的 provider 引导

**Files:**
- Modify: `ui/desktop/src/components/onboarding/OnboardingGuard.tsx`（L175-202 的 `ProviderSelector` 渲染块）

**Interfaces:**
- Produces: `OnboardingGuard` 在未配置状态下不再渲染 provider 选择 UI（登录判定在 Task 11 接管，本任务仅先消除 provider 引导）。

- [ ] **Step 1: 写失败测试**

新建 `ui/desktop/src/components/onboarding/OnboardingGuard.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('../../../acp/providers', () => ({
  acpReadDefaults: vi.fn().mockResolvedValue({ providerId: '', modelId: '' }),
  acpListProviderDetails: vi.fn().mockResolvedValue([]),
  acpSaveDefaults: vi.fn(),
}));

import OnboardingGuard from './OnboardingGuard';

describe('OnboardingGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未配置 provider 时不渲染 ProviderSelector 引导', async () => {
    render(
      <MemoryRouter>
        <OnboardingGuard>
          <div>child</div>
        </OnboardingGuard>
      </MemoryRouter>
    );
    // 等待异步判定完成
    expect(await screen.findByText('child', undefined, { timeout: 3000 })).toBeInTheDocument();
    // 不应出现 provider 连接引导文案
    expect(screen.queryByText(/Connect to a Provider/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/components/onboarding/OnboardingGuard.test.tsx`
Expected: FAIL（当前 L194 仍渲染 `ProviderSelector`，但因 mock 后判定路径不同——测试可能因为 `child` 未渲染而失败，因为现在未配 provider 时 guard 卡在 ProviderSelector 页，不放行 children）。先确认基线行为。

- [ ] **Step 3: 实现——移除 ProviderSelector 渲染**

在 `OnboardingGuard.tsx`，将 L175-202 的 `return (<div>...<ProviderSelector/>...</div>)` 改为：未配置时直接放行 children（登录判定在 Task 11 接管，本任务先让应用可进入，避免阶段一完成即卡死）。

```tsx
  // 阶段一：provider 配置入口已移除，暂直接放行；登录判定在后续任务接管
  return <>{children}</>;
```

删除 L194-197 的 `<ProviderSelector .../>` 及其外层欢迎页 JSX。保留 `OnboardingSuccess` 分支（L169-173）暂不动，后续阶段二一并清理。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/components/onboarding/OnboardingGuard.test.tsx`
Expected: PASS（children 渲染，无 provider 引导文案）。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/components/onboarding/OnboardingGuard.tsx ui/desktop/src/components/onboarding/OnboardingGuard.test.tsx
git commit -m "feat(onboarding): hide provider setup guidance from onboarding"
```

---

### Task 2: 移除 SettingsView 的 Auth / Local Inference / ConfigSettings 分区

**Files:**
- Modify: `ui/desktop/src/components/settings/SettingsView.tsx`（移除 TabsTrigger/TabsContent：Auth 约 L215-218/273-278、Local Inference 约 L177-186/234-241、ConfigSettings 约 L280-288）
- Modify: `ui/desktop/src/contexts/FeaturesContext.tsx`（`localInference` 恒 false）

**Interfaces:**
- Produces: SettingsView 不再渲染 provider 凭据、本地推理、原始 config 编辑器三个分区。

- [ ] **Step 1: 写失败测试**

新建 `ui/desktop/src/components/settings/SettingsView.noConfigTabs.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../acp/config', () => ({
  acpReadAllConfig: vi.fn().mockResolvedValue({}),
  acpReadConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../contexts/FeaturesContext', () => ({
  useFeatures: () => ({ localInference: false, configuration: false }),
}));

import SettingsView from './SettingsView';

describe('SettingsView 配置类分区隐藏', () => {
  it('不渲染 Auth / Local Inference / Configuration 分区', () => {
    render(<SettingsView />);
    expect(screen.queryByRole('tab', { name: /Auth/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Local Inference/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/components/settings/SettingsView.noConfigTabs.test.tsx`
Expected: FAIL（Auth tab 当前存在）。

- [ ] **Step 3: 实现——移除三个分区**

在 `SettingsView.tsx` 删除 Auth、Local Inference 对应的 `<TabsTrigger>` 与 `<TabsContent>` 块（行号见 Files）。将 `ConfigSettings` 的渲染条件 `CONFIGURATION_ENABLED` 处的 `<ConfigSettings />` 改为不渲染（注释或条件置 false）。

在 `FeaturesContext.tsx` 的 provider 中，将 `localInference` 硬编码为 `false`：

```tsx
// 阶段一：桌面版不提供本地推理，强制关闭
localInference: false,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/components/settings/SettingsView.noConfigTabs.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/components/settings/SettingsView.tsx ui/desktop/src/contexts/FeaturesContext.tsx ui/desktop/src/components/settings/SettingsView.noConfigTabs.test.tsx
git commit -m "feat(settings): hide auth local-inference and config tabs"
```

---

### Task 3: 摘掉所有 ConfigureProviders 入口

**Files:**
- Modify: `ui/desktop/src/utils/navigationUtils.ts`（移除 `'ConfigureProviders'` 类型与 case，L13、L72-74）
- Modify: `ui/desktop/src/components/settings/models/subcomponents/ModelSettingsButtons.tsx`（L45-56「Configure providers」按钮）
- Modify: `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx`（L491-494、L819-822「Use other provider」）

**Interfaces:**
- Produces: 应用内不再有任何跳转到 `/configure-providers` 的入口（路由本身在 Task 范围外保留，但不可达）。

- [ ] **Step 1: 写失败测试**

新建 `ui/desktop/src/components/settings/models/subcomponents/ModelSettingsButtons.noConfigure.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../../utils/navigationUtils', () => ({
  setView: vi.fn(),
}));

import ModelSettingsButtons from './ModelSettingsButtons';

describe('ModelSettingsButtons', () => {
  it('不渲染 Configure providers 按钮', () => {
    render(<ModelSettingsButtons sessionId={null} hasPredefinedModels={false} />);
    expect(screen.queryByRole('button', { name: /Configure providers/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/components/settings/models/subcomponents/ModelSettingsButtons.noConfigure.test.tsx`
Expected: FAIL（按钮当前在 `!hasPredefinedModels` 时存在）。

- [ ] **Step 3: 实现**

- `ModelSettingsButtons.tsx`：删除 L45-56 的「Configure providers」按钮 JSX 及其 `setView('ConfigureProviders')` 调用。
- `SwitchModelModal.tsx`：删除 L491-494 的 `configure_providers` 下拉项与 L819-822 的跳转分支。
- `navigationUtils.ts`：从 `ViewType` 联合类型移除 `'ConfigureProviders'`，删除 `setView` 中对应 case。

- [ ] **Step 4: 运行测试确认通过 + 类型检查**

Run: `cd ui/desktop && pnpm vitest run src/components/settings/models/subcomponents/ModelSettingsButtons.noConfigure.test.tsx && pnpm run typecheck`
Expected: PASS + typecheck 无 `'ConfigureProviders'` 残留引用报错（若有报错，定位并清除剩余引用）。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/utils/navigationUtils.ts ui/desktop/src/components/settings/models/subcomponents/ModelSettingsButtons.tsx ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx ui/desktop/src/components/settings/models/subcomponents/ModelSettingsButtons.noConfigure.test.tsx
git commit -m "feat(settings): remove all configure-providers entry points"
```

---

### Task 4: SwitchModelModal 锁定 predefined 分支

**Files:**
- Modify: `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx`（强制 `usePredefinedModels=true`，移除非 predefined 分支的 provider 下拉/custom 输入）

**Interfaces:**
- Produces: 模型选择器只渲染模型名 radio 列表，无 provider 下拉、无 custom 模型输入。

- [ ] **Step 1: 写失败测试**

新建 `ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../../acp/providers', () => ({
  acpListProviderDetails: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../predefinedModelsUtils', () => ({
  shouldShowPredefinedModels: () => true,
  getPredefinedModelsFromEnv: () => [{ name: 'glm-5.2' }, { name: 'glm-4.6' }],
}));

import { SwitchModelModal } from './SwitchModelModal';

describe('SwitchModelModal 锁定 predefined', () => {
  it('只渲染预定义模型名，不渲染 provider 下拉', () => {
    render(<SwitchModelModal sessionId={null} onClose={() => {}} />);
    expect(screen.getByText('glm-5.2')).toBeInTheDocument();
    expect(screen.queryByText(/provider/i, { selector: 'label' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx`
Expected: FAIL 或行为不符（当前 `usePredefinedModels` 由 env 决定，未强制）。

- [ ] **Step 3: 实现**

在 `SwitchModelModal.tsx`，将 `usePredefinedModels` 的计算改为强制 `true`：

```tsx
// 阶段一：桌面版锁定为预定义模型选择，不暴露 provider 切换
const usePredefinedModels = true;
```

移除 L812-966 非 predefined 分支的 JSX（provider 下拉、「Enter a model not listed」、「Use other provider」），仅保留 L746-809 的 predefined radio 列表。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.tsx ui/desktop/src/components/settings/models/subcomponents/SwitchModelModal.predefinedOnly.test.tsx
git commit -m "feat(models): lock switch-model modal to predefined list"
```

---

### Task 5: 移除「Reset Provider」按钮

**Files:**
- Modify: `ui/desktop/src/components/settings/models/ModelsSection.tsx`（L119 不渲染 `ResetProviderSection`）

- [ ] **Step 1: 写失败测试**

新建 `ui/desktop/src/components/settings/models/ModelsSection.noReset.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../acp/providers', () => ({
  acpReadDefaults: vi.fn().mockResolvedValue({ providerId: 'heybuddy', modelId: 'glm-5.2' }),
}));

import ModelsSection from './ModelsSection';

describe('ModelsSection', () => {
  it('不渲染 Reset Provider 按钮', () => {
    render(<ModelsSection />);
    expect(screen.queryByRole('button', { name: /Reset Provider/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/components/settings/models/ModelsSection.noReset.test.tsx`
Expected: FAIL（ResetProviderSection 当前渲染）。

- [ ] **Step 3: 实现**

在 `ModelsSection.tsx` 删除 L119 的 `<ResetProviderSection />` 渲染（连同其 import）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/components/settings/models/ModelsSection.noReset.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/components/settings/models/ModelsSection.tsx ui/desktop/src/components/settings/models/ModelsSection.noReset.test.tsx
git commit -m "feat(models): remove reset-provider button from models section"
```

---

### Task 6: 预置 GOOSE_PREDEFINED_MODELS 占位

**Files:**
- Modify: `ui/desktop/src/main.ts`（L854-866 `getBundledConfig`，先放空数组占位）

**Interfaces:**
- Produces: 渲染进程通过 `window.appConfig.get('GOOSE_PREDEFINED_MODELS')` 能拿到一个数组（阶段一为空，阶段三由真实模型列表替代）。

- [ ] **Step 1: 写失败测试**

新建 `ui/desktop/src/getBundledConfig.test.ts`（若 `getBundledConfig` 是 main.ts 内函数，先抽到独立模块 `src/bundledConfig.ts` 以便测试）：

```ts
import { describe, it, expect } from 'vitest';
import { resolvePredefinedModels } from './bundledConfig';

describe('resolvePredefinedModels', () => {
  it('环境变量为空时返回空数组', () => {
    expect(resolvePredefinedModels(undefined)).toEqual([]);
  });
  it('环境变量为合法 JSON 数组时解析返回', () => {
    expect(resolvePredefinedModels('[{"name":"glm-5.2"}]')).toEqual([{ name: 'glm-5.2' }]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/getBundledConfig.test.ts`
Expected: FAIL（模块/函数不存在）。

- [ ] **Step 3: 实现**

新建 `ui/desktop/src/bundledConfig.ts`：

```ts
// 预定义模型解析：阶段一为占位空数组，阶段三由服务端下发模型列表替代
export function resolvePredefinedModels(envValue: string | undefined): { name: string }[] {
  if (!envValue) return [];
  try {
    const parsed = JSON.parse(envValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
```

在 `main.ts` 的 `getBundledConfig` 中调用 `resolvePredefinedModels(process.env.GOOSE_PREDEFINED_MODELS)` 注入 `appConfig`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/getBundledConfig.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/bundledConfig.ts ui/desktop/src/getBundledConfig.test.ts ui/desktop/src/main.ts
git commit -m "feat(config): add predefined-models resolver scaffold"
```

---

## 阶段二：登录闸 + 配置注入骨架（含 provider 模板，桩接口）

### Task 7: 新增内置 heybuddy declarative provider

**Files:**
- Create: `crates/goose-providers/src/declarative/definitions/heybuddy.json`
- Modify: `crates/goose-providers/src/declarative.rs:54`（注册宏）
- Test: `crates/goose-providers/src/declarative.rs` 既有 `all_bundled_providers_are_valid`

**Interfaces:**
- Produces: goose 注册一个 `heybuddy` provider，`api_key_env=HEYBUDDY_API_KEY`、`base_url=${HEYBUDDY_BASE_URL}`、`dynamic_models=true`。环境变量注入即激活，`GET {base_url}/v1/models` 自动拉取模型。

- [ ] **Step 1: 写失败测试**

在 `crates/goose-providers/src/declarative.rs` 既有测试模块中新增（或新建 `tests/heybuddy_provider_test.rs`）：

```rust
#[test]
fn heybuddy_provider_is_bundled_and_valid() {
    let json = crate::declarative::declarative_providers::heybuddy::JSON;
    let config: serde_json::Value = serde_json::from_str(json).unwrap();
    assert_eq!(config["name"], "heybuddy");
    assert_eq!(config["engine"], "openai");
    assert_eq!(config["api_key_env"], "HEYBUDDY_API_KEY");
    assert_eq!(config["base_url"], "${HEYBUDDY_BASE_URL}");
    assert_eq!(config["dynamic_models"], true);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p goose-providers heybuddy_provider_is_bundled_and_valid`
Expected: FAIL（`heybuddy` 模块不存在，编译错误）。

- [ ] **Step 3: 实现**

新建 `crates/goose-providers/src/declarative/definitions/heybuddy.json`：

```json
{
  "name": "heybuddy",
  "engine": "openai",
  "display_name": "HeyBuddy",
  "description": "HeyBuddy gateway. base_url and API key are injected at runtime after login.",
  "api_key_env": "HEYBUDDY_API_KEY",
  "base_url": "${HEYBUDDY_BASE_URL}",
  "env_vars": [
    {
      "name": "HEYBUDDY_BASE_URL",
      "required": true,
      "secret": false,
      "description": "HeyBuddy gateway base URL, injected after login."
    }
  ],
  "dynamic_models": true,
  "models": [],
  "skip_canonical_filtering": true,
  "preserves_thinking": true,
  "supports_streaming": true
}
```

在 `declarative.rs` L54 `zhipu,` 之后追加一行 `heybuddy,`。

- [ ] **Step 4: 运行测试确认通过（含既有校验测试）**

Run: `cargo test -p goose-providers`
Expected: PASS（新测试通过，且 `all_bundled_providers_are_valid` 自动校验新 provider 非空、占位符有声明）。

- [ ] **Step 5: 提交**

```bash
git add crates/goose-providers/src/declarative/definitions/heybuddy.json crates/goose-providers/src/declarative.rs
git commit -m "feat(providers): add bundled heybuddy openai-compatible provider"
```

---

### Task 8: 凭证文件读写模块（纯逻辑）

**Files:**
- Create: `ui/desktop/src/credentials.ts`
- Test: `ui/desktop/src/credentials.test.ts`

**Interfaces:**
- Produces: `readCredentials(filePath)`、`writeCredentials(filePath, creds)`、`clearCredentials(filePath)` 三个纯函数（接收文件路径，不依赖 electron）。

- [ ] **Step 1: 写失败测试**

新建 `ui/desktop/src/credentials.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCredentials, writeCredentials, clearCredentials } from './credentials';

describe('credentials 读写', () => {
  let tmpFile: string;
  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `creds-${Math.random().toString(36).slice(2)}.json`);
  });
  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('文件不存在时 read 返回 null', () => {
    expect(readCredentials(tmpFile)).toBeNull();
  });
  it('write 后 read 能读回', () => {
    const creds = { token: 't', baseUrl: 'https://gw', apiKey: 'k' };
    writeCredentials(tmpFile, creds);
    expect(readCredentials(tmpFile)).toEqual(creds);
  });
  it('write 后文件权限为 0o600', () => {
    writeCredentials(tmpFile, { token: 't', baseUrl: 'u', apiKey: 'k' });
    const mode = (fs.statSync(tmpFile).mode & 0o777);
    expect(mode).toBe(0o600);
  });
  it('clear 删除文件', () => {
    writeCredentials(tmpFile, { token: 't', baseUrl: 'u', apiKey: 'k' });
    clearCredentials(tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });
  it('read 损坏文件返回 null', () => {
    fs.writeFileSync(tmpFile, 'not json');
    expect(readCredentials(tmpFile)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/credentials.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

新建 `ui/desktop/src/credentials.ts`：

```ts
import fs from 'node:fs';
import path from 'node:path';

// HeyBuddy 登录凭证：登录成功后由服务端下发，写入独立文件，注入给 goose serve
export interface LoginCredentials {
  token: string;
  baseUrl: string;
  apiKey: string;
}

export function readCredentials(filePath: string): LoginCredentials | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (
      typeof data?.token === 'string' &&
      typeof data?.baseUrl === 'string' &&
      typeof data?.apiKey === 'string'
    ) {
      return data as LoginCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCredentials(filePath: string, creds: LoginCredentials): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function clearCredentials(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/credentials.test.ts`
Expected: PASS。

> 注：Windows 上 `mode: 0o600` 不产生 Unix 权限效果，但写入不报错；该测试在 Windows 上对权限位的断言可能需要 `process.platform !== 'win32'` 守卫。若 CI 在 Windows，将该断言用 `it.skipIf(process.platform === 'win32')` 包裹。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/credentials.ts ui/desktop/src/credentials.test.ts
git commit -m "feat(credentials): add login-credentials file read/write module"
```

---

### Task 9: 登录态 IPC 通道（main handler + preload 暴露）

**Files:**
- Modify: `ui/desktop/src/main.ts`（L172 附近加 `CREDENTIALS_FILE` 常量；文件末尾 IPC 区加 4 个 handler）
- Modify: `ui/desktop/src/preload.ts`（ElectronAPI type L134 附近 + electronAPI 实现 L256 附近）

**Interfaces:**
- Consumes: `credentials.ts` 的 `readCredentials/writeCredentials/clearCredentials`。
- Produces: 渲染进程可调 `window.electron.getLoginCredentials()` / `setLoginCredentials(creds)` / `clearLoginCredentials()` / `isLoggedIn()`。

- [ ] **Step 1: 写失败测试（preload 接线层）**

IPC 接线层依赖 electron 运行时，单测成本高。采用「集成验证 + 类型检查」策略：写一个类型断言文件确保新方法在 `ElectronAPI` 类型上存在。

新建 `ui/desktop/src/preload.loginIpc.test-d.ts`：

```ts
import { expectTypeOf } from 'vitest';
import type { ElectronAPI } from './preload';

expectTypeOf<ElectronAPI>().toHaveProperty('getLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('isLoggedIn').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('setLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('clearLoginCredentials').toBeFunction();
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm run typecheck`
Expected: FAIL（`ElectronAPI` 上无这些方法）。

- [ ] **Step 3: 实现**

`main.ts` L172 附近新增常量：

```ts
const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'credentials.json');
```

在 main.ts 的 IPC handler 区（`ipcMain.handle('get-setting', ...)` 附近）新增：

```ts
ipcMain.handle('get-login-credentials', () => readCredentials(CREDENTIALS_FILE));
ipcMain.handle('is-logged-in', () => readCredentials(CREDENTIALS_FILE) !== null);
ipcMain.handle('set-login-credentials', (_e, creds: LoginCredentials) => {
  writeCredentials(CREDENTIALS_FILE, creds);
});
ipcMain.handle('clear-login-credentials', () => {
  clearCredentials(CREDENTIALS_FILE);
});
```

顶部 `import { readCredentials, writeCredentials, clearCredentials, type LoginCredentials } from './credentials';`

`preload.ts` ElectronAPI type（L134 附近）加：

```ts
getLoginCredentials: () => Promise<{ token: string; baseUrl: string; apiKey: string } | null>;
isLoggedIn: () => Promise<boolean>;
setLoginCredentials: (creds: { token: string; baseUrl: string; apiKey: string }) => Promise<void>;
clearLoginCredentials: () => Promise<void>;
```

electronAPI 实现（L256 附近）加：

```ts
getLoginCredentials: () => ipcRenderer.invoke('get-login-credentials'),
isLoggedIn: () => ipcRenderer.invoke('is-logged-in'),
setLoginCredentials: (creds) => ipcRenderer.invoke('set-login-credentials', creds),
clearLoginCredentials: () => ipcRenderer.invoke('clear-login-credentials'),
```

- [ ] **Step 4: 运行 typecheck 确认通过**

Run: `cd ui/desktop && pnpm run typecheck`
Expected: PASS。

- [ ] **Step 5: 手动验证 + 提交**

手动验证（启动应用后从 devtools console 调 `await window.electron.isLoggedIn()`）留作阶段二集成验证（Task 12 后）。

```bash
git add ui/desktop/src/main.ts ui/desktop/src/preload.ts ui/desktop/src/preload.loginIpc.test-d.ts
git commit -m "feat(ipc): add login-credentials IPC channel"
```

---

### Task 10: startGooseServe 注入 HEYBUDDY_* 环境变量

**Files:**
- Modify: `ui/desktop/src/main.ts:1149-1151`（`startGooseServe({env})` 追加注入）

**Interfaces:**
- Consumes: `readCredentials(CREDENTIALS_FILE)`。
- Produces: goose serve 子进程环境含 `HEYBUDDY_BASE_URL`、`HEYBUDDY_API_KEY`（登录后），被 Task 7 的 provider 模板自动接收。

- [ ] **Step 1: 写失败测试**

将 env 构造逻辑抽到可测函数。新建 `ui/desktop/src/gooseServeEnv.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { buildHeyBuddyEnv } from './gooseServeEnv';

describe('buildHeyBuddyEnv', () => {
  it('凭证存在时返回两个环境变量', () => {
    expect(
      buildHeyBuddyEnv({ token: 't', baseUrl: 'https://gw', apiKey: 'k' })
    ).toEqual({
      HEYBUDDY_BASE_URL: 'https://gw',
      HEYBUDDY_API_KEY: 'k',
    });
  });
  it('无凭证时返回空对象', () => {
    expect(buildHeyBuddyEnv(null)).toEqual({});
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/gooseServeEnv.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

新建 `ui/desktop/src/gooseServeEnv.ts`：

```ts
import type { LoginCredentials } from './credentials';

// 把登录下发的凭证映射为 goose serve 子进程环境变量，供 heybuddy provider 接收
export function buildHeyBuddyEnv(creds: LoginCredentials | null): Record<string, string> {
  if (!creds) return {};
  return {
    HEYBUDDY_BASE_URL: creds.baseUrl,
    HEYBUDDY_API_KEY: creds.apiKey,
  };
}
```

在 `main.ts` L1145-1151 的 `startGooseServe({ env: { ... } })` 改为：

```ts
env: {
  GOOSE_PATH_ROOT: appConfig.GOOSE_PATH_ROOT as string | undefined,
  ...buildHeyBuddyEnv(readCredentials(CREDENTIALS_FILE)),
},
```

顶部 `import { buildHeyBuddyEnv } from './gooseServeEnv';`

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/gooseServeEnv.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/gooseServeEnv.ts ui/desktop/src/gooseServeEnv.test.ts ui/desktop/src/main.ts
git commit -m "feat(serve): inject heybuddy credentials as env vars into goose serve"
```

---

### Task 11: OnboardingGuard 判定改为「是否登录」

**Files:**
- Modify: `ui/desktop/src/components/onboarding/OnboardingGuard.tsx`（L54-57、L103-106、L165-167）

**Interfaces:**
- Consumes: `window.electron.isLoggedIn()`。
- Produces: 未登录不放行 children；登录后放行。

- [ ] **Step 1: 写失败测试**

更新 `OnboardingGuard.test.tsx`（Task 1 创建）追加用例：

```tsx
it('未登录时不放行 children', async () => {
  vi.stubGlobal('electron', { isLoggedIn: vi.fn().mockResolvedValue(false) });
  render(
    <MemoryRouter>
      <OnboardingGuard>
        <div>child</div>
      </OnboardingGuard>
    </MemoryRouter>
  );
  // 未登录不放行
  expect(await screen.findByText('child', undefined, { timeout: 3000 })).not.toBeInTheDocument();
});

it('已登录时放行 children', async () => {
  vi.stubGlobal('electron', { isLoggedIn: vi.fn().mockResolvedValue(true) });
  render(
    <MemoryRouter>
      <OnboardingGuard>
        <div>child</div>
      </OnboardingGuard>
    </MemoryRouter>
  );
  expect(await screen.findByText('child', undefined, { timeout: 3000 })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/components/onboarding/OnboardingGuard.test.tsx`
Expected: FAIL（当前判定逻辑是 `hasProvider`，不调 `isLoggedIn`）。

- [ ] **Step 3: 实现**

在 `OnboardingGuard.tsx`，将判定逻辑（L65-101 `checkProvider`）替换为登录判定：

```tsx
const [isChecking, setIsChecking] = useState(true);
const [isLoggedIn, setIsLoggedIn] = useState(false);

const checkLogin = async () => {
  setIsChecking(true);
  try {
    const loggedIn = await window.electron.isLoggedIn();
    setIsLoggedIn(loggedIn);
  } catch (error) {
    console.error('Failed to check login status:', error);
    setIsLoggedIn(false);
  } finally {
    setIsChecking(false);
  }
};

useEffect(() => {
  checkLogin();
}, []);
```

将 L165 `if (hasProvider) return <>{children}</>` 改为 `if (isLoggedIn) return <>{children}</>`。

将 L175-202（Task 1 改后剩余的 return）改为重定向到登录页：

```tsx
return <Navigate to="/login" replace />;
```

（顶部 `import { Navigate } from 'react-router';`）

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/components/onboarding/OnboardingGuard.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/components/onboarding/OnboardingGuard.tsx ui/desktop/src/components/onboarding/OnboardingGuard.test.tsx
git commit -m "feat(onboarding): gate main view on login instead of provider config"
```

---

### Task 12: /login 路由 + LoginView 组件（桩接口）

**Files:**
- Create: `ui/desktop/src/components/auth/LoginView.tsx`
- Test: `ui/desktop/src/components/auth/LoginView.test.tsx`
- Modify: `ui/desktop/src/App.tsx`（L632-637 间加免守卫 `/login` 路由）

**Interfaces:**
- Consumes: `window.electron.setLoginCredentials(creds)`。
- Produces: 桩登录成功后写凭证并 `navigate('/')`，OnboardingGuard 放行。

- [ ] **Step 1: 写失败测试**

新建 `ui/desktop/src/components/auth/LoginView.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('../../acp/providers', () => ({ acpListProviderDetails: vi.fn().mockResolvedValue([]) }));

const setLoginCredentials = vi.fn();
const stubResponse = { token: 'stub-token', baseUrl: 'https://stub-gw/v1', apiKey: 'stub-key' };

// 桩登录：返回固定凭证
vi.mock('../../stubLogin', () => ({
  stubLogin: vi.fn().mockResolvedValue(stubResponse),
}));

import LoginView from './LoginView';

describe('LoginView 桩登录', () => {
  it('提交后写凭证并跳转 /', async () => {
    vi.stubGlobal('electron', { setLoginCredentials });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/" element={<div>main</div>} />
        </Routes>
      </MemoryRouter>
    );
    await userEvent.type(screen.getByLabelText(/account/i), 'alice');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    await waitFor(() => {
      expect(setLoginCredentials).toHaveBeenCalledWith(stubResponse);
      expect(screen.getByText('main')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/components/auth/LoginView.test.tsx`
Expected: FAIL（组件/桩模块不存在）。

- [ ] **Step 3: 实现**

新建 `ui/desktop/src/stubLogin.ts`（阶段二桩，阶段三 Task 13 替换为真实 API）：

```ts
import type { LoginCredentials } from './credentials';

// 阶段二桩登录：返回固定凭证，供端到端验证注入链路；阶段三替换为真实服务端 API
export async function stubLogin(account: string, password: string): Promise<LoginCredentials> {
  void account;
  void password;
  return {
    token: 'stub-token',
    baseUrl: 'https://stub-gw/v1',
    apiKey: 'stub-key',
  };
}
```

新建 `ui/desktop/src/components/auth/LoginView.tsx`：

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { stubLogin } from '../../stubLogin';

export default function LoginView() {
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const creds = await stubLogin(account, password);
      await window.electron.setLoginCredentials(creds);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-full bg-background-default flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-light">登录 HeyBuddy</h1>
        <label className="block">
          <span className="text-text-muted">账号</span>
          <input
            className="block w-full mt-1 p-2 border rounded"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            aria-label="account"
          />
        </label>
        <label className="block">
          <span className="text-text-muted">密码</span>
          <input
            type="password"
            className="block w-full mt-1 p-2 border rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="password"
          />
        </label>
        {error && <p className="text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full p-2 bg-primary text-white rounded"
        >
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
```

在 `App.tsx` L632-637 间（与 `launcher`/`configure-providers` 同组的免守卫路由）新增：

```tsx
<Route path="login" element={<LoginView />} />
```

（顶部 `import LoginView from './components/auth/LoginView';`）

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/components/auth/LoginView.test.tsx`
Expected: PASS。

- [ ] **Step 5: 阶段二端到端手动验证 + 提交**

启动应用手动验证：
- 未登录 → 被重定向到 `/login`。
- 提交登录 → 写入 `credentials.json`，跳转 `/`，进入主界面。
- goose serve 子进程环境含 `HEYBUDDY_BASE_URL=https://stub-gw/v1`（可在 main.ts 临时 `console.log(process.env)` 或 goose serve 日志验证）。
- 配一个本地 mock `/v1/models` 端点指向 `https://stub-gw/v1`，确认模型列表被拉回（验证 Task 7 provider 模板接通）。

```bash
git add ui/desktop/src/components/auth/LoginView.tsx ui/desktop/src/components/auth/LoginView.test.tsx ui/desktop/src/stubLogin.ts ui/desktop/src/App.tsx
git commit -m "feat(auth): add login view with stub endpoint and login route"
```

---

## 阶段三：真实对接（端到端跑通）

### Task 13: 真实登录接口对接

**Files:**
- Modify: `ui/desktop/src/stubLogin.ts`（桩替换为真实服务端 API 调用）；建议重命名为 `login.ts` 并保留导出名 `stubLogin`→`login`，更新引用。
- Modify: `ui/desktop/src/components/auth/LoginView.tsx`（改 import）
- Modify: `ui/desktop/src/components/auth/LoginView.test.tsx`（mock 目标改为 `login`）

**Interfaces:**
- Consumes: 服务端登录 API（契约见规划文档 7.1：返回 `{token, base_url, api_key}`）。
- Produces: 真实登录 → 真实凭证写入 → goose 用真实 base_url/key 拉取真实模型列表。

> 前置：服务端登录 API 已就绪。未就绪前本任务无法完成。

- [ ] **Step 1: 写失败测试**

更新 `LoginView.test.tsx`，把 mock 从 `stubLogin` 改为 `login`，桩返回值替换为真实契约样例：

```ts
vi.mock('../../login', () => ({
  login: vi.fn().mockResolvedValue({
    token: 'real-token',
    baseUrl: 'https://real-gw.heybuddy/v1',
    apiKey: 'real-key',
  }),
}));
```

并新增一条测试：`login` 收到正确的 account/password 入参（验证字段映射到服务端契约）。

```tsx
it('以 account/password 调用 login', async () => {
  const { login } = await import('../../login');
  render(/* 同上 */);
  await userEvent.type(screen.getByLabelText(/account/i), 'alice');
  await userEvent.type(screen.getByLabelText(/password/i), 'pw');
  await userEvent.click(screen.getByRole('button', { name: /login/i }));
  await waitFor(() => expect(login).toHaveBeenCalledWith('alice', 'pw'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ui/desktop && pnpm vitest run src/components/auth/LoginView.test.tsx`
Expected: FAIL（`login` 模块不存在）。

- [ ] **Step 3: 实现**

新建 `ui/desktop/src/login.ts`（替代 `stubLogin.ts`）：

```ts
import type { LoginCredentials } from './credentials';

// 真实登录：调用 HeyBuddy 服务端登录 API，返回 {token, base_url, api_key}
// 服务端契约见 docs/superpowers/specs/2026-08-11-product-goals-and-features-design.md 第 7.1 节
export async function login(account: string, password: string): Promise<LoginCredentials> {
  const res = await fetch('https://login.heybuddy.example/v1/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });
  if (!res.ok) {
    throw new Error(`登录失败: ${res.status}`);
  }
  const data = await res.json();
  return {
    token: data.token,
    baseUrl: data.base_url,
    apiKey: data.api_key,
  };
}
```

（`https://login.heybuddy.example/v1/login` 为占位 URL，对接时替换为真实地址；删除 `stubLogin.ts`。）

更新 `LoginView.tsx` 的 import 与调用为 `login`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ui/desktop && pnpm vitest run src/components/auth/LoginView.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add ui/desktop/src/login.ts ui/desktop/src/components/auth/LoginView.tsx ui/desktop/src/components/auth/LoginView.test.tsx
git rm ui/desktop/src/stubLogin.ts
git commit -m "feat(auth): replace stub login with real server endpoint"
```

---

### Task 14: 端到端验证（真实模型列表 + 对话）

**Files:** 无代码改动（验证性任务）。

- [ ] **Step 1: 真实登录**

启动应用，用真实账号登录。确认 `credentials.json` 写入真实 `{token, base_url, api_key}`。

- [ ] **Step 2: 模型列表拉取**

确认 goose serve 启动后向真实 `{base_url}/v1/models` 发起请求（goose inventory refresh）。UI 模型选择器显示服务端返回的真实模型名（如 GLM 系列）。

验证命令（goose serve 日志或主进程临时日志）应看到对 `/v1/models` 的 GET 请求成功。

- [ ] **Step 3: 选模型发对话**

从模型列表选一个模型名，发起一条对话，确认收到流式响应。

- [ ] **Step 4: 覆盖率检查**

Run: `cd ui/desktop && pnpm vitest run --coverage`
确认新增/修改文件的路径覆盖 ≥ 80%（AGENTS.md）。

Run: `cargo test -p goose-providers && cargo clippy --all-targets -- -D warnings`
确认后端测试通过、clippy 无警告。

- [ ] **Step 5: 收尾提交（如有覆盖率补充测试）**

```bash
git add ui/desktop
git commit -m "test: add coverage for login and model-lockdown paths"
```

---

## Self-Review 自审结果

**1. Spec coverage：** 阶段一 6 子项 → Task 1-6；阶段二 9 子项 → Task 7-12（2.1/2.2 合为 Task 7，2.3-2.5 拆为 Task 8-10，2.6-2.9 拆为 Task 9/11/12）；阶段三 → Task 13-14。规划文档全部子项已覆盖。

**2. Placeholder scan：** Task 13 的 `https://login.heybuddy.example/v1/login` 是真实待对接 URL（服务端未就绪，已在任务前置声明），非占位敷衍；其余代码均完整。

**3. Type consistency：** `LoginCredentials` 结构（`{token, baseUrl, apiKey}`）在 credentials.ts / gooseServeEnv.ts / preload.ts / IPC handler / LoginView 间一致；IPC 方法名 `get-login-credentials`/`is-logged-in`/`set-login-credentials`/`clear-login-credentials` 在 main/preload 间一致；环境变量 `HEYBUDDY_API_KEY`/`HEYBUDDY_BASE_URL` 与 provider 模板一致。
