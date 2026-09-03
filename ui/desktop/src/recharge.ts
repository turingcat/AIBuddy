import type { FetchLike } from './balance';

/**
 * @author logic
 * @date 2026-09-02
 * 主进程微信充值取数：用登录时下发的 PAT 调 new-api 的充值接口——
 * GET /api/user/topup/info（充值配置）、POST /api/user/wechatpay/pay（Native 下单，
 * 返回 code_url 二维码）、GET /api/user/wechatpay/status（订单状态轮询）。
 * 由 main.ts 的 IPC handler 调用（绕开 renderer CSP）；fetch 注入以便单测；
 * 错误分类为 RechargeErrorKind，业务失败（success=false）单独归类为 business，
 * 供渲染进程区分"可重试的临时失败"与"需要展示给用户的业务错误"。
 */

export interface TopupInfo {
  /** 网关是否开通微信充值（合规确认 + 商户配置齐全） */
  enableWechatTopup: boolean;
  /** 微信充值最低金额（元，整数） */
  wechatMinTopup: number;
  /** 服务端配置的预设充值档位（元）；未配置时为空数组，由前端回退默认档位 */
  amountOptions: number[];
  /** 服务端配置的网页充值链接（微信充值未开通时的回退入口），可能为 null */
  topupLink: string | null;
}

export interface WechatPayOrder {
  /** Native 下单返回的二维码内容（weixin://wxpay/bitgenerate?...） */
  codeUrl: string;
  /** 商户订单号，后续轮询状态用 */
  tradeNo: string;
  /** 订单过期时间（unix 秒） */
  expireAt: number;
}

export type WechatPayOrderStatusValue = 'pending' | 'success' | 'failed' | 'expired';

export type RechargeErrorKind =
  | 'unauthorized'
  | 'http'
  | 'timeout'
  | 'network'
  | 'bad-response'
  | 'business'
  | 'bad-request';

// main 进程在请求之前判定的本地状态错误，与 HTTP 错误共用一个结果联合类型
export type RechargeFailureKind = RechargeErrorKind | 'not-logged-in' | 'no-pat';

export type TopupInfoResult =
  | { ok: true; info: TopupInfo }
  | { ok: false; kind: RechargeFailureKind; message: string };

export type WechatPayOrderResult =
  | { ok: true; order: WechatPayOrder }
  | { ok: false; kind: RechargeFailureKind; message: string };

export type WechatPayOrderStatusResult =
  | { ok: true; status: WechatPayOrderStatusValue }
  | { ok: false; kind: RechargeFailureKind; message: string };

export class RechargeFetchError extends Error {
  readonly kind: RechargeErrorKind;

  constructor(kind: RechargeErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MIN_TOPUP = 1;
const ORDER_STATUSES: readonly string[] = ['pending', 'success', 'failed', 'expired'];

async function fetchJson(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  errorMessages: { timeout: string; network: string; http: (status: number) => string }
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new RechargeFetchError('timeout', errorMessages.timeout);
    }
    throw new RechargeFetchError('network', errorMessages.network);
  }
  if (res.status === 401) {
    throw new RechargeFetchError('unauthorized', '登录已失效，请重新登录');
  }
  if (!res.ok) {
    throw new RechargeFetchError('http', errorMessages.http(res.status));
  }
  try {
    return await res.json();
  } catch {
    throw new RechargeFetchError('bad-response', '充值服务响应格式异常');
  }
}

type RechargeResponseBody = {
  success?: boolean;
  message?: unknown;
  data?: unknown;
};

/**
 * 业务成败判定：new-api 有两种响应风格——标准 {success: bool, message, data}
 * （topup/info、status 成功路径走 ApiSuccess），以及微信直连下单/状态接口的
 * {message: 'success'|'error', data}（无 success 字段），两种都识别
 */
function isResponseBodySuccess(body: RechargeResponseBody): boolean {
  if (typeof body.success === 'boolean') {
    return body.success;
  }
  return body.message === 'success';
}

/**
 * new-api 业务失败响应：data 为字符串时优先透出（中文错误文本），
 * 其次透出非 'error'/'success' 占位符的 message
 */
function extractBusinessMessage(body: RechargeResponseBody, fallback: string): string {
  if (typeof body.data === 'string' && body.data.trim()) {
    return body.data;
  }
  if (
    typeof body.message === 'string' &&
    body.message !== 'error' &&
    body.message !== 'success' &&
    body.message.trim()
  ) {
    return body.message;
  }
  return fallback;
}

/**
 * 拉取充值配置：GET /api/user/topup/info，Bearer PAT 认证。
 * 字段缺失或类型不符时回退安全默认值（微信充值关闭、最低 1 元）。
 */
export async function fetchTopupInfo(
  apiBaseUrl: string,
  pat: string,
  fetchImpl: FetchLike,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<TopupInfo> {
  const body = (await fetchJson(
    `${apiBaseUrl}/api/user/topup/info`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${pat}` },
      signal: AbortSignal.timeout(timeoutMs),
    },
    fetchImpl,
    {
      timeout: '充值服务响应超时，请稍后重试',
      network: '无法连接充值服务，请检查网络',
      http: (status) => `充值服务不可用（HTTP ${status}）`,
    }
  )) as RechargeResponseBody;

  if (!isResponseBodySuccess(body)) {
    throw new RechargeFetchError('business', extractBusinessMessage(body, '充值配置获取失败'));
  }
  const data = (body.data ?? {}) as Record<string, unknown>;
  return {
    enableWechatTopup: data.enable_wechat_topup === true,
    wechatMinTopup: parsePositiveInt(data.wechat_min_topup) ?? DEFAULT_MIN_TOPUP,
    amountOptions: parseAmountOptions(data.amount_options),
    topupLink: typeof data.topup_link === 'string' && data.topup_link.trim() ? data.topup_link : null,
  };
}

/**
 * 创建微信 Native 支付订单：POST /api/user/wechatpay/pay {amount}（元，正整数）。
 * 成功返回 code_url / trade_no / expire_at；服务端业务失败（金额超限、未开通等）
 * 抛 business 错误并透出服务端文案。
 */
export async function createWechatPayOrder(
  apiBaseUrl: string,
  pat: string,
  amount: number,
  fetchImpl: FetchLike,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<WechatPayOrder> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RechargeFetchError('bad-request', '充值金额必须为正整数（元）');
  }
  const body = (await fetchJson(
    `${apiBaseUrl}/api/user/wechatpay/pay`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
      signal: AbortSignal.timeout(timeoutMs),
    },
    fetchImpl,
    {
      timeout: '下单超时，请稍后重试',
      network: '无法连接充值服务，请检查网络',
      http: (status) => `充值服务不可用（HTTP ${status}）`,
    }
  )) as RechargeResponseBody;

  if (!isResponseBodySuccess(body)) {
    throw new RechargeFetchError('business', extractBusinessMessage(body, '充值下单失败'));
  }
  const data = (body.data ?? {}) as Record<string, unknown>;
  const codeUrl = data.code_url;
  const tradeNo = data.trade_no;
  const expireAt = data.expire_at;
  if (
    typeof codeUrl !== 'string' ||
    !codeUrl ||
    typeof tradeNo !== 'string' ||
    !tradeNo ||
    typeof expireAt !== 'number' ||
    !Number.isFinite(expireAt)
  ) {
    throw new RechargeFetchError('bad-response', '充值服务响应数据异常');
  }
  return { codeUrl, tradeNo, expireAt };
}

/**
 * 查询订单状态：GET /api/user/wechatpay/status?trade_no=。
 * 网关在订单仍 pending 时会顺带向微信侧主动查询（回调丢失的兜底），
 * 因此前端只需持续轮询本接口。
 */
export async function fetchWechatPayOrderStatus(
  apiBaseUrl: string,
  pat: string,
  tradeNo: string,
  fetchImpl: FetchLike,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<WechatPayOrderStatusValue> {
  const body = (await fetchJson(
    `${apiBaseUrl}/api/user/wechatpay/status?trade_no=${encodeURIComponent(tradeNo)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${pat}` },
      signal: AbortSignal.timeout(timeoutMs),
    },
    fetchImpl,
    {
      timeout: '订单状态查询超时',
      network: '无法连接充值服务，请检查网络',
      http: (status) => `充值服务不可用（HTTP ${status}）`,
    }
  )) as RechargeResponseBody;

  if (!isResponseBodySuccess(body)) {
    throw new RechargeFetchError('business', extractBusinessMessage(body, '订单状态查询失败'));
  }
  const data = (body.data ?? {}) as Record<string, unknown>;
  const status = data.status;
  if (typeof status !== 'string' || !ORDER_STATUSES.includes(status)) {
    throw new RechargeFetchError('bad-response', '订单状态响应数据异常');
  }
  return status as WechatPayOrderStatusValue;
}

function parsePositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

// amount_options 在 new-api 侧可能是 JSON 字符串或数组，两种都接受
function parseAmountOptions(value: unknown): number[] {
  const raw = typeof value === 'string' ? safeJsonParse(value) : value;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const parsed = parsePositiveInt(item);
    return parsed === null ? [] : [parsed];
  });
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * IPC result 模式包装：成功/异常转为 {ok, ...} 对象，
 * main.ts 的 handler 用它返回而非抛异常
 */
export async function runRechargeFetch<T>(
  fn: () => Promise<T>
): Promise<{ ok: true; data: T } | { ok: false; kind: RechargeErrorKind; message: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof RechargeFetchError) {
      return { ok: false, kind: e.kind, message: e.message };
    }
    return {
      ok: false,
      kind: 'network',
      message: e instanceof Error ? e.message : '充值请求失败',
    };
  }
}
