import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  useWechatPayOrderStatus,
  WECHAT_PAY_EXPIRY_GRACE_MS,
} from './useWechatPayOrderStatus';
import type { WechatPayOrderStatusValue, WechatPayOrderStatusResult } from '../recharge';

/**
 * @author logic
 * @date 2026-09-02
 * 订单状态轮询 hook 单测：fake timers 驱动 3s 间隔与立即首查。
 *
 * 路径分析：无订单不轮询 / 立即首查 / pending 继续 / success/failed/expired 终态停轮询并回调 /
 *   失败（ok:false）静默继续 / 超过过期时间+宽限后静默停止 / 卸载停止。
 */

type StatusMock = ReturnType<typeof vi.fn>;

const electronMock = window.electron as unknown as {
  getWechatPayOrderStatus: StatusMock;
};

function statusResult(status: WechatPayOrderStatusValue): WechatPayOrderStatusResult {
  return { ok: true, status };
}

describe('useWechatPayOrderStatus（订单状态轮询）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electronMock.getWechatPayOrderStatus = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPolling(
    onTerminal: (status: 'success' | 'failed' | 'expired') => void,
    options: { tradeNo?: string | null; expireAt?: number | null; nowMs?: () => number } = {}
  ) {
    return renderHook(() =>
      useWechatPayOrderStatus({
        tradeNo: options.tradeNo === undefined ? 'T1' : options.tradeNo,
        expireAt: options.expireAt ?? null,
        onTerminal,
        nowMs: options.nowMs,
      })
    );
  }

  async function flush(millis = 0) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(millis);
    });
  }

  it('P1: 无订单（tradeNo=null）时不轮询', async () => {
    const onTerminal = vi.fn();
    renderPolling(onTerminal, { tradeNo: null });
    await flush(10_000);

    expect(electronMock.getWechatPayOrderStatus).not.toHaveBeenCalled();
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it('P2: 挂载后立即首查一次；pending 时按间隔继续轮询', async () => {
    electronMock.getWechatPayOrderStatus.mockResolvedValue(statusResult('pending'));
    const onTerminal = vi.fn();
    renderPolling(onTerminal);

    await flush(0);
    expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(1);

    await flush(3_000);
    expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(2);

    await flush(9_000);
    expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(5);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it.each(['success', 'failed', 'expired'] as const)(
    'P3: %s 终态停止轮询并回调 onTerminal',
    async (terminal) => {
      electronMock.getWechatPayOrderStatus.mockResolvedValue(statusResult(terminal));
      const onTerminal = vi.fn();
      renderPolling(onTerminal);

      await flush(0);
      expect(onTerminal).toHaveBeenCalledWith(terminal);

      await flush(12_000);
      expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(1);
    }
  );

  it('P4: 查询失败（ok:false）静默继续轮询', async () => {
    electronMock.getWechatPayOrderStatus.mockResolvedValue({
      ok: false,
      kind: 'network',
      message: '无法连接充值服务',
    });
    const onTerminal = vi.fn();
    renderPolling(onTerminal);

    await flush(6_000);
    expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(3);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it('P4b: IPC 层抛异常同样静默继续轮询', async () => {
    electronMock.getWechatPayOrderStatus.mockRejectedValue(new Error('ipc broken'));
    const onTerminal = vi.fn();
    renderPolling(onTerminal);

    await flush(3_000);
    expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(2);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it('P5: 超过过期时间+宽限后静默停止，不再轮询也不回调', async () => {
    electronMock.getWechatPayOrderStatus.mockResolvedValue(statusResult('pending'));
    const onTerminal = vi.fn();
    const expireAt = 1_000; // 秒
    let currentNow = 0;
    renderPolling(onTerminal, { expireAt, nowMs: () => currentNow });

    await flush(0);
    expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(1);

    // 推进到 deadline（expireAt*1000 + 宽限）之后，下一次触发直接停止
    currentNow = expireAt * 1000 + WECHAT_PAY_EXPIRY_GRACE_MS;
    await flush(3_000);
    expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(1);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it('P6: 卸载后停止轮询', async () => {
    electronMock.getWechatPayOrderStatus.mockResolvedValue(statusResult('pending'));
    const onTerminal = vi.fn();
    const { unmount } = renderPolling(onTerminal);

    await flush(0);
    unmount();

    await flush(9_000);
    expect(electronMock.getWechatPayOrderStatus).toHaveBeenCalledTimes(1);
    expect(onTerminal).not.toHaveBeenCalled();
  });
});
