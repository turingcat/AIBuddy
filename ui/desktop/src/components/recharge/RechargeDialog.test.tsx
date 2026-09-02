import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { toast } from 'react-toastify';

import {
  formatCountdown,
  parseCustomAmount,
  RechargeDialog,
  resolvePresetAmounts,
} from './RechargeDialog';
import { AppEvents } from '../../constants/events';
import type { TopupInfo, TopupInfoResult, WechatPayOrderResult } from '../../recharge';

/**
 * @author logic
 * @date 2026-09-02
 * 充值弹窗组件单测：mock window.electron 三个 IPC 与 react-toastify。
 *
 * 路径分析（纯函数）：resolvePresetAmounts 过滤/回退、parseCustomAmount 各分支、
 *   formatCountdown 时/分/秒与 0/负数。
 * 路径分析（组件）：默认关闭 / 事件打开 / loading→ready / 未开通（含网页充值回退）/
 *   配置失败重试 / 预设与自定义金额校验 / 下单成功进入二维码阶段 /
 *   下单业务失败 toast / 终态 success 关闭+余额刷新 / 终态 failed 返回金额阶段。
 */

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const electronMock = window.electron as unknown as {
  getTopupInfo: ReturnType<typeof vi.fn>;
  createWechatPayOrder: ReturnType<typeof vi.fn>;
  getWechatPayOrderStatus: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
};

function topupInfoResult(info: TopupInfo = {
  enableWechatTopup: true,
  wechatMinTopup: 5,
  amountOptions: [10, 30, 50, 100],
  topupLink: null,
}): TopupInfoResult {
  return { ok: true, info };
}

function orderResult(): WechatPayOrderResult {
  return {
    ok: true,
    order: {
      codeUrl: 'weixin://wxpay/bitgenerate?pr=test',
      tradeNo: 'USR1NO123',
      expireAt: Math.floor(Date.now() / 1000) + 7_200,
    },
  };
}

function renderDialog() {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <RechargeDialog />
    </IntlProvider>
  );
}

function openDialog() {
  act(() => {
    window.dispatchEvent(new CustomEvent(AppEvents.OPEN_RECHARGE_DIALOG));
  });
}

async function openReadyDialog(infoResult: TopupInfoResult = topupInfoResult()) {
  electronMock.getTopupInfo.mockResolvedValue(infoResult);
  renderDialog();
  openDialog();
  await screen.findByTestId('recharge-amount-stage');
}

async function createOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByTestId('recharge-preset')[0]);
  await user.click(screen.getByTestId('recharge-pay-button'));
}

describe('纯函数', () => {
  it('resolvePresetAmounts: 过滤低于微信最低充值的档位；为空或全被过滤时回退默认档位', () => {
    expect(resolvePresetAmounts([10, 30, 3, 100], 5)).toEqual([10, 30, 100]);
    expect(resolvePresetAmounts([], 1)).toEqual([10, 30, 50, 100, 200, 500]);
    expect(resolvePresetAmounts([1, 2], 5)).toEqual([10, 30, 50, 100, 200, 500]);
  });

  it('parseCustomAmount: 正整数字符串过、非整数/空/低于最低不过', () => {
    expect(parseCustomAmount('10', 5)).toBe(10);
    expect(parseCustomAmount(' 10 ', 5)).toBe(10);
    expect(parseCustomAmount('abc', 5)).toBeNull();
    expect(parseCustomAmount('', 5)).toBeNull();
    expect(parseCustomAmount('9.5', 5)).toBeNull();
    expect(parseCustomAmount('-5', 5)).toBeNull();
    expect(parseCustomAmount('4', 5)).toBeNull();
    expect(parseCustomAmount('5', 5)).toBe(5);
  });

  it('formatCountdown: 不足一小时 MM:SS，超过一小时 H:MM:SS，0 与负数钳到 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-30)).toBe('00:00');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(3_599)).toBe('59:59');
    expect(formatCountdown(3_600)).toBe('1:00:00');
    expect(formatCountdown(7_325)).toBe('2:02:05');
  });
});

describe('RechargeDialog（充值弹窗）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMock.getTopupInfo = vi.fn();
    electronMock.createWechatPayOrder = vi.fn();
    electronMock.getWechatPayOrderStatus = vi.fn();
    electronMock.openExternal = vi.fn();
  });

  it('R1: 默认不渲染弹窗内容', () => {
    renderDialog();

    expect(document.querySelector('[data-testid="recharge-amount-stage"]')).toBeNull();
    expect(electronMock.getTopupInfo).not.toHaveBeenCalled();
  });

  it('R2: OPEN_RECHARGE_DIALOG 事件打开弹窗：loading → ready 渲染预设档位', async () => {
    await openReadyDialog();

    expect(screen.getAllByTestId('recharge-preset').length).toBe(4);
    expect(screen.getByTestId('recharge-custom-amount')).toBeInTheDocument();
    expect(screen.getByTestId('recharge-pay-button')).toBeDisabled();
    expect(screen.getByText('Minimum 5 CNY')).toBeInTheDocument();
  });

  it('R3: 预设档位来自服务端时过滤展示；无档位时回退默认六档', async () => {
    const user = userEvent.setup();
    await openReadyDialog();
    expect(screen.getAllByTestId('recharge-preset').length).toBe(4);

    // 关闭后重新打开：服务端未配置档位
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByTestId('recharge-amount-stage')).toBeNull();
    });

    electronMock.getTopupInfo.mockResolvedValue(
      topupInfoResult({ enableWechatTopup: true, wechatMinTopup: 1, amountOptions: [], topupLink: null })
    );
    openDialog();
    await waitFor(() => {
      expect(screen.getAllByTestId('recharge-preset').length).toBe(6);
    });
  });

  it('R4: 选预设后支付按钮可用，下单成功进入二维码阶段', async () => {
    const user = userEvent.setup();
    electronMock.getTopupInfo.mockResolvedValue(topupInfoResult());
    electronMock.createWechatPayOrder.mockResolvedValue(orderResult());
    electronMock.getWechatPayOrderStatus.mockResolvedValue({ ok: true, status: 'pending' });
    renderDialog();
    openDialog();
    await screen.findByTestId('recharge-amount-stage');

    await createOrder(user);

    expect(electronMock.createWechatPayOrder).toHaveBeenCalledWith(10);
    const qrStage = await screen.findByTestId('recharge-qr-stage');
    expect(qrStage.querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('recharge-qr-amount')).toHaveTextContent('Pay ¥10');
    expect(screen.getByTestId('recharge-back-button')).toBeInTheDocument();
  });

  it('R5: 自定义金额低于最低充值时不可支付；合法时按自定义金额下单', async () => {
    const user = userEvent.setup();
    await openReadyDialog();

    await user.type(screen.getByTestId('recharge-custom-amount'), '3');
    expect(screen.getByTestId('recharge-pay-button')).toBeDisabled();

    await user.clear(screen.getByTestId('recharge-custom-amount'));
    electronMock.createWechatPayOrder.mockResolvedValue(orderResult());
    electronMock.getWechatPayOrderStatus.mockResolvedValue({ ok: true, status: 'pending' });
    await user.type(screen.getByTestId('recharge-custom-amount'), '20');
    expect(screen.getByTestId('recharge-pay-button')).toHaveTextContent('WeChat Pay ¥20');

    await user.click(screen.getByTestId('recharge-pay-button'));
    expect(electronMock.createWechatPayOrder).toHaveBeenCalledWith(20);
    await screen.findByTestId('recharge-qr-stage');
  });

  it('R6: 下单业务失败时 toast 错误并停留在金额阶段', async () => {
    const user = userEvent.setup();
    await openReadyDialog();

    electronMock.createWechatPayOrder.mockResolvedValue({
      ok: false,
      kind: 'business',
      message: '充值金额低于最低限制',
    });
    await user.click(screen.getAllByTestId('recharge-preset')[1]);
    await user.click(screen.getByTestId('recharge-pay-button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('充值金额低于最低限制');
    });
    expect(screen.getByTestId('recharge-amount-stage')).toBeInTheDocument();
  });

  it('R7: 微信充值未开通时展示说明；有 topup_link 时提供网页充值回退', async () => {
    electronMock.getTopupInfo.mockResolvedValue(
      topupInfoResult({
        enableWechatTopup: false,
        wechatMinTopup: 1,
        amountOptions: [],
        topupLink: 'https://example.com/topup',
      })
    );
    renderDialog();
    openDialog();

    expect(await screen.findByTestId('recharge-not-enabled')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId('recharge-web-topup'));
    expect(electronMock.openExternal).toHaveBeenCalledWith('https://example.com/topup');
  });

  it('R8: 配置获取失败时展示错误与重试；重试成功恢复金额阶段', async () => {
    const user = userEvent.setup();
    electronMock.getTopupInfo.mockResolvedValueOnce({
      ok: false,
      kind: 'http',
      message: '充值服务不可用（HTTP 502）',
    });
    renderDialog();
    openDialog();

    expect(await screen.findByTestId('recharge-error')).toHaveTextContent('HTTP 502');

    electronMock.getTopupInfo.mockResolvedValueOnce(topupInfoResult());
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByTestId('recharge-amount-stage');
  });

  it('R9: 轮询到 success 终态：toast 成功、广播余额刷新并关闭弹窗', async () => {
    const user = userEvent.setup();
    electronMock.getTopupInfo.mockResolvedValue(topupInfoResult());
    electronMock.createWechatPayOrder.mockResolvedValue(orderResult());
    electronMock.getWechatPayOrderStatus.mockResolvedValue({ ok: true, status: 'success' });
    renderDialog();
    openDialog();
    await screen.findByTestId('recharge-amount-stage');

    const refreshListener = vi.fn();
    window.addEventListener(AppEvents.BALANCE_REFRESH_REQUESTED, refreshListener);

    await createOrder(user);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Payment successful');
    });
    expect(refreshListener).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('recharge-qr-stage')).toBeNull();
    });
    window.removeEventListener(AppEvents.BALANCE_REFRESH_REQUESTED, refreshListener);
  });

  it('R10: 轮询到 failed 终态：toast 失败并返回金额阶段', async () => {
    const user = userEvent.setup();
    electronMock.getTopupInfo.mockResolvedValue(topupInfoResult());
    electronMock.createWechatPayOrder.mockResolvedValue(orderResult());
    electronMock.getWechatPayOrderStatus.mockResolvedValue({ ok: true, status: 'failed' });
    renderDialog();
    openDialog();
    await screen.findByTestId('recharge-amount-stage');

    await createOrder(user);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Payment failed, please try again');
    });
    await screen.findByTestId('recharge-amount-stage');
  });

  it('R11: 二维码阶段点击返回重选金额回到金额阶段', async () => {
    const user = userEvent.setup();
    electronMock.getTopupInfo.mockResolvedValue(topupInfoResult());
    electronMock.createWechatPayOrder.mockResolvedValue(orderResult());
    electronMock.getWechatPayOrderStatus.mockResolvedValue({ ok: true, status: 'pending' });
    renderDialog();
    openDialog();
    await screen.findByTestId('recharge-amount-stage');

    await createOrder(user);
    await screen.findByTestId('recharge-qr-stage');

    await user.click(screen.getByTestId('recharge-back-button'));
    await screen.findByTestId('recharge-amount-stage');
  });
});
