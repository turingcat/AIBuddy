import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  'balanceWidget.refresh': '刷新余额',
};

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
  });

  it('prefers the display name in the bottom account trigger', () => {
    mockBalanceState({
      status: 'ready',
      balance: {
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
    expect(screen.getByRole('menu')).toHaveAttribute('data-side', 'top');
  });

  it('places the account name, balance, and refresh button in one summary row', async () => {
    mockBalanceState({
      status: 'ready',
      balance: {
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
    expect(within(summary).getByRole('button', { name: '刷新余额' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '刷新余额' })).toBeNull();
  });

  it('refreshes from the summary icon without closing the account menu', async () => {
    mockBalanceState({ status: 'loading' }, true);
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /未登录用户/ }));
    const refreshButton = screen.getByRole('button', { name: '刷新余额' });
    expect(refreshButton.querySelector('svg')).toHaveClass('animate-spin');
    await userEvent.click(refreshButton);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
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
