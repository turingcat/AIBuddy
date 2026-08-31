export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Sub2apiAccount {
  displayName: string;
  balance: number;
}

/**
 * 账户可用额度：TFlow 分组有两种计费模式（domain.SubscriptionType）。
 * 标准计量分组按余额扣费，订阅分组用日/周/月限额控制，余额恒为 0，
 * 两者显示的金额不是一回事，必须分流。
 */
export type Sub2apiEntitlement =
  | { kind: 'balance'; displayName: string; balance: number }
  | {
      kind: 'daily-quota';
      displayName: string;
      groupName: string;
      dailyLimitUSD: number;
      dailyUsedUSD: number;
    };

export interface SiteModel {
  id: string;
  providerId: 'aibuddy';
}

interface Envelope {
  code?: unknown;
  data?: unknown;
}

interface SubscriptionSummaryItem {
  group_id?: unknown;
  group_name?: unknown;
  daily_used_usd?: unknown;
  daily_limit_usd?: unknown;
}

/** 面板 access token 失效：调用方可用 refresh token 换新的一对后重试 */
export class Sub2apiUnauthorizedError extends Error {
  constructor() {
    super('登录已失效，请重新登录');
    this.name = 'Sub2apiUnauthorizedError';
  }
}

function panelUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

async function fetchPanelData(
  baseUrl: string,
  path: string,
  accessToken: string,
  fetchImpl: FetchLike,
  serviceName: string
): Promise<unknown> {
  const response = await fetchImpl(`${panelUrl(baseUrl)}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401) throw new Sub2apiUnauthorizedError();
  if (!response.ok) throw new Error(`${serviceName}不可用（HTTP ${response.status}）`);

  const body = (await response.json()) as Envelope;
  if (body.code !== 0) throw new Error(`${serviceName}响应数据异常`);
  return body.data;
}

export async function fetchSub2apiAccount(
  baseUrl: string,
  accessToken: string,
  fetchImpl: FetchLike
): Promise<Sub2apiAccount> {
  const data = (await fetchPanelData(
    baseUrl,
    '/api/v1/auth/me',
    accessToken,
    fetchImpl,
    '账户服务'
  )) as { email?: unknown; balance?: unknown } | undefined;
  if (
    typeof data?.email !== 'string' ||
    !data.email.includes('@') ||
    typeof data.balance !== 'number'
  ) {
    throw new Error('账户服务响应数据异常');
  }

  return { displayName: data.email.split('@', 1)[0], balance: data.balance };
}

/**
 * 取分组的生效日限额：订阅未覆盖该分组、或该分组只设了周/月限额时返回 null，
 * 由调用方回退到余额展示。daily_limit_usd 为 0 时后端 omitempty 不下发。
 */
async function fetchDailyQuota(
  baseUrl: string,
  accessToken: string,
  groupId: string,
  fetchImpl: FetchLike
): Promise<{ groupName: string; dailyLimitUSD: number; dailyUsedUSD: number } | null> {
  const data = (await fetchPanelData(
    baseUrl,
    '/api/v1/subscriptions/summary',
    accessToken,
    fetchImpl,
    '订阅服务'
  )) as { subscriptions?: unknown } | undefined;
  if (!Array.isArray(data?.subscriptions)) throw new Error('订阅服务响应数据异常');

  const matched = (data.subscriptions as SubscriptionSummaryItem[]).find(
    (item) => String(item?.group_id ?? '') === groupId
  );
  const dailyLimitUSD = matched?.daily_limit_usd;
  if (typeof dailyLimitUSD !== 'number' || !(dailyLimitUSD > 0)) return null;

  return {
    groupName: typeof matched?.group_name === 'string' ? matched.group_name : '',
    dailyLimitUSD,
    dailyUsedUSD: typeof matched?.daily_used_usd === 'number' ? matched.daily_used_usd : 0,
  };
}

export async function fetchSub2apiEntitlement(
  baseUrl: string,
  accessToken: string,
  groupId: string | undefined,
  fetchImpl: FetchLike
): Promise<Sub2apiEntitlement> {
  const account = await fetchSub2apiAccount(baseUrl, accessToken, fetchImpl);
  if (!groupId) return { kind: 'balance', ...account };

  const quota = await fetchDailyQuota(baseUrl, accessToken, groupId, fetchImpl);
  if (!quota) return { kind: 'balance', ...account };

  return { kind: 'daily-quota', displayName: account.displayName, ...quota };
}

export async function fetchSub2apiModels(
  baseUrl: string,
  apiKey: string,
  fetchImpl: FetchLike
): Promise<SiteModel[]> {
  const response = await fetchImpl(`${panelUrl(baseUrl)}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`模型服务不可用（HTTP ${response.status}）`);

  const body = (await response.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) throw new Error('模型服务响应数据异常');
  const models = body.data.flatMap((model) =>
    typeof (model as { id?: unknown }).id === 'string'
      ? [{ id: (model as { id: string }).id, providerId: 'aibuddy' as const }]
      : []
  );
  if (models.length === 0) throw new Error('模型服务未返回可用模型');
  return models;
}
