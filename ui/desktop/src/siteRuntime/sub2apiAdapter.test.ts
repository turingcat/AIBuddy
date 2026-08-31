import { describe, expect, it, vi } from 'vitest';
import {
  fetchSub2apiAccount,
  fetchSub2apiEntitlement,
  fetchSub2apiModels,
  Sub2apiUnauthorizedError,
} from './sub2apiAdapter';

describe('sub2apiAdapter', () => {
  it('derives the displayed account name from a TFlow email and returns its USD balance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, data: { email: 'alice@example.com', balance: 12.34 } }),
        {
          status: 200,
        }
      )
    );

    await expect(fetchSub2apiAccount('https://tflow.online', 'jwt', fetchMock)).resolves.toEqual({
      displayName: 'alice',
      balance: 12.34,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tflow.online/api/v1/auth/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer jwt' } })
    );
  });

  it('reads a non-empty OpenAI-compatible TFlow model catalog', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'glm-5' }, { id: 'qwen3' }] }), { status: 200 })
      );

    await expect(fetchSub2apiModels('https://tflow.online/v1', 'sk', fetchMock)).resolves.toEqual([
      { id: 'glm-5', providerId: 'aibuddy' },
      { id: 'qwen3', providerId: 'aibuddy' },
    ]);
  });
});

describe('fetchSub2apiEntitlement', () => {
  const account = { code: 0, data: { email: 'alice@example.com', balance: 12.34 } };

  function panelStub(progress: unknown) {
    return vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(url.includes('/subscriptions/progress') ? progress : account), {
          status: 200,
        })
      )
    );
  }

  it('uses only auth/me and returns metered balance when the key has no group', async () => {
    const fetchMock = panelStub(null);

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', undefined, fetchMock)
    ).resolves.toEqual({ kind: 'balance', displayName: 'alice', balance: 12.34 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('matches numeric progress group IDs to a string configured group and preserves negative daily remaining USD', async () => {
    const fetchMock = panelStub({
      code: 0,
      data: [
        {
          subscription: { group_id: 7 },
          progress: { group_name: 'Other', daily: { remaining_usd: 4 } },
        },
        {
          subscription: { group_id: 42 },
          progress: { group_name: 'Codex Max', daily: { remaining_usd: -1.25 } },
        },
      ],
    });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).resolves.toEqual({
      kind: 'subscription',
      displayName: 'alice',
      groupName: 'Codex Max',
      remainingUSD: { daily: -1.25 },
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://tflow.online/api/v1/subscriptions/progress',
      expect.objectContaining({ headers: { Authorization: 'Bearer jwt' } })
    );
  });

  it('preserves only weekly remaining USD from a string progress group ID', async () => {
    const fetchMock = panelStub({
      code: 0,
      data: [
        {
          subscription: { group_id: '42' },
          progress: { group_name: 'TFlow Pro', weekly: { remaining_usd: 2.5 } },
        },
      ],
    });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).resolves.toEqual({
      kind: 'subscription',
      displayName: 'alice',
      groupName: 'TFlow Pro',
      remainingUSD: { weekly: 2.5 },
    });
  });

  it('preserves only monthly remaining USD and leaves missing periods absent', async () => {
    const fetchMock = panelStub({
      code: 0,
      data: [
        {
          subscription: { group_id: '42' },
          progress: { group_name: 'TFlow Pro', monthly: { remaining_usd: 3.75 } },
        },
      ],
    });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).resolves.toEqual({
      kind: 'subscription',
      displayName: 'alice',
      groupName: 'TFlow Pro',
      remainingUSD: { monthly: 3.75 },
    });
  });

  it('preserves every configured period remaining USD verbatim', async () => {
    const fetchMock = panelStub({
      code: 0,
      data: [
        {
          subscription: { group_id: '42' },
          progress: {
            group_name: 'TFlow Pro',
            daily: { remaining_usd: 1 },
            weekly: { remaining_usd: 2 },
            monthly: { remaining_usd: 3 },
          },
        },
      ],
    });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).resolves.toEqual({
      kind: 'subscription',
      displayName: 'alice',
      groupName: 'TFlow Pro',
      remainingUSD: { daily: 1, weekly: 2, monthly: 3 },
    });
  });

  it('falls back to account balance when no progress item covers the configured group', async () => {
    const fetchMock = panelStub({
      code: 0,
      data: [
        {
          subscription: { group_id: 'other' },
          progress: { group_name: 'Other', daily: { remaining_usd: 1 } },
        },
      ],
    });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).resolves.toEqual({ kind: 'balance', displayName: 'alice', balance: 12.34 });
  });

  it('rejects malformed progress for the matching subscription', async () => {
    const fetchMock = panelStub({
      code: 0,
      data: [
        {
          subscription: { group_id: 42 },
          progress: { group_name: 'TFlow Pro', weekly: { remaining_usd: 'not-a-number' } },
        },
      ],
    });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).rejects.toThrow('订阅服务响应数据异常');
  });

  it('surfaces a 401 from progress so the caller can refresh and retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(account), { status: 200 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).rejects.toBeInstanceOf(Sub2apiUnauthorizedError);
  });
});
