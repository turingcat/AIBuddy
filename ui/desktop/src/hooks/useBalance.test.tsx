import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { markSessionStreamState, useBalance } from './useBalance';
import { AppEvents } from '../constants/events';
import type { BalanceResult } from '../balance';

/**
 * @author logic
 * @date 2026-09-02
 * useBalance hook 单测：初始拉取、BALANCE_REFRESH_REQUESTED 事件触发即时刷新、
 * 失败状态映射；顺带覆盖 markSessionStreamState 的边沿判定分支。
 */

const electronMock = window.electron as unknown as {
  getUserBalance: ReturnType<typeof vi.fn>;
};

function okResult(): BalanceResult {
  return {
    ok: true,
    balance: {
      kind: 'balance',
      quota: 5000000,
      usedQuota: 100000,
      requestCount: 42,
      userName: 'oa_1',
      displayName: '张三',
    },
    currency: {
      quotaPerUnit: 500000,
      quotaDisplayType: 'USD',
      usdExchangeRate: 1,
      customCurrencySymbol: '$',
      customCurrencyExchangeRate: 1,
    },
  };
}

describe('markSessionStreamState（会话完成边沿判定）', () => {
  it('首见会话视为 idle，不触发边沿', () => {
    const states = new Map();
    expect(markSessionStreamState(states, 's1', 'idle')).toBe(false);
    expect(markSessionStreamState(states, 's1', 'streaming')).toBe(false);
  });

  it('streaming→idle 触发边沿；其余转移不触发', () => {
    const states = new Map([['s1', 'streaming']]);
    expect(markSessionStreamState(states, 's1', 'idle')).toBe(true);
    expect(markSessionStreamState(states, 's1', 'idle')).toBe(false);
    expect(markSessionStreamState(states, 's1', 'loading')).toBe(false);
  });

  it('多会话独立记录，交错派发不漏检', () => {
    const states = new Map([['s1', 'streaming']]);
    expect(markSessionStreamState(states, 's2', 'streaming')).toBe(false);
    expect(markSessionStreamState(states, 's1', 'idle')).toBe(true);
  });
});

describe('useBalance（余额轮询 hook）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMock.getUserBalance = vi.fn();
  });

  it('挂载时拉取一次；BALANCE_REFRESH_REQUESTED 事件触发即时刷新', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    const { result } = renderHook(() => useBalance(600_000));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(electronMock.getUserBalance).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new CustomEvent(AppEvents.BALANCE_REFRESH_REQUESTED));
    });
    await waitFor(() => {
      expect(electronMock.getUserBalance).toHaveBeenCalledTimes(2);
    });
  });

  it('unauthorized 结果映射为 unauthorized 状态', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind: 'unauthorized',
      message: '登录已失效，请重新登录',
    });
    const { result } = renderHook(() => useBalance(600_000));

    await waitFor(() => {
      expect(result.current.state.status).toBe('unauthorized');
    });
  });

  it('no-pat / not-logged-in 分别映射为对应状态', async () => {
    electronMock.getUserBalance.mockResolvedValueOnce({
      ok: false,
      kind: 'no-pat',
      message: '请重新登录后查看余额',
    });
    const first = renderHook(() => useBalance(600_000));
    await waitFor(() => {
      expect(first.result.current.state.status).toBe('no-pat');
    });

    electronMock.getUserBalance.mockResolvedValueOnce({
      ok: false,
      kind: 'not-logged-in',
      message: '尚未登录',
    });
    const second = renderHook(() => useBalance(600_000));
    await waitFor(() => {
      expect(second.result.current.state.status).toBe('not-logged-in');
    });
  });

  it('其余失败 kind（如 http）映射为 error 状态并保留 message', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind: 'http',
      message: '余额服务不可用（HTTP 502）',
    });
    const { result } = renderHook(() => useBalance(600_000));

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        status: 'error',
        message: '余额服务不可用（HTTP 502）',
      });
    });
  });

  it('SESSION_STATUS_UPDATE 出现 streaming→idle 边沿时刷新余额；非边沿不刷新', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    renderHook(() => useBalance(600_000));
    await waitFor(() => {
      expect(electronMock.getUserBalance).toHaveBeenCalledTimes(1);
    });

    const dispatch = (sessionId: string, streamState: string) =>
      act(() => {
        window.dispatchEvent(
          new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, { detail: { sessionId, streamState } })
        );
      });

    dispatch('s1', 'idle'); // 首见 idle，不触发
    dispatch('s1', 'streaming');
    dispatch('s1', 'loading'); // streaming→loading 非完成边沿，不触发
    dispatch('s1', 'streaming');
    dispatch('s1', 'idle'); // streaming→idle 完成边沿，触发刷新

    await waitFor(() => {
      expect(electronMock.getUserBalance).toHaveBeenCalledTimes(2);
    });
  });

  it('IPC 抛异常时映射为 error 状态', async () => {
    electronMock.getUserBalance.mockRejectedValue(new Error('ipc broken'));
    const { result } = renderHook(() => useBalance(600_000));

    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'error' });
    });
  });
});
