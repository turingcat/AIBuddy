import type { LoginCredentials } from './credentials';
import { Sub2apiUnauthorizedError } from './siteRuntime/sub2apiAdapter';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Sub2apiPublicSettings {
  aliyunCaptchaEnabled: boolean;
  aliyunCaptchaSceneId: string;
  aliyunCaptchaPrefix: string;
  aliyunCaptchaRegion: string;
  apiBaseUrl: string;
}

/** 面板登录下发的令牌对；refresh_token 在后端降级路径下可能缺失 */
export interface Sub2apiSession {
  accessToken: string;
  refreshToken?: string;
}

export type Sub2apiLoginStep =
  | { kind: 'authenticated'; session: Sub2apiSession }
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

export interface AIBuddyGroup {
  id: string;
  name: string;
}

export type AIBuddyProvisioningPreparation =
  | { step: 'authenticated'; credentials: LoginCredentials; firstModelId: string }
  | { step: 'select-group'; groups: AIBuddyGroup[] };

export interface AIBuddyGroupProvisioning {
  credentials: LoginCredentials;
  firstModelId: string;
}

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
  refresh_token?: unknown;
  requires_2fa?: unknown;
  temp_token?: unknown;
  user_email_masked?: unknown;
}

interface KeyData {
  name?: unknown;
  status?: unknown;
  key?: unknown;
  group_id?: unknown;
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

function credentialsFor(
  session: Sub2apiSession,
  settings: Sub2apiPublicSettings,
  apiKey: string,
  keyGroupId: string | null
): LoginCredentials {
  return {
    token: session.accessToken,
    baseUrl: normalizeGatewayUrl(settings.apiBaseUrl),
    apiKey,
    authKind: 'sub2api',
    ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    ...(keyGroupId ? { groupId: keyGroupId } : {}),
  };
}

function sessionFrom(data: LoginData | null): Sub2apiSession {
  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Sub2apiProtocolError('认证服务登录响应数据异常');
  }
  return {
    accessToken: data.access_token,
    ...(typeof data.refresh_token === 'string' && data.refresh_token
      ? { refreshToken: data.refresh_token }
      : {}),
  };
}

function groupId(value: unknown): string | null {
  if (typeof value === 'string' && value) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
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

  let envelope: Envelope;
  try {
    envelope = (await response.json()) as Envelope;
  } catch {
    if (!response.ok) {
      throw new Sub2apiProtocolError(`认证服务不可用（HTTP ${response.status}）`);
    }
    throw new Sub2apiProtocolError('认证服务响应格式异常');
  }

  if (typeof envelope?.code !== 'number') {
    if (!response.ok) {
      throw new Sub2apiProtocolError(`认证服务不可用（HTTP ${response.status}）`);
    }
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
  if (!response.ok) {
    throw new Sub2apiProtocolError(`认证服务不可用（HTTP ${response.status}）`);
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

  return { kind: 'authenticated', session: sessionFrom(data) };
}

export async function completeSub2apiTotp(
  panelBaseUrl: string,
  tempToken: string,
  totpCode: string,
  fetchImpl: FetchLike,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Sub2apiSession> {
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

  return sessionFrom(data);
}

/**
 * 用 refresh token 换新的令牌对。后端会轮换 refresh token（auth_handler.RefreshToken），
 * 旧的一换即废，返回值必须整体回写，否则下一次刷新就会失败。
 */
export async function refreshSub2apiSession(
  panelBaseUrl: string,
  refreshToken: string,
  fetchImpl: FetchLike,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Sub2apiSession> {
  const data = (await requestEnvelope(
    `${normalizePanelUrl(panelBaseUrl)}/api/v1/auth/refresh`,
    {
      method: 'POST',
      headers: CONTENT_TYPE_JSON,
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    fetchImpl,
    timeoutMs
  )) as LoginData | null;

  return sessionFrom(data);
}

/**
 * 面板接口调用包装：access token 过期时用 refresh token 换一次新令牌后重试，
 * 让用户不必因 token 到期重新登录。刷新本身失败时抛原始 401，交由调用方提示重新登录。
 */
export async function withSub2apiSession<T>(
  panelBaseUrl: string,
  session: Sub2apiSession,
  fetchImpl: FetchLike,
  onRefreshed: (session: Sub2apiSession) => void,
  run: (accessToken: string) => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  try {
    return await run(session.accessToken);
  } catch (error) {
    if (!(error instanceof Sub2apiUnauthorizedError) || !session.refreshToken) {
      throw error;
    }
    let refreshed: Sub2apiSession;
    try {
      refreshed = await refreshSub2apiSession(
        panelBaseUrl,
        session.refreshToken,
        fetchImpl,
        timeoutMs
      );
    } catch {
      throw error;
    }
    onRefreshed(refreshed);
    return run(refreshed.accessToken);
  }
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

async function listActiveAIBuddyKeys(
  panelBaseUrl: string,
  accessToken: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<KeyData[]> {
  const list = (await requestEnvelope(
    `${normalizePanelUrl(panelBaseUrl)}/api/v1/keys?page=1&page_size=100&search=AIBuddy&status=active`,
    { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
    fetchImpl,
    timeoutMs
  )) as KeyListData | null;
  if (!Array.isArray(list?.items)) {
    throw new Sub2apiProtocolError('API Key 查询响应数据异常');
  }
  return (list.items as KeyData[]).filter(
    (item) => item?.name === 'AIBuddy' && item.status === 'active'
  );
}

async function listAvailableAIBuddyGroups(
  panelBaseUrl: string,
  accessToken: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<AIBuddyGroup[]> {
  const data = await requestEnvelope(
    `${normalizePanelUrl(panelBaseUrl)}/api/v1/groups/available`,
    { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
    fetchImpl,
    timeoutMs
  );
  const items = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    throw new Sub2apiProtocolError('分组查询响应数据异常');
  }
  const groups = items.flatMap((item) => {
    const value = item as { id?: unknown; name?: unknown } | null;
    const id = groupId(value?.id);
    return id && typeof value?.name === 'string' && value.name ? [{ id, name: value.name }] : [];
  });
  if (groups.length === 0) {
    throw new Sub2apiProtocolError('当前账号没有可用分组');
  }
  return groups;
}

async function validateAIBuddyCatalog(
  settings: Sub2apiPublicSettings,
  apiKey: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(`${normalizeGatewayUrl(settings.apiBaseUrl)}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Sub2apiProtocolError('无法连接模型服务，请检查网络或服务地址');
  }
  if (!response.ok) {
    throw new Sub2apiProtocolError(`模型服务不可用（HTTP ${response.status}）`);
  }
  let body: { data?: unknown };
  try {
    body = (await response.json()) as { data?: unknown };
  } catch {
    throw new Sub2apiProtocolError('模型服务响应格式异常');
  }
  const first = Array.isArray(body.data)
    ? body.data.find((model) => typeof (model as { id?: unknown })?.id === 'string')
    : null;
  const firstModelId = (first as { id?: unknown } | null)?.id;
  if (typeof firstModelId !== 'string' || !firstModelId) {
    throw new Sub2apiProtocolError('模型服务未返回可用模型');
  }
  return firstModelId;
}

async function provisionWithKey(
  session: Sub2apiSession,
  settings: Sub2apiPublicSettings,
  apiKey: unknown,
  keyGroupId: string | null,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<AIBuddyGroupProvisioning> {
  if (!settings.apiBaseUrl) {
    throw new Sub2apiProtocolError('认证服务未配置 API 地址');
  }
  if (typeof apiKey !== 'string' || !apiKey) {
    throw new Sub2apiProtocolError('API Key 响应数据异常');
  }
  return {
    credentials: credentialsFor(session, settings, apiKey, keyGroupId),
    firstModelId: await validateAIBuddyCatalog(settings, apiKey, fetchImpl, timeoutMs),
  };
}

export async function prepareAIBuddyProvisioning(
  panelBaseUrl: string,
  session: Sub2apiSession,
  settings: Sub2apiPublicSettings,
  fetchImpl: FetchLike,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<AIBuddyProvisioningPreparation> {
  const keys = await listActiveAIBuddyKeys(panelBaseUrl, session.accessToken, fetchImpl, timeoutMs);
  const groupedKey = keys.find((key) => groupId(key.group_id) !== null);
  if (groupedKey) {
    const provisioned = await provisionWithKey(
      session,
      settings,
      groupedKey.key,
      groupId(groupedKey.group_id),
      fetchImpl,
      timeoutMs
    );
    return { step: 'authenticated', ...provisioned };
  }
  return {
    step: 'select-group',
    groups: await listAvailableAIBuddyGroups(
      panelBaseUrl,
      session.accessToken,
      fetchImpl,
      timeoutMs
    ),
  };
}

export async function provisionAIBuddyGroup(
  panelBaseUrl: string,
  session: Sub2apiSession,
  settings: Sub2apiPublicSettings,
  selectedGroupId: string,
  fetchImpl: FetchLike,
  idempotencyKeyFactory: () => string = () => globalThis.crypto.randomUUID(),
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<AIBuddyGroupProvisioning> {
  if (!selectedGroupId) {
    throw new Sub2apiProtocolError('请选择可用分组');
  }
  const existing = (
    await listActiveAIBuddyKeys(panelBaseUrl, session.accessToken, fetchImpl, timeoutMs)
  ).find((key) => groupId(key.group_id) === selectedGroupId);
  let apiKey = existing?.key;
  if (!existing) {
    const numericGroupId = Number(selectedGroupId);
    if (!/^[0-9]+$/.test(selectedGroupId) || !Number.isSafeInteger(numericGroupId)) {
      throw new Sub2apiProtocolError('分组 ID 无效，请重新选择可用分组');
    }
    const created = (await requestEnvelope(
      `${normalizePanelUrl(panelBaseUrl)}/api/v1/keys`,
      {
        method: 'POST',
        headers: {
          ...CONTENT_TYPE_JSON,
          Authorization: `Bearer ${session.accessToken}`,
          'Idempotency-Key': idempotencyKeyFactory(),
        },
        body: JSON.stringify({ name: 'AIBuddy', group_id: numericGroupId }),
      },
      fetchImpl,
      timeoutMs
    )) as KeyData | null;
    apiKey = created?.key;
  }
  return provisionWithKey(session, settings, apiKey, selectedGroupId, fetchImpl, timeoutMs);
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
      login.session.accessToken,
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
    const session = await completeSub2apiTotp(
      panelBaseUrl,
      tempToken,
      totpCode,
      fetchImpl,
      timeoutMs
    );
    const settings = await loadPublicSettings(panelBaseUrl, fetchImpl, timeoutMs);
    const creds = await provisionAIBuddyCredentials(
      panelBaseUrl,
      session.accessToken,
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
