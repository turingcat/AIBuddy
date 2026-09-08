# OA 登录单元测试报告

## 测试概要

- 分支: `fix/oa-login-error-handling`
- 测试时间: 2026-08-15 21:45:40
- 测试框架: Vitest 4.1.0（jsdom 环境）+ @vitest/coverage-v8
- 测试文件:
  - `ui/desktop/src/oaLogin.test.ts`（12 用例）
  - `ui/desktop/src/login.test.ts`（3 用例）
- 总用例数: 15
- 通过数: 15
- 失败数: 0
- 跳过数: 0（全量套件中另有 5 个存量跳过用例，与本次改动无关）

## 待测代码

| 文件 | 函数 | 功能 |
|---|---|---|
| `ui/desktop/src/oaLogin.ts` | `performOaLogin` | 主进程 OA 登录 HTTP 请求：网络/超时/HTTP 非 2xx/非 JSON/契约破坏五层错误防护 |
| `ui/desktop/src/oaLogin.ts` | `runOaLogin` | IPC result 模式包装：异常转 `{ok, message}`，避免 Electron IPC 错误前缀 |
| `ui/desktop/src/login.ts` | `login` | 渲染进程解包 result，失败时抛干净 Error |

## 覆盖率报告

| 维度 | oaLogin.ts | login.ts | 达标（≥80%） |
|---|---|---|---|
| 语句覆盖 | 100% | 100% | ✅ |
| 分支覆盖 | 100% | 100% | ✅ |
| 函数覆盖 | 100% | 100% | ✅ |
| 行覆盖 | 100% | 100% | ✅ |

命令: `pnpm vitest run src/oaLogin.test.ts src/login.test.ts --coverage --coverage.include='src/oaLogin.ts' --coverage.include='src/login.ts'`

**路径/条件覆盖**（设计方法统计，非工具自动）:

- `performOaLogin`: 圈复杂度 V(G)=7（判定节点 D1 复合超时判定 / D2 `!res.ok` / D3 json 异常 / D4 `!body.success` / D4b `message||'登录失败'` / D5 `!body.data`），独立路径覆盖 **9/9**（P1–P9，超出下限）
- `runOaLogin`: V(G)=3，独立路径覆盖 **3/3**（R1–R3）
- `login`: V(G)=3，独立路径覆盖 **3/3**（P1–P3）
- 原子条件矩阵: `e instanceof Error`（真 P2/P7，假 P9）、`e.name==='TimeoutError'`（真 P7，假 P2）、`body.message`（真 P2，假 P3）——**全部原子条件真/假各至少一次**

## 测试详情

### performOaLogin（9 条独立路径）

| 用例 | 路径 | 状态 |
|---|---|---|
| P1: success=true 时返回凭证并按约定发起请求 | 成功 | ✅ |
| P2: success=false 且带 message 时抛出服务端 message | D4=T, D4b 真 | ✅ |
| P3: success=false 且无 message 时抛出默认错误 | D4=T, D4b 假 | ✅ |
| P4: HTTP 非 2xx（网关 default backend 404 纯文本） | D2=T | ✅ |
| P5: HTTP 200 但响应非 JSON | D3=T | ✅ |
| P6: fetch 抛错（网络不通） | D1: A=T,B=F | ✅ |
| P7: 服务超时无响应（AbortSignal TimeoutError） | D1: A=T,B=T | ✅ |
| P8: success=true 但缺少 data 字段 | D5=T | ✅ |
| P9: fetch 抛出非 Error 值 | D1: A=F | ✅ |

### runOaLogin（IPC result 包装）

| 用例 | 路径 | 状态 |
|---|---|---|
| R1: 成功返回 {ok:true, creds} | try 成功 | ✅ |
| R2: Error 转 {ok:false, message} | catch, Error | ✅ |
| R3: 非 Error 转 {ok:false, message:"登录失败"} | catch, 非 Error | ✅ |

### login（渲染进程解包）

| 用例 | 路径 | 状态 |
|---|---|---|
| P1: 成功 result 解包返回凭证 | ok=true | ✅ |
| P2: 失败 result 抛主进程 message | ok=false | ✅ |
| P3: IPC 层自身异常上抛 | invoke reject | ✅ |

## Mock 策略

- fetch 通过参数注入 `vi.fn()` mock，无真实网络请求
- 响应用真实 `Response` 对象构造（而非手写桩），保证 `res.json()`/`res.ok` 真实语义
- 超时用例用真实 `AbortSignal.timeout` 传播（mock fetch 仅在 signal abort 时 reject，与真实 fetch 行为一致）
- 已验证 Node 的 `AbortSignal.timeout` reason 为 `DOMException`（`instanceof Error: true`, `name: 'TimeoutError'`），测试环境与 Electron 主进程行为一致

## 关联

- 根因分析: `https://ai.linyeyun.cn` ELB 返回 `default backend - 404`（服务未部署）+ 主进程 `res.json()` 无防护
- 修复提交前验证: 全量 `pnpm test` 630 通过 / 5 存量跳过，`pnpm run typecheck` 无错误
