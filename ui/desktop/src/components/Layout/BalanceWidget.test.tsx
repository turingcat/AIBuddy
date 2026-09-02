import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { BalanceWidget } from './BalanceWidget';
import type { BalanceResult } from '../../balance';
import { DEFAULT_CURRENCY_CONFIG } from '../../quotaFormat';

const electronMock = window.electron as unknown as {
  getUserBalance: ReturnType<typeof vi.fn>;
};

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

function renderWidget() {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <BalanceWidget />
    </IntlProvider>
  );
}

function meteredBalance(): BalanceResult {
  return {
    ok: true,
    balance: {
      kind: 'balance',
      quota: 5_000_000,
      usedQuota: 100_000,
      requestCount: 42,
      userName: 'aibuddy',
      displayName: 'AIBuddy user',
    },
    currency: DEFAULT_CURRENCY_CONFIG,
  };
}

describe('BalanceWidget', () => {
  beforeEach(() => {
    electronMock.getUserBalance = vi.fn();
  });

  it('renders metered AIBuddy balance as a TFlow entitlement row', async () => {
    electronMock.getUserBalance.mockResolvedValue(meteredBalance());
    renderWidget();

    const row = await screen.findByTestId('aibuddy-entitlement-row');
    expect(row).toHaveTextContent('Current balance');
    expect(row).toHaveTextContent('$10');
    expect(screen.queryByTestId('balance-value')).toBeNull();
  });

  it('renders only configured subscription periods', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: true,
      balance: {
        kind: 'subscription',
        groupName: 'Codex Max',
        remainingUSD: { daily: 37.5, monthly: 100 },
        userName: 'aibuddy',
        displayName: 'AIBuddy user',
      },
      currency: { ...DEFAULT_CURRENCY_CONFIG, quotaPerUnit: 1 },
    } satisfies BalanceResult);
    renderWidget();

    const rows = await screen.findAllByTestId('aibuddy-entitlement-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Daily remaining')).toBeInTheDocument();
    expect(within(rows[0]).getByText('$37.5')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Monthly remaining')).toBeInTheDocument();
    expect(within(rows[1]).getByText('$100')).toBeInTheDocument();
  });

  it('renders loading and login error states', async () => {
    electronMock.getUserBalance.mockReturnValue(new Promise(() => {}));
    const view = renderWidget();
    expect(screen.getByTestId('balance-loading')).toBeInTheDocument();

    view.unmount();
    electronMock.getUserBalance.mockResolvedValue({ ok: false, kind: 'no-pat' } as BalanceResult);
    renderWidget();
    expect(await screen.findByTestId('balance-hint')).toHaveTextContent('Re-login to view balance');
  });

  it('does not render when signed out', async () => {
    electronMock.getUserBalance.mockResolvedValue({
      ok: false,
      kind: 'not-logged-in',
    } as BalanceResult);
    renderWidget();

    await waitFor(() => expect(screen.queryByTestId('balance-widget')).toBeNull());
  });

  it('refreshes the AIBuddy entitlement', async () => {
    electronMock.getUserBalance.mockResolvedValue(meteredBalance());
    renderWidget();
    await screen.findByTestId('aibuddy-entitlement-row');
    const callsAfterMount = electronMock.getUserBalance.mock.calls.length;

    await userEvent.click(screen.getByTestId('balance-refresh'));

    expect(electronMock.getUserBalance.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
