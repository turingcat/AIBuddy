import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';

import { AppEvents } from '../../constants/events';
import { defineMessages, useIntl } from '../../i18n';
import { useWechatPayOrderStatus } from '../../hooks/useWechatPayOrderStatus';
import type { TopupInfo, WechatPayOrder } from '../../recharge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';

/**
 * @author logic
 * @date 2026-09-02
 * 应用内微信充值弹窗：监听 AppEvents.OPEN_RECHARGE_DIALOG 全局事件打开（入口在
 * 账户菜单/额度耗尽提示，App.tsx 挂载一份）。流程：拉取 topup/info 配置 →
 * 选金额（预设档位或自定义，正整数元）→ 主进程下单拿 code_url → 白底渲染二维码
 * + 过期倒计时，轮询订单状态；支付成功 toast + 广播余额刷新后关闭。
 * 微信充值未开通时展示说明，有 topup_link 则提供"网页充值"回退。
 */

const FALLBACK_AMOUNT_OPTIONS = [10, 30, 50, 100, 200, 500];

const i18n = defineMessages({
  title: { id: 'rechargeDialog.title', defaultMessage: 'Add credits' },
  description: {
    id: 'rechargeDialog.description',
    defaultMessage: 'Pay with WeChat to top up your account',
  },
  loading: { id: 'rechargeDialog.loading', defaultMessage: 'Loading payment options…' },
  loadFailed: {
    id: 'rechargeDialog.loadFailed',
    defaultMessage: 'Failed to load payment options',
  },
  retry: { id: 'rechargeDialog.retry', defaultMessage: 'Retry' },
  notEnabled: {
    id: 'rechargeDialog.notEnabled',
    defaultMessage: 'In-app top-up is not available on this site yet',
  },
  openWebTopup: { id: 'rechargeDialog.openWebTopup', defaultMessage: 'Top up in browser' },
  selectAmount: { id: 'rechargeDialog.selectAmount', defaultMessage: 'Select amount (CNY)' },
  customAmount: {
    id: 'rechargeDialog.customAmount',
    defaultMessage: 'Custom amount (whole CNY)',
  },
  minHint: { id: 'rechargeDialog.minHint', defaultMessage: 'Minimum {amount} CNY' },
  payButton: { id: 'rechargeDialog.payButton', defaultMessage: 'WeChat Pay ¥{amount}' },
  scanHint: { id: 'rechargeDialog.scanHint', defaultMessage: 'Scan with WeChat to pay' },
  payAmount: { id: 'rechargeDialog.payAmount', defaultMessage: 'Pay ¥{amount}' },
  expiresIn: { id: 'rechargeDialog.expiresIn', defaultMessage: 'Expires in {time}' },
  expired: { id: 'rechargeDialog.expired', defaultMessage: 'QR code expired' },
  qrNote: {
    id: 'rechargeDialog.qrNote',
    defaultMessage:
      'Closing this dialog will not cancel the order; it stays payable until expiry',
  },
  backToAmount: { id: 'rechargeDialog.backToAmount', defaultMessage: 'Change amount' },
  success: { id: 'rechargeDialog.success', defaultMessage: 'Payment successful' },
  payFailed: {
    id: 'rechargeDialog.payFailed',
    defaultMessage: 'Payment failed, please try again',
  },
  orderExpired: {
    id: 'rechargeDialog.orderExpired',
    defaultMessage: 'Order expired, please place a new one',
  },
  unauthorized: {
    id: 'rechargeDialog.unauthorized',
    defaultMessage: 'Login expired, please re-login',
  },
  createFailed: { id: 'rechargeDialog.createFailed', defaultMessage: 'Failed to create order' },
});

type TopupInfoState =
  | { status: 'loading' }
  | { status: 'ready'; info: TopupInfo }
  | { status: 'error'; message: string };

/** 预设档位：服务端 amount_options 过滤掉低于微信最低充值的部分，为空时回退默认档位 */
export function resolvePresetAmounts(amountOptions: number[], wechatMinTopup: number): number[] {
  const filtered = amountOptions.filter((option) => option >= wechatMinTopup);
  return filtered.length > 0 ? filtered : FALLBACK_AMOUNT_OPTIONS;
}

/** 自定义金额：非负整数字符串且 ≥ 最低充值时返回数值，否则 null */
export function parseCustomAmount(input: string, wechatMinTopup: number): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number.parseInt(trimmed, 10);
  return value >= wechatMinTopup ? value : null;
}

/** 倒计时展示：≥1h 用 H:MM:SS，否则 MM:SS */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const twoDigits = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

function RechargeAmountStage({
  info,
  onOrderCreated,
}: {
  info: TopupInfo;
  onOrderCreated: (order: WechatPayOrder, amount: number) => void;
}) {
  const intl = useIntl();
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [creating, setCreating] = useState(false);

  const presets = useMemo(
    () => resolvePresetAmounts(info.amountOptions, info.wechatMinTopup),
    [info.amountOptions, info.wechatMinTopup]
  );
  const customAmount = parseCustomAmount(customInput, info.wechatMinTopup);
  const effectiveAmount = customAmount ?? selectedPreset;

  const handleCreateOrder = async () => {
    if (effectiveAmount === null || creating) {
      return;
    }
    setCreating(true);
    try {
      const result = await window.electron.createWechatPayOrder(effectiveAmount);
      if (result.ok) {
        onOrderCreated(result.order, effectiveAmount);
        return;
      }
      if (result.kind === 'unauthorized') {
        toast.error(intl.formatMessage(i18n.unauthorized));
      } else {
        toast.error(result.message || intl.formatMessage(i18n.createFailed));
      }
    } catch {
      toast.error(intl.formatMessage(i18n.createFailed));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="recharge-amount-stage">
      <div>
        <div className="mb-2 text-sm font-medium">
          {intl.formatMessage(i18n.selectAmount)}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setSelectedPreset(preset);
                setCustomInput('');
              }}
              className={
                selectedPreset === preset && customAmount === null
                  ? 'h-10 rounded-md border-2 border-border-inverse bg-background-secondary font-mono text-sm'
                  : 'h-10 rounded-md border bg-background-primary font-mono text-sm hover:border-border-secondary hover:bg-background-secondary/60'
              }
              data-testid="recharge-preset"
            >
              ¥{preset}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          inputMode="numeric"
          placeholder={intl.formatMessage(i18n.customAmount)}
          value={customInput}
          onChange={(event) => setCustomInput(event.target.value)}
          data-testid="recharge-custom-amount"
        />
        <div className="text-xs text-text-secondary">
          {intl.formatMessage(i18n.minHint, { amount: info.wechatMinTopup })}
        </div>
      </div>
      <Button
        disabled={effectiveAmount === null || creating}
        onClick={handleCreateOrder}
        data-testid="recharge-pay-button"
      >
        {intl.formatMessage(i18n.payButton, { amount: effectiveAmount ?? '' })}
      </Button>
    </div>
  );
}

function WechatPayQrStage({
  order,
  amount,
  onTerminal,
  onBack,
}: {
  order: WechatPayOrder;
  amount: number;
  onTerminal: (status: 'success' | 'failed' | 'expired') => void;
  onBack: () => void;
}) {
  const intl = useIntl();
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(timer);
  }, []);

  useWechatPayOrderStatus({
    tradeNo: order.tradeNo,
    expireAt: order.expireAt,
    onTerminal,
  });

  const remainingSeconds = Math.max(0, order.expireAt - nowSeconds);

  return (
    <div className="flex flex-col items-center gap-4" data-testid="recharge-qr-stage">
      <div className="rounded-lg bg-white p-4">
        <QRCodeSVG value={order.codeUrl} size={200} />
      </div>
      <div className="text-sm font-medium">{intl.formatMessage(i18n.scanHint)}</div>
      <div className="font-mono text-lg font-semibold" data-testid="recharge-qr-amount">
        {intl.formatMessage(i18n.payAmount, { amount })}
      </div>
      <div className="text-xs text-text-secondary" data-testid="recharge-qr-countdown">
        {remainingSeconds > 0
          ? intl.formatMessage(i18n.expiresIn, { time: formatCountdown(remainingSeconds) })
          : intl.formatMessage(i18n.expired)}
      </div>
      <div className="text-center text-xs text-text-tertiary">
        {intl.formatMessage(i18n.qrNote)}
      </div>
      <Button variant="outline" size="sm" onClick={onBack} data-testid="recharge-back-button">
        {intl.formatMessage(i18n.backToAmount)}
      </Button>
    </div>
  );
}

export function RechargeDialog() {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [infoState, setInfoState] = useState<TopupInfoState>({ status: 'loading' });
  const [order, setOrder] = useState<WechatPayOrder | null>(null);
  const [orderAmount, setOrderAmount] = useState<number | null>(null);

  const loadInfo = useCallback(async () => {
    setInfoState({ status: 'loading' });
    try {
      const result = await window.electron.getTopupInfo();
      setInfoState(
        result.ok ? { status: 'ready', info: result.info } : { status: 'error', message: result.message }
      );
    } catch {
      setInfoState({ status: 'error', message: intl.formatMessage(i18n.loadFailed) });
    }
  }, [intl]);

  useEffect(() => {
    const handleOpenRecharge = () => setOpen(true);
    window.addEventListener(AppEvents.OPEN_RECHARGE_DIALOG, handleOpenRecharge);
    return () => window.removeEventListener(AppEvents.OPEN_RECHARGE_DIALOG, handleOpenRecharge);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOrder(null);
    setOrderAmount(null);
    void loadInfo();
  }, [open, loadInfo]);

  const handleTerminal = useCallback(
    (status: 'success' | 'failed' | 'expired') => {
      if (status === 'success') {
        toast.success(intl.formatMessage(i18n.success));
        window.dispatchEvent(new CustomEvent(AppEvents.BALANCE_REFRESH_REQUESTED));
        setOpen(false);
        return;
      }
      toast.error(
        status === 'failed' ? intl.formatMessage(i18n.payFailed) : intl.formatMessage(i18n.orderExpired)
      );
      setOrder(null);
      setOrderAmount(null);
    },
    [intl]
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setOrder(null);
      setOrderAmount(null);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(i18n.title)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(i18n.description)}</DialogDescription>
        </DialogHeader>
        {infoState.status === 'loading' ? (
          <div className="py-8 text-center text-sm text-text-secondary" data-testid="recharge-loading">
            {intl.formatMessage(i18n.loading)}
          </div>
        ) : infoState.status === 'error' ? (
          <div className="flex flex-col items-center gap-3 py-6" data-testid="recharge-error">
            <div className="text-sm text-text-secondary">{infoState.message}</div>
            <Button variant="outline" size="sm" onClick={loadInfo}>
              {intl.formatMessage(i18n.retry)}
            </Button>
          </div>
        ) : !infoState.info.enableWechatTopup ? (
          <div className="flex flex-col items-center gap-3 py-6" data-testid="recharge-not-enabled">
            <div className="text-sm text-text-secondary">
              {intl.formatMessage(i18n.notEnabled)}
            </div>
            {infoState.info.topupLink ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.electron.openExternal(infoState.info.topupLink!)}
                data-testid="recharge-web-topup"
              >
                {intl.formatMessage(i18n.openWebTopup)}
              </Button>
            ) : null}
          </div>
        ) : order && orderAmount !== null ? (
          <WechatPayQrStage
            order={order}
            amount={orderAmount}
            onTerminal={handleTerminal}
            onBack={() => {
              setOrder(null);
              setOrderAmount(null);
            }}
          />
        ) : (
          <RechargeAmountStage
            info={infoState.info}
            onOrderCreated={(created, amount) => {
              setOrder(created);
              setOrderAmount(amount);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
