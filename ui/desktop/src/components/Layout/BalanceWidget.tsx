import { RefreshCw, Wallet } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { useBalance, type BalanceState } from '../../hooks/useBalance';
import { formatQuotaWithCurrency } from '../../quotaFormat';
import { formatMessageTimestamp } from '../../utils/timeUtils';
import { defineMessages, useIntl } from '../../i18n';
import { getAppEdition } from '../../brand';

/**
 * @author logic
 * @date 2026-08-24
 * 侧边栏底部余额组件：显示当前登录用户在网关的账户余额（new-api 余额语义），
 * 悬浮显示已用额度/请求数/更新时间，右侧按钮手动刷新；数据由 useBalance 轮询。
 */

const i18n = defineMessages({
  used: {
    id: 'balanceWidget.used',
    defaultMessage: 'Used: {value}',
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
    const tooltip = [
      state.balance.displayName,
      intl.formatMessage(i18n.used, {
        value: formatQuotaWithCurrency(state.balance.usedQuota, state.currency),
      }),
      intl.formatMessage(i18n.requests, { count: state.balance.requestCount }),
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
              {formatQuotaWithCurrency(state.balance.quota, state.currency)}
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
  if (getAppEdition() === 'aibuddy') {
    return null;
  }

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
