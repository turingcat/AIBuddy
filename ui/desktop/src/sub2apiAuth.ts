import type { LoginCredentials } from './credentials';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Sub2apiPublicSettings {
  aliyunCaptchaEnabled: boolean;
  aliyunCaptchaSceneId: string;
  aliyunCaptchaPrefix: string;
  aliyunCaptchaRegion: string;
  apiBaseUrl: string;
}

export type Sub2apiLoginStep =
  | { kind: 'authenticated'; accessToken: string }
  | { kind: 'totp-required'; tempToken: string; maskedEmail?: string };

export type AIBuddySettingsResult =
  { ok: true; settings: Sub2apiPublicSettings } | { ok: false; message: string; reason?: string };

export type AIBuddyAuthResult =
  | { ok: true; step: 'authenticated'; creds: LoginCredentials }
  | {
      ok: true;
      step: 'totp-required';
      tempToken: string;
      maskedEmail?: string;
    }
  | { ok: false; message: string; reason?: string };

interface Envelope {
  code: number;
  message?: string;
  reason?: string;
  data?: unknown;
}

interface PublicSettingsData {
  aliyun_captcha_enabled?: unknown;
  aliyun_captcha_scene_id?: unknown;
  aliyun_captcha_prefix?: unknown;
  aliyun_captcha_region?: unknown;
  api_base_url?: unknown;
}

interface LoginData {
  access_token?: unknown;
  requires_2fa?: unknown;
  temp_token?: unknown;
  user_email_masked?: unknown;
}

interface KeyData {
  name?: unknown;
  status?: unknown;
  key?: unknown;
}

interface KeyListData {
  items?: unknown;
}

class Sub2apiProtocolError extends Error {
  readonly reason?: string;

  constructor(message: string, reason?: string) {
    super(message);
    this.name = 'Sub2apiProtocolError';
    this.reason = reason;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const CONTENT_TYPE_JSON = { 'Content-Type': 'application/json' };

function normalizePanelUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeGatewayUrl(url: string): string {
  return `${url.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`;
}

function errorResult(error: unknown): { ok: false; message: string; reason?: string } {
  if (error instanceof Sub2apiProtocolError) {
    return error.reason
      ? { ok: false, message: error.message, reason: error.reason }
      : { ok: false, message: error.message };
  }
  return {
    ok: false,
    message: error instanceof Error ? error.message : '认证失败',
  };
}

async function requestEnvelope(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Sub2apiProtocolError('认证服务响应超时，请稍后重试');
    }
    throw new Sub2apiProtocolError('无法连接认证服务，请检查网络或服务地址');
  }

  if (!response.ok) {
    throw new Sub2apiProtocolError(`认证服务不可用（HTTP ${response.status}）`);
  }

  let envelope: Envelope;
  try {
    envelope = (await response.json()) as Envelope;
  } catch {
    throw new Sub2apiProtocolError('认证服务响应格式异常');
  }

  if (typeof envelope?.code !== 'number') {
    throw new Sub2apiProtocolError('认证服务响应格式异常');
  }
  if (envelope.code !== 0) {
    throw new Sub2apiProtocolError(
      typeof envelope.message === 'string' && envelope.message
        ? envelope.message
        : '认证服务请求失败',
      typeof envelope.reason === 'string' ? envelope.reason : undefined
    );
  }
  return envelope.data;
}

function extractSettings(data: unknown): Sub2apiPublicSettings {
  const value = data as PublicSettingsData | null;
  if (
    typeof value?.aliyun_captcha_enabled !== 'boolean' ||
    typeof value.aliyun_captcha_scene_id !== 'string' ||
    typeof value.aliyun_captcha_prefix !== 'string' ||
    typeof value.aliyun_captcha_region !== 'string' ||
    typeof value.api_base_url !== 'string' ||
    !value.api_base_url
  ) {
    throw new Sub2apiProtocolError('认证服务设置响应数据异常');
  }
  return {
    aliyunCaptchaEnabled: value.aliyun_captcha_enabled,
    aliyunCaptchaSceneId: value.aliyun_captcha_scene_id,
    aliyunCaptchaPrefix: value.aliyun_captcha_prefix,
    aliyunCaptchaRegion: value.aliyun_captcha_region,
    apiBaseUrl: value.api_base_url,
  };
}

async function loadPublicSettings(
  panelBaseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<Sub2apiPublicSettings> {
  const data = await requestEnvelope(
    `${normalizePanelUrl(panelBaseUrl)}/api/v1/settings/public`,
    { method: 'GET' },
    fetchImpl,
    timeoutMs
  );
  return extractSettings(data);
}

export async function fetchSub2apiPublicSettings(
  panelBaseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<AIBuddySettingsResult> {
  try {
    return { ok: true, settings: await loadPublicSettings(panelBaseUrl, fetchImpl, timeoutMs) };
  } catch (error) {
    return errorResult(error);
  }
}

export async function startSub2apiLogin(
  panelBaseUrl: string,
  email: string,
  password: string,
  captchaProof: string,
  fetchImpl: FetchLike,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Sub2apiLoginStep> {
  const data = (await requestEnvelope(
    `${normalizePanelUrl(panelBaseUrl)}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: CONTENT_TYPE_JSON,
      body: JSON.stringify({ email, password, turnstile_token: captchaProof }),
    },
    fetchImpl,
    timeoutMs
  )) as LoginData | null;

  if (data?.requires_2fa === true) {
    if (typeof data.temp_token !== 'string' || !data.temp_token) {
      throw new Sub2apiProtocolError('认证服务登录响应数据异常');
    }
    return {
      kind: 'totp-required',
      tempToken: data.temp_token,
      ...(typeof data.user_email_masked === 'string'
        ? { maskedEmail: data.user_email_masked }
        : {}),
    };
  }

  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Sub2apiProtocolError('认证服务登录响应数据异常');
  }
  return { kind: 'authenticated', accessToken: data.access_token };
}

export async function completeSub2apiTotp(
  panelBaseUrl: string,
  tempToken: string,
  totpCode: string,
  fetchImpl: FetchLike,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  if (!/^\d{6}$/.test(totpCode)) {
    throw new Sub2apiProtocolError('请输入 6 位数字验证码');
  }
  const data = (await requestEnvelope(
    `${normalizePanelUrl(panelBaseUrl)}/api/v1/auth/login/2fa`,
    {
      method: 'POST',
      headers: CONTENT_TYPE_JSON,
      body: JSON.stringify({ temp_token: tempToken, totp_code: totpCode }),
    },
    fetchImpl,
    timeoutMs
  )) as LoginData | null;

  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Sub2apiProtocolError('认证服务登录响应数据异常');
  }
  return data.access_token;
}

export async function provisionAIBuddyCredentials(
  panelBaseUrl: string,
  accessToken: string,
  settings: Sub2apiPublicSettings,
  fetchImpl: FetchLike,
  idempotencyKeyFactory: () => string = () => globalThis.crypto.randomUUID(),
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<LoginCredentials> {
  if (!settings.apiBaseUrl) {
    throw new Sub2apiProtocolError('认证服务未配置 API 地址');
  }

  const baseUrl = normalizePanelUrl(panelBaseUrl);
  const authorization = { Authorization: `Bearer ${accessToken}` };
  const list = (await requestEnvelope(
    `${baseUrl}/api/v1/keys?page=1&page_size=100&search=AIBuddy&status=active`,
    { method: 'GET', headers: authorization },
    fetchImpl,
    timeoutMs
  )) as KeyListData | null;

  if (!Array.isArray(list?.items)) {
    throw new Sub2apiProtocolError('API Key 查询响应数据异常');
  }

  const existing = (list.items as KeyData[]).find(
    (item) => item?.name === 'AIBuddy' && item.status === 'active'
  );
  let apiKey: unknown = existing?.key;

  if (!existing) {
    const created = (await requestEnvelope(
      `${baseUrl}/api/v1/keys`,
      {
        method: 'POST',
        headers: {
          ...CONTENT_TYPE_JSON,
          ...authorization,
          'Idempotency-Key': idempotencyKeyFactory(),
        },
        body: JSON.stringify({ name: 'AIBuddy' }),
      },
      fetchImpl,
      timeoutMs
    )) as KeyData | null;
    apiKey = created?.key;
  }

  if (typeof apiKey !== 'string' || !apiKey) {
    throw new Sub2apiProtocolError('API Key 响应数据异常');
  }

  return {
    token: accessToken,
    baseUrl: normalizeGatewayUrl(settings.apiBaseUrl),
    apiKey,
    authKind: 'sub2api',
  };
}

export async function authenticateAIBuddy(
  panelBaseUrl: string,
  email: string,
  password: string,
  captchaProof: string,
  fetchImpl: FetchLike,
  idempotencyKeyFactory?: () => string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<AIBuddyAuthResult> {
  try {
    const settings = await loadPublicSettings(panelBaseUrl, fetchImpl, timeoutMs);
    const login = await startSub2apiLogin(
      panelBaseUrl,
      email,
      password,
      captchaProof,
      fetchImpl,
      timeoutMs
    );
    if (login.kind === 'totp-required') {
      return {
        ok: true,
        step: 'totp-required',
        tempToken: login.tempToken,
        ...(login.maskedEmail ? { maskedEmail: login.maskedEmail } : {}),
      };
    }
    const creds = await provisionAIBuddyCredentials(
      panelBaseUrl,
      login.accessToken,
      settings,
      fetchImpl,
      idempotencyKeyFactory,
      timeoutMs
    );
    return { ok: true, step: 'authenticated', creds };
  } catch (error) {
    return errorResult(error);
  }
}

export async function completeAIBuddyAuthentication(
  panelBaseUrl: string,
  tempToken: string,
  totpCode: string,
  fetchImpl: FetchLike,
  idempotencyKeyFactory?: () => string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<AIBuddyAuthResult> {
  try {
    const accessToken = await completeSub2apiTotp(
      panelBaseUrl,
      tempToken,
      totpCode,
      fetchImpl,
      timeoutMs
    );
    const settings = await loadPublicSettings(panelBaseUrl, fetchImpl, timeoutMs);
    const creds = await provisionAIBuddyCredentials(
      panelBaseUrl,
      accessToken,
      settings,
      fetchImpl,
      idempotencyKeyFactory,
      timeoutMs
    );
    return { ok: true, step: 'authenticated', creds };
  } catch (error) {
    return errorResult(error);
  }
}
