import { useCallback, useEffect, useRef, useState } from 'react';

import type { BalanceData, BalanceFailureKind } from '../balance';
import type { CurrencyConfig } from '../quotaFormat';
import { AppEvents } from '../constants/events';

/**
 * @author logic
 * @date 2026-08-24
 * 侧边栏余额轮询 hook：mount 时拉取一次，之后每 5 分钟轮询，
 * 手动 refresh() 立即拉取；请求序号防竞态（慢的旧响应直接丢弃）。
 * 数据经 window.electron.getUserBalance（主进程 net.fetch）获取。
 * @date 2026-08-25
 * 新增：监听会话状态事件，任一会话一轮对话结束（streaming→idle 边沿）时
 * 立即刷新一次余额（对话扣费后侧栏数字即时更新，比 5 分钟轮询更准确）。
 */

export type BalanceState =
  | { status: 'loading' }
  | { status: 'ready'; balance: BalanceData; currency: CurrencyConfig; updatedAt: number }
  | { status: 'no-pat' }
  | { status: 'not-logged-in' }
  | { status: 'unauthorized' }
  | { status: 'error'; message: string };

const DEFAULT_POLL_MS = 300_000;

/** 会话流式状态，与 BaseChat 派发 SESSION_STATUS_UPDATE 时 detail.streamState 的取值一致 */
export type SessionStreamState = 'idle' | 'loading' | 'streaming' | 'error';

/**
 * 记录会话流式状态并判断是否出现"一轮对话完成"边沿（streaming→idle）。
 * 首见会话视为 idle（BaseChat 挂载时派发的初始 idle 不误触发）。
 * 纯函数直接操作传入的 Map（按 sessionId 独立记录，多个后台会话交错
 * 派发时不漏检边沿），抽出以便单测精确断言。
 */
export function markSessionStreamState(
  states: Map<string, SessionStreamState>,
  sessionId: string,
  streamState: SessionStreamState
): boolean {
  const previous = states.get(sessionId) ?? 'idle';
  states.set(sessionId, streamState);
  return previous === 'streaming' && streamState === 'idle';
}

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
  // 各会话最近一次流式状态；按 sessionId 记录，多个后台会话交错派发时不漏检边沿
  const sessionStreamStatesRef = useRef<Map<string, SessionStreamState>>(new Map());

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

  /**
   * 监听会话状态事件（BaseChat 每次 chatState 变化时派发）：任一会话从
   * streaming 回到 idle（一轮 prompt/response 结束，含用户主动 stop）时
   * 立即刷新一次余额。首见会话默认 previous='idle'，BaseChat 挂载时派发的
   * 初始 idle 不误触发；loading→idle、重复 idle、error 等非完成边沿不触发。
   * 轮询独立保留，覆盖每日额度发放等非对话场景。
   */
  useEffect(() => {
    const handleSessionStatusUpdate = (event: Event) => {
      const { sessionId, streamState } = (
        event as CustomEvent<{ sessionId: string; streamState: SessionStreamState }>
      ).detail;
      if (markSessionStreamState(sessionStreamStatesRef.current, sessionId, streamState)) {
        fetchBalance();
      }
    };

    window.addEventListener(AppEvents.SESSION_STATUS_UPDATE, handleSessionStatusUpdate);
    return () =>
      window.removeEventListener(AppEvents.SESSION_STATUS_UPDATE, handleSessionStatusUpdate);
  }, [fetchBalance]);

  return { state, refreshing, refresh: fetchBalance };
}
