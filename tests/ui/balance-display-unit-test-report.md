# 用户余额显示单元测试报告

## 测试概要

- 分支: `feat/sidebar-balance-display`（HeyBuddy）/ `feat/oa-login-pat`（new-api）
- 测试时间: 2026-08-24 16:47:19
- 测试框架: Vitest 4.1.0（jsdom 环境）+ @vitest/coverage-v8；Go testing + glebarez/sqlite 内存库
- 测试文件:
  - `ui/desktop/src/quotaFormat.test.ts`（15 用例）
  - `ui/desktop/src/balance.test.ts`（21 用例）
  - `ui/desktop/src/hooks/useBalance.test.ts`（11 用例）
  - `ui/desktop/src/components/Layout/BalanceWidget.test.tsx`（7 用例）
  - `ui/desktop/src/oaLogin.test.ts`（增补 2 用例，共 14）
  - `ui/desktop/src/credentials.test.ts`（增补 2 用例，共 9）
  - `new-api/controller/oa_test.go`（增补 4 用例）
- 总用例数: 76（UI）+ 4（Go）
- 通过数: 全部通过（UI 中 1 个跳过为存量 Windows 权限位用例，全量套件另有 5 个存量跳过）

## 待测代码

| 文件 | 函数/组件 | 功能 |
|---|---|---|
| `new-api/controller/oa.go` | `ensureUserPat` | OA 登录时确保用户有面板 PAT：已有复用、为空生成（29-32 位随机 key、撞库重试 3 次）、落库 |
| `ui/desktop/src/quotaFormat.ts` | `parseCurrencyConfig` / `formatQuotaWithCurrency` | 移植 new-api 面板余额显示语义：`/api/status` 配置解析（非法回退默认）+ quota→USD→站点货币（USD/CNY/TOKENS/CUSTOM，2/4 位精度、去尾零、k 缩写、极小值抬底） |
| `ui/desktop/src/balance.ts` | `fetchUserBalance` / `fetchStatusCurrency` / `fetchCurrencyWithCache` / `runBalanceFetch` | 主进程取数：PAT 调 `/api/user/self`（错误分类 unauthorized/http/timeout/network/bad-response）、`/api/status` 货币配置（1h TTL 缓存、失败降级旧值）、IPC result 包装 |
| `ui/desktop/src/hooks/useBalance.ts` | `useBalance` | 轮询 hook：mount 拉取 + 5 分钟 interval + 手动刷新 + 请求序号防竞态，状态机 loading/ready/no-pat/not-logged-in/unauthorized/error |
| `ui/desktop/src/components/Layout/BalanceWidget.tsx` | `BalanceWidget` | 侧边栏余额组件：余额串 + Tooltip 明细（已用/请求数/更新时间）+ 刷新按钮 + 各失败态提示 |

## 覆盖率报告

| 维度 | quotaFormat.ts | balance.ts | useBalance.ts | BalanceWidget.tsx | 达标（≥80%） |
|---|---|---|---|---|---|
| 语句覆盖 | 97.91% | 100% | 100% | 100% | ✅ |
| 分支覆盖 | 95.91% | 100% | 100% | 100% | ✅ |
| 函数覆盖 | 100% | 100% | 100% | 100% | ✅ |
| 行覆盖 | 100% | 100% | 100% | 100% | ✅ |

quotaFormat.ts 未覆盖分支（99、117 行）：`getDisplayMeta` 的 `default` 兜底分支——`parseCurrencyConfig` 已保证类型合法，运行时不可达，属防御性代码。

命令: `pnpm vitest run --coverage --coverage.reporter=text --coverage.include='src/balance.ts' --coverage.include='src/quotaFormat.ts' --coverage.include='src/hooks/useBalance.ts' --coverage.include='src/components/Layout/BalanceWidget.tsx' src/balance.test.ts src/quotaFormat.test.ts src/hooks/useBalance.test.ts src/components/Layout/BalanceWidget.test.tsx src/oaLogin.test.ts src/credentials.test.ts`

**路径/条件覆盖**（设计方法统计，非工具自动）:

- `parseCurrencyConfig`: V(G)=5，独立路径覆盖 **7/7**（P1 完整合法 / P2 type 非法+旧开关 false→TOKENS / P2b type 优先 / P3 非法+无开关→USD / P4 数值回退 / P5 符号空白回退）
- `formatQuotaWithCurrency`: V(G)=6，独立路径覆盖 **8/8**（null/NaN、USD 2/4 位精度与进位、CNY 汇率、CUSTOM 符号、TOKENS ≥1000/k 与 <1000、极小值抬底、自定义 perUnit）
- `fetchUserBalance`（含 fetchJson 共享层）: V(G)=8，独立路径覆盖 **9/9**（成功映射、401、502、非 JSON、网络错/非 Error、超时、success=false 有/无 message、数值字段非法、字符串字段回退）
- `fetchStatusCurrency`: V(G)=3，独立路径覆盖 **3/3**（成功解析、data 缺失回退默认、success=false、HTTP 非 2xx）
- `fetchCurrencyWithCache`: V(G)=4，独立路径覆盖 **4/4**（TTL 命中不发请求、恰好到期重拉写回、失败降级旧值、无缓存失败抛错）
- `runBalanceFetch`: V(G)=3，独立路径覆盖 **3/3**（成功、BalanceFetchError 透传、普通 Error/非 Error）
- `useBalance`: V(G)=7，独立路径覆盖 **11/11**（loading→ready、轮询持续、手动刷新、no-pat/not-logged-in/unauthorized、其他错误、invoke 异常、卸载停表、慢响应成功竞态、慢响应异常竞态）
- `BalanceWidget`: V(G)=6，独立路径覆盖 **7/7**（ready+Tooltip、loading、no-pat、unauthorized、error+原因、not-logged-in 不渲染、点击刷新）
- 原子条件矩阵: `result.ok`（真 H1/W1，假 H4-H7/W3-W5）、`seq===seqRef.current`（真 H1-H8，假 H10/H11）、`kind∈{no-pat,not-logged-in,unauthorized}`（各真一次，假 H7/W5）、`|值|≥1`（真 "$12.5"，假 "$0.5"）、`tokens≥1000`（真 P16/P18，假 P17/P19）——**全部原子条件真/假各至少一次**

## 测试详情

### Go（new-api `controller/oa_test.go`）

| 用例 | 路径 | 状态 |
|---|---|---|
| TestEnsureUserPat_ReusesExisting | P1 已有 PAT 复用，DB 无覆盖 | ✅ |
| TestEnsureUserPat_CreatesWhenMissing | P2 为空生成（≥28 位随机串）并落库、内存同步 | ✅ |
| TestEnsureUserPat_UpdateNoRow | P3 用户行不存在（RowsAffected==0）报错 | ✅ |
| TestEnsureUserPat_DBError | P4 DB 故障报错（撞库重试分支由 DB 错误路径间接覆盖） | ✅ |

命令: `go test ./controller/ -run TestEnsureUserPat -v -count=1`；另 `go vet ./controller/`、`go build ./...` 通过。

### quotaFormat（15 用例）

P1 完整合法 / P2 旧开关回退 TOKENS / P2b type 优先 / P3 非法回退 USD + null 全默认 / P4 非正数与非有限数回退 / P4b 数字字符串可解析、非法字符串回退 / P5 符号空白回退 ¤ / P6 null 与 NaN → '-' / P8 USD 各精度（$10、$12.5、$0.5、$0、$2.47 进位）/ P10 极小值抬底 $0.0001 / P8b CNY（¥73、¥91.25）/ P9 CUSTOM（€ 9）/ P16+P18 TOKENS ≥1000（1.2k、2500k）/ P17+P19 TOKENS <1000（500、0.5）/ P7b 自定义 perUnit 往返（500k）。

### balance（21 用例）

P1 成功映射 + Bearer 头断言 / P9 字符串字段回退 / P2 401→unauthorized / P3 502→http / P4 非 JSON→bad-response / P5 网络错与非 Error 值→network / P6 超时→timeout / P7 success=false 有/无 message / P8 数值字段缺失/NaN/类型错 / P10 status 成功解析 / P12 data 缺失回退默认 / P11 success=false / P11b HTTP 503→http / P13 TTL 命中不发请求 / P14 恰好到期重拉写回 / P15 失败降级旧值 / P16 无缓存失败抛错 / P17-P19 result 包装三类。

### useBalance（11 用例）

H1-H11 见上文路径列表。说明：React 19 的 act 环境会在每个 act 边界重放 effect（挂载期可能多次拉取），故采用调用数增量与状态契约断言，不依赖挂载期绝对调用次数——已通过临时诊断测试实证该行为与 hook 实现无关。

### BalanceWidget（7 用例）

W1-W7 见上文路径列表。jsdom 缺 ResizeObserver（Radix Tooltip 依赖），测试文件内补最小 stub；Radix 双层渲染（可见层 + 无障碍层）故用 getAllByText。

## Mock 策略

- fetch 通过参数注入 `vi.fn()`，响应用真实 `Response` 构造；超时用真实 `AbortSignal.timeout` 传播（与 oaLogin.test.ts 同款模式）
- `window.electron.getUserBalance` 直接 mock（setup.ts 的 electron mock 对象可写）
- 组件测试用 `IntlProvider locale="en"`（defaultMessage 兜底）；fake timers 驱动轮询
- Go 侧内存 SQLite + 全局 `model.DB` 保存/恢复（沿用 setupTokenTestDB 模式）
- 全程无真实网络请求、无真实密钥

## 关联

- 功能: 侧边栏显示 new-api 用户余额（OA 登录下发 PAT → `/api/user/self` 查询 → 站点货币配置换算显示）
- 验证: `pnpm run typecheck` 通过；`pnpm i18n:compile` + `pnpm i18n:check` 通过（zh-CN 1506 条）；全量 `pnpm test` 见提交前验证记录
- 注意: 全量 `pnpm test`（含/不含覆盖率插桩）在高负载下 `RecipeFormFields`/`ExtensionModal` 两个存量文件偶发 3-4 个 5s 超时。已验证与本次改动无关：① 两文件单独运行 57/57 通过；② 在 `main` 基线跑全量同样出现相同超时（2026-08-24 16:49，635 用例 3 失败/627 通过），属存量负载抖动。本分支全量 692 用例，除上述存量抖动外全部通过（684 通过/5 存量跳过）
