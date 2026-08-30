import { describe, expect, it, vi } from 'vitest';
import {
  authenticateAIBuddy,
  completeAIBuddyAuthentication,
  completeSub2apiTotp,
  fetchSub2apiPublicSettings,
  provisionAIBuddyCredentials,
  startSub2apiLogin,
  type FetchLike,
  type Sub2apiPublicSettings,
} from './sub2apiAuth';

const panelUrl = 'https://tflow.online/';
const settings: Sub2apiPublicSettings = {
  aliyunCaptchaEnabled: true,
  aliyunCaptchaSceneId: 'scene-id',
  aliyunCaptchaPrefix: 'prefix',
  aliyunCaptchaRegion: 'cn',
  apiBaseUrl: 'https://tflow.online/',
};

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const asFetch = (mock: ReturnType<typeof vi.fn>): FetchLike => mock as FetchLike;

function publicSettings(apiBaseUrl = 'https://tflow.online/'): Record<string, unknown> {
  return {
    aliyun_captcha_enabled: true,
    aliyun_captcha_scene_id: 'scene-id',
    aliyun_captcha_prefix: 'prefix',
    aliyun_captcha_region: 'cn',
    api_base_url: apiBaseUrl,
  };
}

describe('fetchSub2apiPublicSettings', () => {
  it('extracts required settings and normalizes the panel request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope(publicSettings()));

    await expect(fetchSub2apiPublicSettings(panelUrl, asFetch(fetchMock))).resolves.toEqual({
      ok: true,
      settings,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tflow.online/api/v1/settings/public',
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) })
    );
  });

  it('rejects settings missing api_base_url', async () => {
    const data = publicSettings();
    delete data.api_base_url;
    const fetchMock = vi.fn().mockResolvedValue(envelope(data));

    await expect(fetchSub2apiPublicSettings(panelUrl, asFetch(fetchMock))).resolves.toEqual({
      ok: false,
      message: '认证服务设置响应数据异常',
    });
  });

  it('preserves message and reason from a nonzero envelope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 4001, message: '验证失败', reason: 'CAPTCHA_FAILED' }))
      );

    await expect(fetchSub2apiPublicSettings(panelUrl, asFetch(fetchMock))).resolves.toEqual({
      ok: false,
      message: '验证失败',
      reason: 'CAPTCHA_FAILED',
    });
  });

  it('classifies non-JSON and network failures', async () => {
    const nonJson = vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>'));
    const network = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchSub2apiPublicSettings(panelUrl, asFetch(nonJson))).resolves.toEqual({
      ok: false,
      message: '认证服务响应格式异常',
    });
    await expect(fetchSub2apiPublicSettings(panelUrl, asFetch(network))).resolves.toEqual({
      ok: false,
      message: '无法连接认证服务，请检查网络或服务地址',
    });
  });

  it('classifies timeout failures', async () => {
    const fetchMock = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        })
    );

    await expect(fetchSub2apiPublicSettings(panelUrl, asFetch(fetchMock), 10)).resolves.toEqual({
      ok: false,
      message: '认证服务响应超时，请稍后重试',
    });
  });
});

describe('sub2api login steps', () => {
  it('posts the password and captcha proof for a normal login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope({ access_token: 'access-token' }));

    await expect(
      startSub2apiLogin(panelUrl, 'user@example.com', 'secret', 'captcha-param', asFetch(fetchMock))
    ).resolves.toEqual({ kind: 'authenticated', accessToken: 'access-token' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tflow.online/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'secret',
          turnstile_token: 'captcha-param',
        }),
      })
    );
  });

  it('returns the temporary token and masked email for TOTP', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        requires_2fa: true,
        temp_token: 'temp-token',
        user_email_masked: 'u***@example.com',
      })
    );

    await expect(
      startSub2apiLogin(panelUrl, 'user@example.com', 'secret', 'captcha', asFetch(fetchMock))
    ).resolves.toEqual({
      kind: 'totp-required',
      tempToken: 'temp-token',
      maskedEmail: 'u***@example.com',
    });
  });

  it('posts a six-digit TOTP code without captcha fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope({ access_token: 'access-token' }));

    await expect(
      completeSub2apiTotp(panelUrl, 'temp-token', '123456', asFetch(fetchMock))
    ).resolves.toBe('access-token');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe('https://tflow.online/api/v1/auth/login/2fa');
    expect(init.body).toBe(JSON.stringify({ temp_token: 'temp-token', totp_code: '123456' }));
    expect(JSON.parse(init.body as string)).not.toHaveProperty('turnstile_token');
  });

  it('rejects non-six-digit TOTP without a request', async () => {
    const fetchMock = vi.fn();

    await expect(
      completeSub2apiTotp(panelUrl, 'temp-token', '12345x', asFetch(fetchMock))
    ).rejects.toThrow('请输入 6 位数字验证码');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('provisionAIBuddyCredentials', () => {
  it('reuses only an exact-name active AIBuddy key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        items: [{ name: 'AIBuddy', status: 'active', key: 'sk-aibuddy' }],
        total: 1,
        page: 1,
        page_size: 100,
        pages: 1,
      })
    );

    await expect(
      provisionAIBuddyCredentials(
        panelUrl,
        'access-token',
        settings,
        asFetch(fetchMock),
        () => 'idem'
      )
    ).resolves.toEqual({
      token: 'access-token',
      baseUrl: 'https://tflow.online/v1',
      apiKey: 'sk-aibuddy',
      authKind: 'sub2api',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a partial name and creates an exact AIBuddy key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          items: [{ name: 'AIBuddy-old', status: 'active', key: 'sk-old' }],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        })
      )
      .mockResolvedValueOnce(envelope({ key: 'sk-aibuddy' }));

    await provisionAIBuddyCredentials(
      panelUrl,
      'access-token',
      settings,
      asFetch(fetchMock),
      () => 'idem-partial'
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://tflow.online/api/v1/keys',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'AIBuddy' }) }),
    ]);
  });

  it('queries active keys then creates with bearer auth and idempotency', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope({ items: [], total: 0, page: 1, page_size: 100, pages: 0 }))
      .mockResolvedValueOnce(envelope({ key: 'sk-aibuddy' }));

    await provisionAIBuddyCredentials(
      panelUrl,
      'access-token',
      settings,
      asFetch(fetchMock),
      () => 'stable-idempotency-key'
    );
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://tflow.online/api/v1/keys?page=1&page_size=100&search=AIBuddy&status=active',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    ]);
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Idempotency-Key': 'stable-idempotency-key',
        }),
      })
    );
  });

  it('never creates after a key query error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: 5001, message: '查询失败' })));

    await expect(
      provisionAIBuddyCredentials(
        panelUrl,
        'access-token',
        settings,
        asFetch(fetchMock),
        () => 'idem'
      )
    ).rejects.toThrow('查询失败');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects missing key material or api_base_url without credentials', async () => {
    const missingKey = vi.fn().mockResolvedValue(
      envelope({
        items: [{ name: 'AIBuddy', status: 'active' }],
        total: 1,
        page: 1,
        page_size: 100,
        pages: 1,
      })
    );
    const unusedFetch = vi.fn();

    await expect(
      provisionAIBuddyCredentials(
        panelUrl,
        'access-token',
        settings,
        asFetch(missingKey),
        () => 'idem'
      )
    ).rejects.toThrow('API Key 响应数据异常');
    await expect(
      provisionAIBuddyCredentials(
        panelUrl,
        'access-token',
        { ...settings, apiBaseUrl: '' },
        asFetch(unusedFetch),
        () => 'idem'
      )
    ).rejects.toThrow('认证服务未配置 API 地址');
    expect(unusedFetch).not.toHaveBeenCalled();
  });
});

describe('AIBuddy authentication wrappers', () => {
  it('runs settings, login, query, and create to authenticated credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope(publicSettings()))
      .mockResolvedValueOnce(envelope({ access_token: 'access-token' }))
      .mockResolvedValueOnce(envelope({ items: [], total: 0, page: 1, page_size: 100, pages: 0 }))
      .mockResolvedValueOnce(envelope({ key: 'sk-aibuddy' }));

    await expect(
      authenticateAIBuddy(
        panelUrl,
        'user@example.com',
        'secret',
        'captcha',
        asFetch(fetchMock),
        () => 'idem'
      )
    ).resolves.toEqual({
      ok: true,
      step: 'authenticated',
      creds: {
        token: 'access-token',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-aibuddy',
        authKind: 'sub2api',
      },
    });
  });

  it('returns TOTP-required without provisioning', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope(publicSettings()))
      .mockResolvedValueOnce(
        envelope({
          requires_2fa: true,
          temp_token: 'temp-token',
          user_email_masked: 'u***@example.com',
        })
      );

    await expect(
      authenticateAIBuddy(
        panelUrl,
        'user@example.com',
        'secret',
        'captcha',
        asFetch(fetchMock),
        () => 'idem'
      )
    ).resolves.toEqual({
      ok: true,
      step: 'totp-required',
      tempToken: 'temp-token',
      maskedEmail: 'u***@example.com',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('completes TOTP, refetches settings, and provisions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope({ access_token: 'access-token' }))
      .mockResolvedValueOnce(envelope(publicSettings('https://gateway.example/')))
      .mockResolvedValueOnce(
        envelope({
          items: [{ name: 'AIBuddy', status: 'active', key: 'sk-aibuddy' }],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        })
      );

    await expect(
      completeAIBuddyAuthentication(
        panelUrl,
        'temp-token',
        '123456',
        asFetch(fetchMock),
        () => 'idem'
      )
    ).resolves.toEqual({
      ok: true,
      step: 'authenticated',
      creds: {
        token: 'access-token',
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-aibuddy',
        authKind: 'sub2api',
      },
    });
  });

  it('converts protocol failures to an IPC-safe error result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 4012,
          message: '验证失败',
          reason: 'ALIYUN_CAPTCHA_VERIFICATION_FAILED',
        })
      )
    );

    await expect(
      authenticateAIBuddy(
        panelUrl,
        'user@example.com',
        'secret',
        'captcha',
        asFetch(fetchMock),
        () => 'idem'
      )
    ).resolves.toEqual({
      ok: false,
      message: '验证失败',
      reason: 'ALIYUN_CAPTCHA_VERIFICATION_FAILED',
    });
  });
});
