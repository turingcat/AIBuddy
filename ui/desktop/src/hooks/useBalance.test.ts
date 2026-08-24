import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useBalance } from './useBalance';
import type { BalanceResult } from '../balance';
import { DEFAULT_CURRENCY_CONFIG } from '../quotaFormat';

/**
 * @author logic
 * @date 2026-08-24
 * useBalance hook 单测：fake timers + mock window.electron.getUserBalance。
 * 说明：React 19 的 act 环境会在每个 act 边界重放 effect（挂载后可能多次拉取），
 * 因此断言采用调用数增量与状态契约，不依赖挂载期的绝对调用次数。
 *
 * 路径分析（useBalance，V(G)=7）：
 *   H1 loading→ready / H2 定时轮询持续拉取 / H3 手动 refresh /
 *   H4 no-pat / H5 not-logged-in / H6 unauthorized / H7 其他错误 message /
 *   H8 invoke 意外抛异常 / H9 卸载后停止轮询 / H10 慢响应竞态丢弃旧结果。
 * 条件矩阵：
 *   | 原子条件 | 取真用例 | 取假用例 |
 *   | result.ok | H1 | H4-H7 |
 *   | seq === seqRef.current（非竞态） | H1-H8 | H10 |
 *   | kind ∈ {no-pat, not-logged-in, unauthorized} | H4/H5/H6 | H7 |
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
});
