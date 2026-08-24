import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { BalanceWidget } from './BalanceWidget';
import type { BalanceResult } from '../../balance';
import { DEFAULT_CURRENCY_CONFIG } from '../../quotaFormat';

/**
 * @author logic
 * @date 2026-08-24
 * BalanceWidget 组件单测：mock window.electron.getUserBalance，
 * IntlProvider locale=en 直接展示 defaultMessage。
 *
 * 路径分析（BalanceWidget，V(G)=6）：
 *   W1 ready（余额 + Tooltip 明细）/ W2 loading / W3 no-pat / W4 unauthorized /
 *   W5 error（提示 + message 详情）/ W6 not-logged-in 不渲染 / W7 点击刷新按钮再次拉取。
 */

const electronMock = window.electron as unknown as {
  getUserBalance: ReturnType<typeof vi.fn>;
};

// jsdom 缺少 ResizeObserver，Radix Tooltip 内容挂载时依赖它，补最小 stub
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

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

function renderWidget() {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <BalanceWidget />
    </IntlProvider>,
  );
}

describe('BalanceWidget（侧边栏余额组件）', () => {
  beforeEach(() => {
    electronMock.getUserBalance = vi.fn();
  });

  it('W1: ready 时显示格式化余额，悬浮展示已用/请求数/更新时间', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    renderWidget();

    const value = await screen.findByTestId('balance-value');
    // 5000000 quota / 500000 = $10（USD 默认配置）
    expect(value).toHaveTextContent('$10');

    await userEvent.hover(value);
    await waitFor(() => {
      // Radix 会同时渲染可见内容与无障碍隐藏副本，故用 getAllByText
      expect(screen.getAllByText(/Used: \$0\.2/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Requests: 42/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Updated /).length).toBeGreaterThan(0);
    });
  });

  it('W2: loading 时显示占位符', async () => {
    electronMock.getUserBalance.mockReturnValue(new Promise(() => {}));
    renderWidget();

    expect(screen.getByTestId('balance-loading')).toBeInTheDocument();
  });

  it('W3: no-pat 时显示重新登录提示', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind: 'no-pat',
      message: '请重新登录后查看余额',
    } as BalanceResult);
    renderWidget();

    expect(await screen.findByTestId('balance-hint')).toHaveTextContent(
      'Re-login to view balance',
    );
  });

  it('W4: unauthorized 时显示登录失效提示', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind: 'unauthorized',
      message: '登录已失效，请重新登录',
    } as BalanceResult);
    renderWidget();

    expect(await screen.findByTestId('balance-hint')).toHaveTextContent(
      'Login expired, please re-login',
    );
  });

  it('W5: 其他错误时显示加载失败提示，悬浮可见具体原因', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind: 'network',
      message: '无法连接余额服务，请检查网络',
    } as BalanceResult);
    renderWidget();

    const hint = await screen.findByTestId('balance-hint');
    expect(hint).toHaveTextContent('Balance load failed');

    await userEvent.hover(hint);
    await waitFor(() => {
      expect(screen.getAllByText(/无法连接余额服务，请检查网络/).length).toBeGreaterThan(0);
    });
  });

  it('W6: not-logged-in 时组件整体不渲染', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind: 'not-logged-in',
      message: '尚未登录',
    } as BalanceResult);
    renderWidget();

    await waitFor(() => {
      expect(screen.queryByTestId('balance-widget')).toBeNull();
    });
  });

  it('W7: 点击刷新按钮再次拉取余额', async () => {
    electronMock.getUserBalance.mockResolvedValue(okResult());
    renderWidget();
    await screen.findByTestId('balance-value');
    const callsAfterMount = electronMock.getUserBalance.mock.calls.length;

    await userEvent.click(screen.getByTestId('balance-refresh'));

    await waitFor(() => {
      expect(electronMock.getUserBalance.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
