import { RefreshCw, Wallet } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { useBalance, type BalanceState } from '../../hooks/useBalance';
import { formatQuotaWithCurrency } from '../../quotaFormat';
import { formatMessageTimestamp } from '../../utils/timeUtils';
import { defineMessages, useIntl } from '../../i18n';

/**
 * @author logic
 * @date 2026-08-24
 * 侧边栏底部余额组件：计量计费账户显示网关账户余额（new-api 余额语义），
 * 订阅计费账户显示服务端返回的日/周/月剩余额度；悬浮展示每个可用周期与更新时间，
 * 右侧按钮手动刷新；数据由 useBalance 轮询。
 */

const i18n = defineMessages({
  currentBalance: {
    id: 'accountMenu.currentBalance',
    defaultMessage: 'Current balance',
  },
  dailyRemaining: {
    id: 'accountMenu.dailyRemaining',
    defaultMessage: 'Daily remaining',
  },
  weeklyRemaining: {
    id: 'accountMenu.weeklyRemaining',
    defaultMessage: 'Weekly remaining',
  },
  monthlyRemaining: {
    id: 'accountMenu.monthlyRemaining',
    defaultMessage: 'Monthly remaining',
  },
  used: {
    id: 'balanceWidget.used',
    defaultMessage: 'Used: {value}',
  },
  subscriptionRemaining: {
    id: 'balanceWidget.subscriptionRemaining',
    defaultMessage: '{value} remaining',
  },
  daily: {
    id: 'balanceWidget.daily',
    defaultMessage: 'Daily: {value}',
  },
  weekly: {
    id: 'balanceWidget.weekly',
    defaultMessage: 'Weekly: {value}',
  },
  monthly: {
    id: 'balanceWidget.monthly',
    defaultMessage: 'Monthly: {value}',
  },
  requests: {
    id: 'balanceWidget.requests',
    defaultMessage: 'Requests: {count}',
  },
  refresh: {
    id: 'balanceWidget.refresh',
    defaultMessage: 'Refresh balance',
  },
  noPat: {
    id: 'balanceWidget.noPat',
    defaultMessage: 'Re-login to view balance',
  },
  loadFailed: {
    id: 'balanceWidget.loadFailed',
    defaultMessage: 'Balance load failed',
  },
  unauthorized: {
    id: 'balanceWidget.unauthorized',
    defaultMessage: 'Login expired, please re-login',
  },
  updatedAt: {
    id: 'balanceWidget.updatedAt',
    defaultMessage: 'Updated {time}',
  },
});

export function BalanceStatus({ state }: { state: BalanceState }) {
  const intl = useIntl();

  if (state.status === 'not-logged-in') {
    return null;
  }

  if (state.status === 'ready') {
    const subscription = state.balance.kind === 'subscription' ? state.balance : undefined;
    const meteredBalance = state.balance.kind === 'balance' ? state.balance : undefined;
    const remainingUSD = subscription?.remainingUSD;
    const primaryRemainingUSD =
      remainingUSD?.daily ?? remainingUSD?.weekly ?? remainingUSD?.monthly;
    const amount = subscription
      ? primaryRemainingUSD === undefined
        ? '--'
        : formatQuotaWithCurrency(primaryRemainingUSD, state.currency)
      : formatQuotaWithCurrency(meteredBalance!.quota, state.currency);
    const subscriptionPeriods = remainingUSD
      ? (
          [
            ['daily', i18n.daily],
            ['weekly', i18n.weekly],
            ['monthly', i18n.monthly],
          ] as const
        ).flatMap(([period, label]) => {
          const remaining = remainingUSD[period];
          return remaining === undefined
            ? []
            : [
                intl.formatMessage(label, {
                  value: formatQuotaWithCurrency(remaining, state.currency),
                }),
              ];
        })
      : [];
    const tooltip = [
      subscription ? subscription.groupName : meteredBalance!.displayName,
      ...(subscription
        ? subscriptionPeriods
        : [
            intl.formatMessage(i18n.used, {
              value: formatQuotaWithCurrency(meteredBalance!.usedQuota, state.currency),
            }),
            intl.formatMessage(i18n.requests, { count: meteredBalance!.requestCount }),
          ]),
      intl.formatMessage(i18n.updatedAt, { time: formatMessageTimestamp(state.updatedAt / 1000) }),
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="flex items-center gap-1 min-w-0 cursor-default text-text-primary/70 hover:text-text-primary transition-colors font-mono"
            data-testid="balance-value"
          >
            <Wallet className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">
              {subscription
                ? intl.formatMessage(i18n.subscriptionRemaining, { value: amount })
                : amount}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  if (state.status === 'loading') {
    return (
      <span className="font-mono text-text-secondary" data-testid="balance-loading">
        ...
      </span>
    );
  }

  const hint =
    state.status === 'no-pat'
      ? intl.formatMessage(i18n.noPat)
      : state.status === 'unauthorized'
        ? intl.formatMessage(i18n.unauthorized)
        : intl.formatMessage(i18n.loadFailed);
  const tooltip = state.status === 'error' ? `${hint}\n${state.message}` : hint;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="flex items-center gap-1 min-w-0 cursor-default text-text-secondary"
          data-testid="balance-hint"
        >
          <Wallet className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{hint}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function AIBuddyEntitlementRows({ state }: { state: BalanceState }) {
  const intl = useIntl();

  if (state.status !== 'ready') {
    return <BalanceStatus state={state} />;
  }

  const balance = state.balance;
  const rows =
    balance.kind === 'balance'
      ? [
          {
            label: intl.formatMessage(i18n.currentBalance),
            value: formatQuotaWithCurrency(balance.quota, state.currency),
          },
        ]
      : (['daily', 'weekly', 'monthly'] as const).flatMap((period) => {
          const value = balance.remainingUSD[period];
          if (value === undefined) return [];

          const label = {
            daily: i18n.dailyRemaining,
            weekly: i18n.weeklyRemaining,
            monthly: i18n.monthlyRemaining,
          }[period];

          return [
            {
              label: intl.formatMessage(label),
              value: formatQuotaWithCurrency(value, state.currency),
            },
          ];
        });

  return (
    <div className="flex flex-col gap-1 text-xs text-text-primary">
      {rows.map(({ label, value }) => (
        <div
          key={label}
          className="flex min-w-0 items-center justify-between gap-2"
          data-testid="aibuddy-entitlement-row"
        >
          <span className="min-w-0 text-text-secondary">{label}</span>
          <span className="shrink-0 font-mono">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function BalanceRefreshButton({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const intl = useIntl();
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="ml-auto p-1 flex-shrink-0 text-text-secondary hover:text-text-primary transition-colors"
      aria-label={intl.formatMessage(i18n.refresh)}
      data-testid="balance-refresh"
    >
      <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
    </button>
  );
}

export function BalanceWidget() {
  return <HeyBuddyBalanceWidget />;
}

function HeyBuddyBalanceWidget() {
  const { state, refreshing, refresh } = useBalance();

  if (state.status === 'not-logged-in') {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1 px-3 py-1.5 text-xs min-w-0"
      data-testid="balance-widget"
    >
      <BalanceStatus state={state} />
      <BalanceRefreshButton refreshing={refreshing} onRefresh={refresh} />
    </div>
  );
}
