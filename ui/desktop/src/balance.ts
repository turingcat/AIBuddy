import type { CurrencyConfig } from './quotaFormat';
import { parseCurrencyConfig } from './quotaFormat';

/**
 * @author logic
 * @date 2026-08-24
 * 主进程余额取数：用登录时下发的 PAT 调 new-api 的 /api/user/self 查用户余额，
 * 另调无需认证的 /api/status 拿货币显示配置。由 main.ts 的 get-user-balance IPC
 * 调用（绕开 renderer CSP）；fetch 注入以便单测；错误分类为 BalanceErrorKind，
 * 供渲染进程区分"需重新登录"（unauthorized）与"临时失败"。
 */

// 结构化最小 fetch 类型：同时兼容全局 fetch 与 Electron 的 net.fetch
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BalanceData {
  /**
   * 额度语义：计量计费账户为账户余额，订阅计费账户为当日剩余额度。
   * 侧栏据此选择文案，两者不可混为一谈
   */
  kind: 'balance' | 'daily-quota';
  /** 剩余额度（原始 token 额度，需按 currency 换算显示） */
  quota: number;
  usedQuota: number;
  requestCount: number;
  userName: string;
  displayName: string;
  /** 订阅分组名，仅 daily-quota 有 */
  groupName?: string;
}

export type BalanceErrorKind = 'unauthorized' | 'http' | 'timeout' | 'network' | 'bad-response';

// main 进程在取数之前判定的本地状态错误，与 HTTP 错误共用一个结果联合类型
export type BalanceFailureKind = BalanceErrorKind | 'not-logged-in' | 'no-pat';

export type BalanceResult =
  | { ok: true; balance: BalanceData; currency: CurrencyConfig }
  | { ok: false; kind: BalanceFailureKind; message: string };

export class BalanceFetchError extends Error {
  readonly kind: BalanceErrorKind;

  constructor(kind: BalanceErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

// 统一的网络层错误归类：超时 / 断网 / HTTP 状态码，抛 BalanceFetchError
async function fetchJson(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  errorMessages: { timeout: string; network: string; http: (status: number) => string },
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new BalanceFetchError('timeout', errorMessages.timeout);
    }
    throw new BalanceFetchError('network', errorMessages.network);
  }
  if (res.status === 401) {
    throw new BalanceFetchError('unauthorized', '登录已失效，请重新登录');
  }
  if (!res.ok) {
    throw new BalanceFetchError('http', errorMessages.http(res.status));
  }
  try {
    return await res.json();
  } catch {
    throw new BalanceFetchError('bad-response', '余额服务响应格式异常');
  }
}

type SelfResponseBody = {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
};

/**
 * 查询当前用户余额：GET {apiBaseUrl}/api/user/self，Bearer PAT 认证。
 * 响应 data 含 quota/used_quota/request_count/username/display_name。
 */
export async function fetchUserBalance(
  apiBaseUrl: string,
  pat: string,
  fetchImpl: FetchLike,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<BalanceData> {
  const body = (await fetchJson(
    `${apiBaseUrl}/api/user/self`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${pat}` },
      signal: AbortSignal.timeout(timeoutMs),
    },
    fetchImpl,
    {
      timeout: '余额服务响应超时，请稍后重试',
      network: '无法连接余额服务，请检查网络',
      http: (status) => `余额服务不可用（HTTP ${status}）`,
    },
  )) as SelfResponseBody;

  if (!body.success) {
    throw new BalanceFetchError('bad-response', body.message || '余额查询失败');
  }
  const data = body.data;
  const quota = data?.quota;
  const usedQuota = data?.used_quota;
  const requestCount = data?.request_count;
  if (
    typeof quota !== 'number' ||
    !Number.isFinite(quota) ||
    typeof usedQuota !== 'number' ||
    !Number.isFinite(usedQuota) ||
    typeof requestCount !== 'number' ||
    !Number.isFinite(requestCount)
  ) {
    throw new BalanceFetchError('bad-response', '余额服务响应数据异常');
  }
  return {
    kind: 'balance',
    quota,
    usedQuota,
    requestCount,
    userName: typeof data?.username === 'string' ? data.username : '',
    displayName: typeof data?.display_name === 'string' ? data.display_name : '',
  };
}

type StatusResponseBody = { success?: boolean; data?: unknown };

/**
 * 拉取货币显示配置：GET {apiBaseUrl}/api/status（无需认证）。
 * 字段合法性由 parseCurrencyConfig 兜底回退默认值。
 */
export async function fetchStatusCurrency(
  apiBaseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CurrencyConfig> {
  const body = (await fetchJson(
    `${apiBaseUrl}/api/status`,
    { method: 'GET', signal: AbortSignal.timeout(timeoutMs) },
    fetchImpl,
    {
      timeout: '余额服务响应超时，请稍后重试',
      network: '无法连接余额服务，请检查网络',
      http: (status) => `余额服务不可用（HTTP ${status}）`,
    },
  )) as StatusResponseBody;

  if (!body.success) {
    throw new BalanceFetchError('bad-response', '余额服务响应格式异常');
  }
  return parseCurrencyConfig(body.data);
}

export interface CurrencyCacheState {
  config: CurrencyConfig | null;
  fetchedAt: number;
}

/**
 * 带缓存的货币配置获取：TTL 内直接用缓存（不发请求）；
 * 过期重拉成功则写回缓存；重拉失败但有旧缓存时降级用旧值；无缓存且失败则抛错。
 * now/ttl 以参数注入便于单测，状态由 main 进程模块级持有。
 */
export async function fetchCurrencyWithCache(
  state: CurrencyCacheState,
  apiBaseUrl: string,
  fetchImpl: FetchLike,
  now: number,
  ttlMs: number = 3_600_000,
): Promise<CurrencyConfig> {
  if (state.config && now - state.fetchedAt < ttlMs) {
    return state.config;
  }
  try {
    const config = await fetchStatusCurrency(apiBaseUrl, fetchImpl);
    state.config = config;
    state.fetchedAt = now;
    return config;
  } catch (e) {
    if (state.config) {
      return state.config;
    }
    throw e;
  }
}

/**
 * IPC result 模式包装：取数成功/异常转为 {ok, ...} 对象，
 * main.ts 的 handler 用它返回而非抛异常，渲染进程解包后自行处理
 */
export async function runBalanceFetch(
  fn: () => Promise<{ balance: BalanceData; currency: CurrencyConfig }>,
): Promise<BalanceResult> {
  try {
    const { balance, currency } = await fn();
    return { ok: true, balance, currency };
  } catch (e) {
    if (e instanceof BalanceFetchError) {
      return { ok: false, kind: e.kind, message: e.message };
    }
    return {
      ok: false,
      kind: 'network',
      message: e instanceof Error ? e.message : '余额查询失败',
    };
  }
}
