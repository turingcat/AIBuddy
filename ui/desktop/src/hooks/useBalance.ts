import { useCallback, useEffect, useRef, useState } from 'react';

import type { BalanceData, BalanceFailureKind } from '../balance';
import type { CurrencyConfig } from '../quotaFormat';

/**
 * @author logic
 * @date 2026-08-24
 * 侧边栏余额轮询 hook：mount 时拉取一次，之后每 5 分钟轮询，
 * 手动 refresh() 立即拉取；请求序号防竞态（慢的旧响应直接丢弃）。
 * 数据经 window.electron.getUserBalance（主进程 net.fetch）获取。
 */

export type BalanceState =
  | { status: 'loading' }
  | { status: 'ready'; balance: BalanceData; currency: CurrencyConfig; updatedAt: number }
  | { status: 'no-pat' }
  | { status: 'not-logged-in' }
  | { status: 'unauthorized' }
  | { status: 'error'; message: string };

const DEFAULT_POLL_MS = 300_000;

function resultKindToState(kind: BalanceFailureKind, message: string): BalanceState {
  switch (kind) {
    case 'no-pat':
      return { status: 'no-pat' };
    case 'not-logged-in':
      return { status: 'not-logged-in' };
    case 'unauthorized':
      return { status: 'unauthorized' };
    default:
      return { status: 'error', message };
  }
}

export function useBalance(pollMs: number = DEFAULT_POLL_MS): {
  state: BalanceState;
  refreshing: boolean;
  refresh: () => void;
} {
  const [state, setState] = useState<BalanceState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const seqRef = useRef(0);

  const fetchBalance = useCallback(async () => {
    const seq = ++seqRef.current;
    setRefreshing(true);
    try {
      const result = await window.electron.getUserBalance();
      if (seq !== seqRef.current) return;
      if (result.ok) {
        setState({
          status: 'ready',
          balance: result.balance,
          currency: result.currency,
          updatedAt: Date.now(),
        });
      } else {
        setState(resultKindToState(result.kind, result.message));
      }
    } catch {
      if (seq === seqRef.current) {
        setState({ status: 'error', message: '余额查询失败' });
      }
    } finally {
      if (seq === seqRef.current) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    const timer = setInterval(fetchBalance, pollMs);
    return () => clearInterval(timer);
  }, [fetchBalance, pollMs]);

  return { state, refreshing, refresh: fetchBalance };
}
