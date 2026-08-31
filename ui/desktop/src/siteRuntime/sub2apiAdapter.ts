export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Sub2apiAccount {
  displayName: string;
  balance: number;
}

export interface SiteModel {
  id: string;
  providerId: 'aibuddy';
}

interface Envelope {
  code?: unknown;
  data?: unknown;
}

function panelUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function fetchSub2apiAccount(
  baseUrl: string,
  accessToken: string,
  fetchImpl: FetchLike
): Promise<Sub2apiAccount> {
  const response = await fetchImpl(`${panelUrl(baseUrl)}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`账户服务不可用（HTTP ${response.status}）`);

  const body = (await response.json()) as Envelope;
  const data =
    body.code === 0 ? (body.data as { email?: unknown; balance?: unknown } | undefined) : undefined;
  if (
    typeof data?.email !== 'string' ||
    !data.email.includes('@') ||
    typeof data.balance !== 'number'
  ) {
    throw new Error('账户服务响应数据异常');
  }

  return { displayName: data.email.split('@', 1)[0], balance: data.balance };
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
