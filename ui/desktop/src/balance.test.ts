import { describe, expect, it } from 'vitest';
import {
  BalanceFetchError,
  runBalanceFetch,
  toSub2apiBalanceData,
  type BalanceData,
} from './balance';
import { DEFAULT_CURRENCY_CONFIG } from './quotaFormat';

describe('toSub2apiBalanceData', () => {
  it('maps metered TFlow entitlement to balance data', () => {
    expect(toSub2apiBalanceData({ kind: 'balance', displayName: 'Ada', balance: 12.5 })).toEqual({
      kind: 'balance',
      quota: 12.5,
      usedQuota: 0,
      requestCount: 0,
      userName: 'Ada',
      displayName: 'Ada',
    });
  });

  it('maps subscription TFlow entitlement without losing period limits', () => {
    expect(
      toSub2apiBalanceData({
        kind: 'subscription',
        displayName: 'Ada',
        groupName: 'Team',
        remainingUSD: { daily: 1, weekly: 2, monthly: 3 },
      })
    ).toEqual({
      kind: 'subscription',
      userName: 'Ada',
      displayName: 'Ada',
      groupName: 'Team',
      remainingUSD: { daily: 1, weekly: 2, monthly: 3 },
    });
  });
});

describe('runBalanceFetch', () => {
  const balance: BalanceData = {
    kind: 'balance',
    quota: 10,
    usedQuota: 0,
    requestCount: 0,
    userName: 'Ada',
    displayName: 'Ada',
  };

  it('returns balance and currency from a successful TFlow request', async () => {
    await expect(
      runBalanceFetch(async () => ({ balance, currency: DEFAULT_CURRENCY_CONFIG }))
    ).resolves.toEqual({ ok: true, balance, currency: DEFAULT_CURRENCY_CONFIG });
  });

  it('preserves classified balance failures', async () => {
    await expect(
      runBalanceFetch(async () => {
        throw new BalanceFetchError('unauthorized', '登录已失效');
      })
    ).resolves.toEqual({ ok: false, kind: 'unauthorized', message: '登录已失效' });
  });

  it('maps unexpected errors to network failures', async () => {
    await expect(
      runBalanceFetch(async () => {
        throw new Error('gateway unavailable');
      })
    ).resolves.toEqual({ ok: false, kind: 'network', message: 'gateway unavailable' });
  });

  it('uses a stable message when a dependency rejects without an Error', async () => {
    await expect(
      runBalanceFetch(async () => {
        throw 'offline';
      })
    ).resolves.toEqual({ ok: false, kind: 'network', message: '余额查询失败' });
  });
});
