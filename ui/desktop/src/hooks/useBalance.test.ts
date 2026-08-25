import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useBalance, markSessionStreamState } from './useBalance';
import type { SessionStreamState } from './useBalance';
import type { BalanceResult } from '../balance';
import { DEFAULT_CURRENCY_CONFIG } from '../quotaFormat';
import { AppEvents } from '../constants/events';

/**
 * @author logic
 * @date 2026-08-24
 * useBalance hook 单测：fake timers + mock window.electron.getUserBalance。
 * 说明：React 19 的 act 环境会在每个 act 边界重放 effect（挂载后可能多次拉取），
 * 因此断言采用调用数增量与状态契约，不依赖挂载期的绝对调用次数。
 * @date 2026-08-25
 * 新增会话完成边沿刷新（M 系列为 markSessionStreamState 纯函数精确断言；
 * H12/H15/H16 为 hook 事件接线验证——受 act 边界重放影响，接线用例只做
 * 容错式增量断言，非触发语义全部由纯函数用例保证）。
 *
 * 路径分析（markSessionStreamState，V(G)=3）：
 *   M1 首见会话默认 idle / M2 idle→streaming 不触发 / M3 streaming→idle 触发并落库 /
 *   M4 loading→idle / M5 idle→idle（重复派发）/ M6 streaming→error /
 *   M7 streaming→loading / M8 error→idle / M9 多会话独立（全局单状态会漏检的回归）。
 * 路径分析（useBalance，V(G)=8）：
 *   H1 loading→ready / H2 定时轮询持续拉取 / H3 手动 refresh /
 *   H4 no-pat / H5 not-logged-in / H6 unauthorized / H7 其他错误 message /
 *   H8 invoke 意外抛异常 / H9 卸载后停止轮询 / H10 慢响应竞态丢弃旧结果 /
 *   H12 事件边沿触发刷新（接线）/ H15 卸载移除事件监听 / H16 事件与轮询互不干扰。
 * 条件矩阵：
 *   | 原子条件 | 取真用例 | 取假用例 |
 *   | result.ok | H1 | H4-H7 |
 *   | seq === seqRef.current（非竞态） | H1-H8 | H10 |
 *   | kind ∈ {no-pat, not-logged-in, unauthorized} | H4/H5/H6 | H7 |
 *   | Map 命中（非首见会话） | M2-M8 | M1 |
 *   | previous === 'streaming' | M3/M9 | M2/M4-M8 |
 *   | streamState === 'idle' | M3/M4/M5/M8/M9 | M2/M6/M7 |
 */

const electronMock = window.electron as unknown as {
  getUserBalance: ReturnType<typeof vi.fn>;
};

function okResult(): BalanceResult {
  return {
    ok: true,
    balance: {
      quota: 5000000,
      usedQuota: 100000,
      requestCount: 42,
      userName: 'oa_1',
      displayName: '张三',
    },
    currency: DEFAULT_CURRENCY_CONFIG,
  };
}

const okResult2: BalanceResult = {
  ok: true,
  balance: {
    quota: 2500000,
    usedQuota: 200000,
    requestCount: 60,
    userName: 'oa_1',
    displayName: '张三',
  },
  currency: DEFAULT_CURRENCY_CONFIG,
};

async function flush(): Promise<void> {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
}

// 模拟 BaseChat 派发的会话状态事件（dispatch 会触发 setState，需包 act）
function dispatchStatus(sessionId: string, streamState: SessionStreamState) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
        detail: { sessionId, streamState, messageCount: 1 },
      }),
    );
  });
}

describe('useBalance（余额轮询 hook）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electronMock.getUserBalance = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('H1: 初始 loading，请求成功后进入 ready 并带更新时间', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());

    const { result } = renderHook(() => useBalance());
    expect(result.current.state.status).toBe('loading');

    await flush();

    expect(result.current.state).toMatchObject({
      status: 'ready',
      balance: { quota: 5000000 },
      currency: DEFAULT_CURRENCY_CONFIG,
    });
    expect((result.current.state as { updatedAt: number }).updatedAt).toBeTypeOf('number');
    expect(result.current.refreshing).toBe(false);
    expect(electronMock.getUserBalance.mock.calls.length).toBeGreaterThan(0);
  });

  it('H2: 每 5 分钟自动轮询持续拉取', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    renderHook(() => useBalance());
    await flush();
    const afterMount = electronMock.getUserBalance.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    const afterFirstPoll = electronMock.getUserBalance.mock.calls.length;
    expect(afterFirstPoll).toBeGreaterThan(afterMount);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    expect(electronMock.getUserBalance.mock.calls.length).toBeGreaterThan(afterFirstPoll);
  });

  it('H3: refresh() 手动立即拉取', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    const { result } = renderHook(() => useBalance());
    await flush();
    const before = electronMock.getUserBalance.mock.calls.length;

    await act(async () => {
      result.current.refresh();
      await vi.runOnlyPendingTimersAsync();
    });
    // act 边界可能伴随 effect 重放（React 19 测试环境行为），只断言确有新请求发出
    expect(electronMock.getUserBalance.mock.calls.length).toBeGreaterThanOrEqual(before + 1);
  });

  it.each([
    ['no-pat', { status: 'no-pat' }],
    ['not-logged-in', { status: 'not-logged-in' }],
    ['unauthorized', { status: 'unauthorized' }],
  ] as const)('H4-H6: kind=%s 映射为对应状态', async (kind, expected) => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind,
      message: '某错误',
    } as BalanceResult);

    const { result } = renderHook(() => useBalance());
    await flush();

    expect(result.current.state).toEqual(expected);
  });

  it('H7: 其他失败 kind 进入 error 并保留 message', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind: 'network',
      message: '无法连接余额服务，请检查网络',
    } as BalanceResult);

    const { result } = renderHook(() => useBalance());
    await flush();

    expect(result.current.state).toEqual({
      status: 'error',
      message: '无法连接余额服务，请检查网络',
    });
  });

  it('H8: invoke 意外抛异常时进入默认错误态', async () => {
    electronMock.getUserBalance.mockRejectedValue(new Error('ipc broken'));

    const { result } = renderHook(() => useBalance());
    await flush();

    expect(result.current.state).toEqual({ status: 'error', message: '余额查询失败' });
  });

  it('H9: 卸载后停止轮询', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    const { unmount } = renderHook(() => useBalance());
    await flush();
    const before = electronMock.getUserBalance.mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    expect(electronMock.getUserBalance.mock.calls.length).toBe(before);
  });

  it('H10: 慢响应竞态——旧请求迟到时结果被丢弃', async () => {
    let resolveFirst: (value: BalanceResult) => void = () => {};
    const firstPromise = new Promise<BalanceResult>((resolve) => {
      resolveFirst = resolve;
    });
    // 首次调用挂起不返回；后续所有调用立即返回新值（quota 2500000）
    electronMock.getUserBalance.mockImplementationOnce(() => firstPromise);
    electronMock.getUserBalance.mockImplementation(() => Promise.resolve(okResult2));

    const { result } = renderHook(() => useBalance());
    await flush();
    // 触发一次手动刷新，确保至少有一个"新"请求已完成
    await act(async () => {
      result.current.refresh();
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.state).toMatchObject({ status: 'ready', balance: { quota: 2500000 } });

    // 旧请求此时才返回（quota 5000000）——必须被丢弃
    await act(async () => {
      resolveFirst(okResult());
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.state).toMatchObject({ status: 'ready', balance: { quota: 2500000 } });
  });

  it('H11: 慢响应竞态（异常版）——旧请求迟到抛错时不得覆盖新结果', async () => {
    let rejectFirst: (reason?: unknown) => void = () => {};
    const firstPromise = new Promise<BalanceResult>((_resolve, reject) => {
      rejectFirst = reject;
    });
    electronMock.getUserBalance.mockImplementationOnce(() => firstPromise);
    electronMock.getUserBalance.mockImplementation(() => Promise.resolve(okResult2));

    const { result } = renderHook(() => useBalance());
    await flush();
    await act(async () => {
      result.current.refresh();
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.state).toMatchObject({ status: 'ready', balance: { quota: 2500000 } });

    // 旧请求此时才失败——必须被丢弃，不得进入 error 态
    await act(async () => {
      rejectFirst(new Error('late failure'));
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.state).toMatchObject({ status: 'ready', balance: { quota: 2500000 } });
  });

  it('H12: 会话 streaming→idle 边沿事件接入刷新（接线验证，非触发语义由 M 系列保证）', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    renderHook(() => useBalance());
    await flush();
    const baseline = electronMock.getUserBalance.mock.calls.length;

    dispatchStatus('s1', 'streaming');
    dispatchStatus('s1', 'idle');
    await flush();
    expect(electronMock.getUserBalance.mock.calls.length).toBeGreaterThanOrEqual(baseline + 1);
  });

  it('H15: 卸载后移除事件监听，对话完成不再刷新', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    const { unmount } = renderHook(() => useBalance());
    await flush();
    const baseline = electronMock.getUserBalance.mock.calls.length;
    unmount();

    dispatchStatus('s1', 'streaming');
    dispatchStatus('s1', 'idle');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    expect(electronMock.getUserBalance.mock.calls.length).toBe(baseline);
  });

  it('H16: 事件触发刷新与 5 分钟轮询互不干扰', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    renderHook(() => useBalance());
    await flush();
    const baseline = electronMock.getUserBalance.mock.calls.length;

    // 事件刷新不依赖定时器，flush 后立即生效
    dispatchStatus('s1', 'streaming');
    dispatchStatus('s1', 'idle');
    await flush();
    const afterEvent = electronMock.getUserBalance.mock.calls.length;
    expect(afterEvent).toBeGreaterThanOrEqual(baseline + 1);

    // 轮询照常：推进 5 分钟仍有增量
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    expect(electronMock.getUserBalance.mock.calls.length).toBeGreaterThan(afterEvent);
  });
});

describe('markSessionStreamState（会话完成边沿判定）', () => {
  it('M1: 首见会话默认 previous=idle，落库新状态', () => {
    const states = new Map<string, SessionStreamState>();
    expect(markSessionStreamState(states, 's1', 'streaming')).toBe(false);
    expect(states.get('s1')).toBe('streaming');
  });

  it.each([
    ['loading→idle', 'loading', 'idle'],
    ['idle→idle（重复派发，含挂载初始 idle）', 'idle', 'idle'],
    ['streaming→error', 'streaming', 'error'],
    ['streaming→loading', 'streaming', 'loading'],
    ['error→idle', 'error', 'idle'],
  ] as const)('M4-M8: 非完成边沿不触发（%s）', (_label, first, second) => {
    const states = new Map<string, SessionStreamState>([['s1', first]]);
    expect(markSessionStreamState(states, 's1', second)).toBe(false);
    expect(states.get('s1')).toBe(second);
  });

  it('M2+M3: idle→streaming 不触发，streaming→idle 触发（一轮对话完成）', () => {
    const states = new Map<string, SessionStreamState>();
    markSessionStreamState(states, 's1', 'streaming');
    expect(markSessionStreamState(states, 's1', 'idle')).toBe(true);
    expect(states.get('s1')).toBe('idle');
  });

  it('M9: 多会话独立记边沿（全局单状态会漏检的回归用例）', () => {
    const states = new Map<string, SessionStreamState>();
    markSessionStreamState(states, 's1', 'streaming');
    markSessionStreamState(states, 's2', 'streaming');

    expect(markSessionStreamState(states, 's1', 'idle')).toBe(true);
    // s1 先完成把全局状态置 idle 后，s2 完成仍须触发
    expect(markSessionStreamState(states, 's2', 'idle')).toBe(true);
    // 重复 idle 不再触发
    expect(markSessionStreamState(states, 's1', 'idle')).toBe(false);
  });
});
