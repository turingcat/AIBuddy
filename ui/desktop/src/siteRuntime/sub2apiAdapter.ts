export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Sub2apiAccount {
  displayName: string;
  balance: number;
}

export type SubscriptionRemainingUSD = {
  daily?: number;
  weekly?: number;
  monthly?: number;
};

export type Sub2apiEntitlement =
  | { kind: 'balance'; displayName: string; balance: number }
  | {
      kind: 'subscription';
      displayName: string;
      groupName: string;
      remainingUSD: SubscriptionRemainingUSD;
    };

export interface SiteModel {
  id: string;
  providerId: 'aibuddy';
}

interface Envelope {
  code?: unknown;
  data?: unknown;
}

interface SubscriptionProgressItem {
  subscription?: { group_id?: unknown };
  progress?: {
    group_name?: unknown;
    daily?: { remaining_usd?: unknown };
    weekly?: { remaining_usd?: unknown };
    monthly?: { remaining_usd?: unknown };
  };
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

async function fetchSubscriptionRemainingUSD(
  baseUrl: string,
  accessToken: string,
  groupId: string,
  fetchImpl: FetchLike
): Promise<{ groupName: string; remainingUSD: SubscriptionRemainingUSD } | null> {
  const data = (await fetchPanelData(
    baseUrl,
    '/api/v1/subscriptions/progress',
    accessToken,
    fetchImpl,
    '订阅服务'
  )) as unknown;
  if (!Array.isArray(data)) throw new Error('订阅服务响应数据异常');

  const matched = (data as SubscriptionProgressItem[]).find(
    (item) => String(item?.subscription?.group_id ?? '') === groupId
  );
  if (!matched) return null;

  const progress = matched.progress;
  if (!progress || typeof progress.group_name !== 'string') {
    throw new Error('订阅服务响应数据异常');
  }

  const remainingUSD: SubscriptionRemainingUSD = {};
  for (const period of ['daily', 'weekly', 'monthly'] as const) {
    const periodProgress = progress[period];
    if (periodProgress === undefined) continue;
    const remaining = periodProgress?.remaining_usd;
    if (typeof remaining !== 'number' || !Number.isFinite(remaining)) {
      throw new Error('订阅服务响应数据异常');
    }
    remainingUSD[period] = remaining;
  }

  if (Object.keys(remainingUSD).length === 0) throw new Error('订阅服务响应数据异常');

  return {
    groupName: progress.group_name,
    remainingUSD,
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

  const subscription = await fetchSubscriptionRemainingUSD(
    baseUrl,
    accessToken,
    groupId,
    fetchImpl
  );
  if (!subscription) return { kind: 'balance', ...account };

  return { kind: 'subscription', displayName: account.displayName, ...subscription };
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
