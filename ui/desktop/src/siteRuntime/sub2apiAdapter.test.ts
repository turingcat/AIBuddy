import { describe, expect, it, vi } from 'vitest';
import { fetchSub2apiAccount, fetchSub2apiEntitlement, fetchSub2apiModels } from './sub2apiAdapter';

describe('sub2apiAdapter', () => {
  it('derives the displayed account name from the TFlow email and returns its USD balance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, data: { email: 'alice@example.com', balance: 12.34 } }),
          { status: 200 }
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

  function panelStub(summary: unknown) {
    return vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(url.includes('/subscriptions/summary') ? summary : account), {
          status: 200,
        })
      )
    );
  }

  it('shows the account balance when the key has no group and is therefore metered', async () => {
    const fetchMock = panelStub(null);

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', undefined, fetchMock)
    ).resolves.toEqual({ kind: 'balance', displayName: 'alice', balance: 12.34 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 订阅分组按限额计费，账户余额恒为 0，拿余额当额度显示等于告诉用户"没钱了"
  it('shows the daily quota of the group the key belongs to when it is subscription billed', async () => {
    const fetchMock = panelStub({
      code: 0,
      data: {
        subscriptions: [
          { group_id: 7, group_name: 'Other', daily_limit_usd: 5, daily_used_usd: 1 },
          { group_id: 42, group_name: 'Codex Max', daily_limit_usd: 50, daily_used_usd: 12.5 },
        ],
      },
    });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).resolves.toEqual({
      kind: 'daily-quota',
      displayName: 'alice',
      groupName: 'Codex Max',
      dailyLimitUSD: 50,
      dailyUsedUSD: 12.5,
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://tflow.online/api/v1/subscriptions/summary',
      expect.objectContaining({ headers: { Authorization: 'Bearer jwt' } })
    );
  });

  it('falls back to the balance when no active subscription covers the key group', async () => {
    const fetchMock = panelStub({ code: 0, data: { subscriptions: [] } });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).resolves.toEqual({ kind: 'balance', displayName: 'alice', balance: 12.34 });
  });

  // daily_limit_usd 为 0 时后端 omitempty 不下发，这类分组只有周/月限额，没有日额度可显示
  it('falls back to the balance when the subscribed group has no daily limit', async () => {
    const fetchMock = panelStub({
      code: 0,
      data: { subscriptions: [{ group_id: 42, group_name: 'Weekly', weekly_limit_usd: 100 }] },
    });

    await expect(
      fetchSub2apiEntitlement('https://tflow.online', 'jwt', '42', fetchMock)
    ).resolves.toEqual({ kind: 'balance', displayName: 'alice', balance: 12.34 });
  });
});
