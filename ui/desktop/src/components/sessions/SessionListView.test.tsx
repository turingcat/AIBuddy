/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zhCatalog from '../../i18n/messages/zh-CN.json';
import { IntlTestWrapper } from '../../i18n/test-utils';
import SessionListView from './SessionListView';

vi.mock('../../acp/sessions', () => ({
  acpDeleteSession: vi.fn(),
  acpExportSession: vi.fn(),
  acpForkSession: vi.fn(),
  acpImportSession: vi.fn(),
  acpListSessions: vi.fn().mockResolvedValue({ sessions: [], nextCursor: null }),
  acpRenameSession: vi.fn(),
  acpShareSessionNostr: vi.fn(),
}));

vi.mock('../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('SessionListView Nostr import', () => {
  beforeEach(() => {
    Object.assign(window.electron, {
      getConfig: vi.fn().mockReturnValue({ GOOSE_DISABLE_NOSTR_SHARING: false }),
    });
    vi.mocked(window.electron.getSetting).mockResolvedValue(null);
  });

  it('shows the generic Goose Nostr link format', async () => {
    render(<SessionListView onSelectSession={vi.fn()} />, { wrapper: IntlTestWrapper });

    fireEvent.click(await screen.findByRole('button', { name: 'Import Link' }));

    expect(
      screen.getByPlaceholderText('goose://sessions/nostr?nevent=...&key=...')
    ).toBeInTheDocument();
  });

  it('keeps the generic Goose Nostr link format in the Chinese catalog', async () => {
    const messages = Object.fromEntries(
      Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
    );

    render(
      <IntlProvider locale="zh-CN" messages={messages}>
        <SessionListView onSelectSession={vi.fn()} />
      </IntlProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: '导入链接' }));

    expect(
      screen.getByPlaceholderText('goose://sessions/nostr?nevent=...&key=...')
    ).toBeInTheDocument();
  });
});
