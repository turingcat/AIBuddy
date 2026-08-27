import { ChevronUp, LogOut, Settings, UserRound } from 'lucide-react';

import { useBalance, type BalanceState } from '../../hooks/useBalance';
import { defineMessages, useIntl } from '../../i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { BalanceRefreshButton, BalanceStatus } from './BalanceWidget';

const i18n = defineMessages({
  notLoggedIn: { id: 'accountMenu.notLoggedIn', defaultMessage: 'Not signed in' },
  settings: { id: 'accountMenu.settings', defaultMessage: 'Settings' },
  logout: { id: 'accountMenu.logout', defaultMessage: 'Log out' },
});

interface UserAccountMenuProps {
  onOpenSettings: () => void;
  onLogout: () => void;
}

function getAccountName(state: BalanceState, fallback: string): string {
  if (state.status !== 'ready') return fallback;
  return state.balance.displayName || state.balance.userName || fallback;
}

export function UserAccountMenu({ onOpenSettings, onLogout }: UserAccountMenuProps) {
  const intl = useIntl();
  const { state, refreshing, refresh } = useBalance();
  const accountName = getAccountName(state, intl.formatMessage(i18n.notLoggedIn));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-text-primary transition-colors hover:bg-background-tertiary/60 outline-none"
        aria-label={accountName}
      >
        <UserRound className="size-4 shrink-0 text-text-secondary" />
        <span className="min-w-0 flex-1 truncate">{accountName}</span>
        <span className="min-w-0 shrink-0 text-xs">
          <BalanceStatus state={state} />
        </span>
        <ChevronUp className="size-4 shrink-0 text-text-secondary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <div
          className="flex min-w-0 items-center gap-2 px-2 py-2"
          data-testid="account-menu-summary"
        >
          <UserRound className="size-4 shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1 truncate font-medium">{accountName}</span>
          <span className="min-w-0 shrink-0 text-xs text-text-primary">
            <BalanceStatus state={state} />
          </span>
          <BalanceRefreshButton refreshing={refreshing} onRefresh={refresh} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenSettings}>
          <Settings />
          {intl.formatMessage(i18n.settings)}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onLogout}>
          <LogOut />
          {intl.formatMessage(i18n.logout)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
