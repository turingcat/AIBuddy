import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { UserAccountMenu } from './UserAccountMenu';
import { useBalance, type BalanceState } from '../../hooks/useBalance';
import { DEFAULT_CURRENCY_CONFIG } from '../../quotaFormat';

vi.mock('../../hooks/useBalance', () => ({ useBalance: vi.fn() }));

const mockUseBalance = vi.mocked(useBalance);
const mockOpenSettings = vi.fn();
const mockLogout = vi.fn();
const mockRefresh = vi.fn();

const messages = {
  'accountMenu.notLoggedIn': '未登录用户',
  'accountMenu.settings': '设置',
  'accountMenu.logout': '退出登录',
  'accountMenu.currentBalance': '当前余额',
  'accountMenu.dailyRemaining': '每日剩余',
  'accountMenu.weeklyRemaining': '每周剩余',
  'accountMenu.monthlyRemaining': '每月剩余',
  'accountMenu.recharge': '充值',
  'balanceWidget.refresh': '刷新余额',
};

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

function mockBalanceState(state: BalanceState, refreshing = false) {
  mockUseBalance.mockReturnValue({ state, refreshing, refresh: mockRefresh });
}

function renderMenu() {
  return render(
    <IntlProvider locale="zh-CN" messages={messages}>
      <UserAccountMenu onOpenSettings={mockOpenSettings} onLogout={mockLogout} />
    </IntlProvider>
  );
}

describe('UserAccountMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_EDITION', 'heybuddy');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the display name in the bottom account trigger', () => {
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: '林也',
        userName: 'linye',
        quota: 1_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });

    renderMenu();

    expect(screen.getByRole('button', { name: /林也/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^linye/ })).toBeNull();
  });

  it('falls back to the login name when display name is empty', async () => {
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: '',
        userName: 'linye',
        quota: 1_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });

    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /linye/ }));

    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('退出登录')).toBeInTheDocument();
  });

  it('uses the signed-out placeholder when both account names are empty', () => {
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: '',
        userName: '',
        quota: 1_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });

    renderMenu();

    expect(screen.getByRole('button', { name: /未登录用户/ })).toBeInTheDocument();
  });

  it('keeps the signed-out fallback free of a stale balance error', () => {
    mockBalanceState({ status: 'not-logged-in' });

    renderMenu();

    expect(screen.getByRole('button', { name: /未登录用户/ })).toBeInTheDocument();
    expect(screen.queryByTestId('balance-hint')).toBeNull();
  });

  it('opens upward with the formatted balance in its header', async () => {
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: '林也',
        userName: 'linye',
        quota: 5_000_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });

    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /林也/ }));

    expect(screen.getAllByText('$10').length).toBeGreaterThan(0);
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('data-side', 'top');
    expect(menu).toHaveClass('w-[var(--radix-dropdown-menu-trigger-width)]');
    expect(menu).toHaveClass('min-w-0');
    expect(menu).not.toHaveClass('w-64');
  });

  it('places the account name, balance, and refresh menu item in one summary row', async () => {
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: '林也',
        userName: 'linye',
        quota: 5_000_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /林也/ }));

    const summary = screen.getByTestId('account-menu-summary');
    expect(within(summary).getByText('林也')).toBeInTheDocument();
    expect(within(summary).getByTestId('balance-value')).toBeInTheDocument();
    expect(within(summary).getByRole('menuitem', { name: '刷新余额' })).toBeInTheDocument();
  });

  it('dispatches the recharge dialog event from the summary icon and the menu item after the menu closes', async () => {
    const listener = vi.fn();
    window.addEventListener('open-recharge-dialog', listener);
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: '林也',
        userName: 'linye',
        quota: 5_000_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });

    try {
      // 摘要行充值图标：菜单随选择关闭，弹窗事件延迟一拍派发
      const user = userEvent.setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /林也/ }));
      await user.click(screen.getByTestId('account-menu-recharge'));

      await waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBeNull();
      });

      // 菜单项"充值"：同样先关菜单再派发事件
      await user.click(screen.getByRole('button', { name: /林也/ }));
      await user.click(screen.getByTestId('account-menu-recharge-item'));

      await waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBeNull();
      });
    } finally {
      window.removeEventListener('open-recharge-dialog', listener);
    }
  });

  it('refreshes from the summary with keyboard navigation without closing the account menu', async () => {
    const user = userEvent.setup();
    mockBalanceState({ status: 'loading' }, true);
    renderMenu();

    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{ArrowUp}');

    const refreshItem = screen.getByRole('menuitem', { name: '刷新余额' });
    expect(refreshItem).toHaveFocus();
    expect(refreshItem.querySelector('svg')).toHaveClass('animate-spin');
    await user.keyboard('{Enter}');

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('keeps the HeyBuddy trigger balance summary', () => {
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: '林也',
        userName: 'linye',
        quota: 5_000_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });

    renderMenu();

    expect(screen.getByRole('button', { name: /林也/ })).toContainElement(
      screen.getByTestId('balance-value')
    );
  });

  it.each([
    [{ status: 'loading' } satisfies BalanceState, 'balance-loading'],
    [{ status: 'unauthorized' } satisfies BalanceState, 'balance-hint'],
    [{ status: 'error', message: 'connection refused' } satisfies BalanceState, 'balance-hint'],
  ])('keeps the %s state visible in the popup', async (state, testId) => {
    mockBalanceState(state);

    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: '未登录用户' }));

    expect(within(screen.getByRole('menu')).getByTestId(testId)).toBeInTheDocument();
  });

  it('shows the localized refresh tooltip on summary icon hover', async () => {
    const user = userEvent.setup();
    mockBalanceState({ status: 'loading' });
    renderMenu();

    await user.click(screen.getByRole('button', { name: /未登录用户/ }));
    await user.hover(screen.getByRole('menuitem', { name: '刷新余额' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('刷新余额');
  });

  it('opens Settings from the account menu', async () => {
    mockBalanceState({ status: 'loading' });
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /未登录用户/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '设置' }));

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('invokes the shared logout action from the account menu', async () => {
    mockBalanceState({ status: 'loading' });
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /未登录用户/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
