import { useEffect, useRef } from 'react';

import type { WechatPayOrderStatusValue } from '../recharge';

/**
 * @author logic
 * @date 2026-09-02
 * 微信支付订单状态轮询 hook：订单存在期间每 3s 查一次
 * window.electron.getWechatPayOrderStatus（网关在订单 pending 时会顺带向微信
 * 侧主动查询，前端只轮询本接口即可），直到终态（success/failed/expired）回调
 * onTerminal 后停止。临时失败（网络/超时/HTTP 等）静默继续；超过订单过期时间
 * 后留一小段宽限（让网关把 expired 终态带回来）再静默停止。
 * nowMs 注入便于单测控制时间。
 */

export const WECHAT_PAY_POLL_INTERVAL_MS = 3_000;
export const WECHAT_PAY_EXPIRY_GRACE_MS = 10_000;

const defaultNowMs = () => Date.now();

export interface UseWechatPayOrderStatusOptions {
  /** 商户订单号；null 表示当前无订单，不轮询 */
  tradeNo: string | null;
  /** 订单过期时间（unix 秒）；null 表示未知，仅靠终态停止 */
  expireAt: number | null;
  /** 终态回调；pending 不会触发 */
  onTerminal: (status: Exclude<WechatPayOrderStatusValue, 'pending'>) => void;
  intervalMs?: number;
  nowMs?: () => number;
}

export function useWechatPayOrderStatus({
  tradeNo,
  expireAt,
  onTerminal,
  intervalMs = WECHAT_PAY_POLL_INTERVAL_MS,
  nowMs = defaultNowMs,
}: UseWechatPayOrderStatusOptions): void {
  const onTerminalRef = useRef(onTerminal);
  useEffect(() => {
    onTerminalRef.current = onTerminal;
  });

  useEffect(() => {
    if (!tradeNo) {
      return;
    }
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const deadline = expireAt !== null ? expireAt * 1000 + WECHAT_PAY_EXPIRY_GRACE_MS : null;

    const poll = async () => {
      if (inFlight || cancelled || timer === undefined) {
        return;
      }
      if (deadline !== null && nowMs() >= deadline) {
        stop();
        return;
      }
      inFlight = true;
      try {
        const result = await window.electron.getWechatPayOrderStatus(tradeNo);
        if (cancelled) {
          return;
        }
        if (result.ok && result.status !== 'pending') {
          stop();
          onTerminalRef.current(result.status);
        }
      } catch {
        // IPC 层异常按临时失败处理，静默继续
      } finally {
        inFlight = false;
      }
    };

    timer = setInterval(poll, intervalMs);
    void poll();

    return () => {
      cancelled = true;
      stop();
    };
  }, [tradeNo, expireAt, intervalMs, nowMs]);
}
