import React from 'react';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';
import zhCatalog from '../../i18n/messages/zh-CN.json';
import { ContextWindowIndicator } from './ContextWindowIndicator';
import { DirSwitcher } from './DirSwitcher';
import { BottomMenuExtensionSelection } from './BottomMenuExtensionSelection';

vi.mock('../ConfigContext', () => ({ useConfig: () => ({ extensionsList: [] }) }));

vi.mock('../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

describe('chat toolbar labels', () => {
  it('shows an accessible Chinese context label next to the token count', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ContextWindowIndicator totalTokens={1_024} tokenLimit={128_000} alerts={[]} />
      </IntlProvider>
    );

    expect(screen.getByText('上下文')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上下文/ })).toBeInTheDocument();
  });

  it('shows an accessible Chinese directory label next to the current directory', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <DirSwitcher className="" sessionId={undefined} workingDir="/workspace/aibuddy" />
      </IntlProvider>
    );

    expect(screen.getByText('目录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '目录' })).toBeInTheDocument();
  });

  it('shows an accessible Chinese extension label next to the extension count', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <BottomMenuExtensionSelection
          sessionId={null}
          nextChatExtensionDraft={{ selectedNames: new Set() }}
          onNextChatExtensionDraftChange={vi.fn()}
        />
      </IntlProvider>
    );

    expect(screen.getByText('扩展')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '扩展' })).toBeInTheDocument();
  });
});
