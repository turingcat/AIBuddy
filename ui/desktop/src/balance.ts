import type { CurrencyConfig } from './quotaFormat';
import type { Sub2apiEntitlement, SubscriptionRemainingUSD } from './siteRuntime/sub2apiAdapter';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface BalanceIdentity {
  userName: string;
  displayName: string;
}

export type BalanceData =
  | (BalanceIdentity & {
      kind: 'balance';
      quota: number;
      usedQuota: number;
      requestCount: number;
    })
  | (BalanceIdentity & {
      kind: 'subscription';
      groupName: string;
      remainingUSD: SubscriptionRemainingUSD;
    });

export function toSub2apiBalanceData(entitlement: Sub2apiEntitlement): BalanceData {
  if (entitlement.kind === 'balance') {
    return {
      kind: 'balance',
      quota: entitlement.balance,
      usedQuota: 0,
      requestCount: 0,
      userName: entitlement.displayName,
      displayName: entitlement.displayName,
    };
  }

  return {
    kind: 'subscription',
    userName: entitlement.displayName,
    displayName: entitlement.displayName,
    groupName: entitlement.groupName,
    remainingUSD: entitlement.remainingUSD,
  };
}

export type BalanceErrorKind = 'unauthorized' | 'http' | 'timeout' | 'network' | 'bad-response';
export type BalanceFailureKind = BalanceErrorKind | 'not-logged-in' | 'no-pat';

export type BalanceResult =
  | { ok: true; balance: BalanceData; currency: CurrencyConfig }
  | { ok: false; kind: BalanceFailureKind; message: string };

export class BalanceFetchError extends Error {
  readonly kind: BalanceErrorKind;

  constructor(kind: BalanceErrorKind, message: string) {
    super(message);
    this.name = 'BalanceFetchError';
    this.kind = kind;
  }
}

export async function runBalanceFetch(
  fn: () => Promise<{ balance: BalanceData; currency: CurrencyConfig }>
): Promise<BalanceResult> {
  try {
    const { balance, currency } = await fn();
    return { ok: true, balance, currency };
  } catch (error) {
    if (error instanceof BalanceFetchError) {
      return { ok: false, kind: error.kind, message: error.message };
    }
    return {
      ok: false,
      kind: 'network',
      message: error instanceof Error ? error.message : '余额查询失败',
    };
  }
}
