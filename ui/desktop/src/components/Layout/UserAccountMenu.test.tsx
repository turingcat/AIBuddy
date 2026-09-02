import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  'accountMenu.currentBalance': '当前余额',
  'accountMenu.dailyRemaining': '每日剩余',
  'accountMenu.weeklyRemaining': '每周剩余',
  'accountMenu.monthlyRemaining': '每月剩余',
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
    expect(within(summary).getByTestId('aibuddy-entitlement-row')).toHaveTextContent('$10');
    expect(within(summary).getByRole('menuitem', { name: '刷新余额' })).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: /林也/ })).not.toContainElement(
      screen.queryByTestId('balance-value')
    );
  });

  it('renders an AIBuddy username-only trigger with the full name available', () => {
    const accountName = 'aibuddy-account-with-a-name-too-long-for-the-sidebar';
    vi.stubEnv('APP_EDITION', 'aibuddy');
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: accountName,
        userName: 'aibuddy',
        quota: 5_000_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });

    renderMenu();

    expect(screen.getByRole('button', { name: accountName })).toBeInTheDocument();
    expect(screen.getByTitle(accountName)).toHaveClass('truncate');
    expect(screen.queryByTestId('balance-value')).toBeNull();
    expect(screen.queryByText('$10')).toBeNull();
  });

  it('renders the AIBuddy metered balance as its own entitlement row', async () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'balance',
        displayName: 'AIBuddy user',
        userName: 'aibuddy',
        quota: 5_000_000,
        usedQuota: 0,
        requestCount: 1,
      },
      currency: DEFAULT_CURRENCY_CONFIG,
      updatedAt: Date.now(),
    });

    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'AIBuddy user' }));

    const summary = screen.getByTestId('account-menu-summary');
    expect(within(summary).getByText('AIBuddy user')).toHaveClass('block');
    const rows = within(summary).getAllByTestId('aibuddy-entitlement-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('当前余额')).toBeInTheDocument();
    expect(within(rows[0]).getByText('$10')).toBeInTheDocument();
  });

  it('renders only configured AIBuddy subscription entitlement periods', async () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');
    mockBalanceState({
      status: 'ready',
      balance: {
        kind: 'subscription',
        displayName: 'AIBuddy subscriber',
        userName: 'aibuddy',
        groupName: 'TFlow Pro',
        remainingUSD: { daily: 37.5, monthly: 100 },
      },
      currency: { ...DEFAULT_CURRENCY_CONFIG, quotaPerUnit: 1 },
      updatedAt: Date.now(),
    });

    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'AIBuddy subscriber' }));

    const summary = screen.getByTestId('account-menu-summary');
    const rows = within(summary).getAllByTestId('aibuddy-entitlement-row');
    expect(rows).toHaveLength(2);
    expect(within(summary).getByText('每日剩余')).toBeInTheDocument();
    expect(within(summary).getByText('每月剩余')).toBeInTheDocument();
    expect(within(summary).queryByText('每周剩余')).toBeNull();
    expect(within(summary).getByText('$37.5')).toBeInTheDocument();
    expect(within(summary).getByText('$100')).toBeInTheDocument();
  });

  it('keeps AIBuddy refresh, settings, and logout actions operable', async () => {
    const user = userEvent.setup();
    vi.stubEnv('APP_EDITION', 'aibuddy');
    mockBalanceState({ status: 'loading' }, true);

    const firstMenu = renderMenu();
    await user.click(screen.getByRole('button', { name: '未登录用户' }));

    const refresh = screen.getByRole('menuitem', { name: '刷新余额' });
    expect(refresh.querySelector('svg')).toHaveClass('animate-spin');
    await user.click(refresh);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: '设置' }));
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);

    firstMenu.unmount();
    renderMenu();
    await user.click(screen.getByRole('button', { name: '未登录用户' }));
    await user.click(screen.getByRole('menuitem', { name: '退出登录' }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ status: 'loading' } satisfies BalanceState, 'balance-loading'],
    [{ status: 'unauthorized' } satisfies BalanceState, 'balance-hint'],
    [{ status: 'error', message: 'connection refused' } satisfies BalanceState, 'balance-hint'],
  ])('keeps AIBuddy %s state visible in the popup', async (state, testId) => {
    vi.stubEnv('APP_EDITION', 'aibuddy');
    mockBalanceState(state);

    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: '未登录用户' }));

    expect(screen.getByTestId(testId)).toBeInTheDocument();
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
