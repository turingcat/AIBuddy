import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
};

function mockBalanceState(state: BalanceState) {
  mockUseBalance.mockReturnValue({ state, refreshing: false, refresh: mockRefresh });
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

  it('opens Settings from the account menu', async () => {
    mockBalanceState({ status: 'loading' });
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /未登录用户/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '设置' }));

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('refreshes the balance when selected with the keyboard', async () => {
    const user = userEvent.setup();
    mockBalanceState({ status: 'loading' });
    renderMenu();

    await user.click(screen.getByRole('button', { name: /未登录用户/ }));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('invokes the shared logout action from the account menu', async () => {
    mockBalanceState({ status: 'loading' });
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /未登录用户/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
