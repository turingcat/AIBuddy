/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionListItem } from '../../acp/sessions';
import {
  acpDeleteSession,
  acpExportSession,
  acpForkSession,
  acpImportSession,
  acpListSessions,
  acpRenameSession,
  acpShareSessionNostr,
} from '../../acp/sessions';
import zhCatalog from '../../i18n/messages/zh-CN.json';
import { IntlTestWrapper } from '../../i18n/test-utils';
import SessionListView from './SessionListView';

const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
const mockDeleteSnapshot = vi.hoisted(() => vi.fn());
const mockCancelPermissions = vi.hoisted(() => vi.fn());
const mockCancelElicitations = vi.hoisted(() => vi.fn());

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

vi.mock('react-toastify', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

vi.mock('../../acp/chatSessionStore', () => ({
  acpChatSessionActions: { deleteSnapshot: mockDeleteSnapshot },
}));

vi.mock('../../acp/permissionRequests', () => ({
  cancelAcpPermissionRequestsForSession: mockCancelPermissions,
}));

vi.mock('../../acp/elicitationRequests', () => ({
  cancelAcpElicitationRequestsForSession: mockCancelElicitations,
}));

vi.mock('../conversation/SearchView', () => ({
  SearchView: ({
    children,
    onSearch,
    placeholder,
  }: {
    children: React.ReactNode;
    onSearch: (term: string, caseSensitive: boolean) => void;
    placeholder: string;
  }) => (
    <div>
      <input
        aria-label="session-filter"
        placeholder={placeholder}
        onChange={(event) => onSearch(event.target.value, false)}
      />
      {children}
    </div>
  ),
}));

vi.mock('../ui/scroll-area', () => ({
  ScrollArea: ({
    children,
    handleScroll,
  }: {
    children: React.ReactNode;
    handleScroll: (
      target: Pick<HTMLDivElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>
    ) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => handleScroll({ scrollTop: 0, scrollHeight: 1000, clientHeight: 100 })}
      >
        Scroll far
      </button>
      <button
        type="button"
        onClick={() => handleScroll({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 })}
      >
        Scroll near
      </button>
      {children}
    </div>
  ),
}));

vi.mock('../ui/card', () => ({
  Card: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <div role={onClick ? 'article' : undefined} onClick={onClick}>
      {children}
    </div>
  ),
}));

vi.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect: () => void;
  }) => <button onClick={onSelect}>{children}</button>,
}));

vi.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('../ui/ConfirmationModal', () => ({
  ConfirmationModal: ({
    isOpen,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    isOpen ? (
      <div>
        <button onClick={onConfirm}>Confirm deletion</button>
        <button onClick={onCancel}>Cancel deletion</button>
      </div>
    ) : null,
}));

function session(id: string, overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id,
    name: `Session ${id}`,
    workingDir: `/work/${id}`,
    updatedAt: '2026-09-03T09:00:00.000Z',
    createdAt: '2026-09-03T08:00:00.000Z',
    messageCount: 2,
    ...overrides,
  };
}

async function renderSessionList(sessions: SessionListItem[] = []) {
  vi.mocked(acpListSessions).mockResolvedValue({ sessions, nextCursor: null });
  render(<SessionListView onSelectSession={vi.fn()} />, { wrapper: IntlTestWrapper });
  await waitFor(() => expect(acpListSessions).toHaveBeenCalled());
  if (sessions.length > 0) {
    await waitFor(() => expect(screen.getByText(sessions[0].name)).toBeInTheDocument());
  }
}

describe('SessionListView Nostr import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acpListSessions).mockReset().mockResolvedValue({ sessions: [], nextCursor: null });
    vi.mocked(acpDeleteSession).mockResolvedValue(undefined);
    vi.mocked(acpExportSession).mockResolvedValue('{}');
    vi.mocked(acpForkSession).mockResolvedValue('forked-session');
    vi.mocked(acpImportSession).mockResolvedValue(undefined);
    vi.mocked(acpRenameSession).mockResolvedValue(undefined);
    vi.mocked(acpShareSessionNostr).mockResolvedValue({
      deeplink: 'aibuddy://sessions/nostr?nevent=shared&key=secret',
      nevent: 'shared',
      eventId: 'event-id',
      relays: [],
    });
    Object.assign(window.electron, {
      getConfig: vi.fn().mockReturnValue({ AIBUDDY_DISABLE_NOSTR_SHARING: false }),
      createChatWindow: vi.fn(),
      selectImportSessionFile: undefined,
    });
    vi.mocked(window.electron.getSetting).mockResolvedValue(null);
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:test'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });

  it('shows the generic AIBuddy Nostr link format', async () => {
    render(<SessionListView onSelectSession={vi.fn()} />, { wrapper: IntlTestWrapper });

    fireEvent.click(await screen.findByRole('button', { name: 'Import Link' }));

    expect(
      screen.getByPlaceholderText('aibuddy://sessions/nostr?nevent=...&key=...')
    ).toBeInTheDocument();
  });

  it('keeps the generic AIBuddy Nostr link format in the Chinese catalog', async () => {
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
      screen.getByPlaceholderText('aibuddy://sessions/nostr?nevent=...&key=...')
    ).toBeInTheDocument();
  });

  it('loads, paginates, deduplicates, and expands scheduled sessions', async () => {
    const human = session('human');
    const scheduled = session('scheduled', { sessionType: 'scheduled' });
    const later = session('later', { updatedAt: '2026-09-02T09:00:00.000Z' });
    vi.mocked(acpListSessions)
      .mockReset()
      .mockResolvedValueOnce({ sessions: [human, scheduled], nextCursor: 'next-page' })
      .mockResolvedValueOnce({ sessions: [human, later], nextCursor: null });

    render(<SessionListView onSelectSession={vi.fn()} />, { wrapper: IntlTestWrapper });

    expect(await screen.findByText('Session human')).toBeInTheDocument();
    expect(await screen.findByText('Session later')).toBeInTheDocument();
    expect(screen.getAllByText('Session human')).toHaveLength(1);
    expect(screen.queryByText('Session scheduled')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Scheduled Jobs/ }));
    expect(screen.getByText('Session scheduled')).toBeInTheDocument();
    expect(acpListSessions).toHaveBeenNthCalledWith(2, 'next-page', { keyword: '' });
  });

  it('searches sessions and restores the normal empty state when cleared', async () => {
    vi.mocked(acpListSessions)
      .mockReset()
      .mockResolvedValue({ sessions: [session('searchable')], nextCursor: null });
    render(<SessionListView onSelectSession={vi.fn()} />, { wrapper: IntlTestWrapper });
    await waitFor(() => expect(screen.getByText('Session searchable')).toBeInTheDocument());
    vi.mocked(acpListSessions).mockResolvedValue({ sessions: [], nextCursor: null });

    fireEvent.change(screen.getByRole('textbox', { name: 'session-filter' }), {
      target: { value: 'missing' },
    });
    expect(
      await screen.findByText('No matching sessions found', {}, { timeout: 1500 })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'session-filter' }), {
      target: { value: '' },
    });
    expect(
      await screen.findByText('No chat sessions found', {}, { timeout: 1500 })
    ).toBeInTheDocument();
  });

  it('shows load errors and retries the session query', async () => {
    vi.mocked(acpListSessions)
      .mockReset()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ sessions: [], nextCursor: null });
    render(<SessionListView onSelectSession={vi.fn()} />, { wrapper: IntlTestWrapper });

    expect(await screen.findByText('Error Loading Sessions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('No chat sessions found')).toBeInTheDocument();
    expect(acpListSessions).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded sessions visible when background pagination fails', async () => {
    vi.mocked(acpListSessions)
      .mockReset()
      .mockResolvedValueOnce({ sessions: [session('kept')], nextCursor: 'broken-page' })
      .mockRejectedValueOnce(new Error('page failed'))
      .mockResolvedValue({ sessions: [session('kept')], nextCursor: null });
    render(<SessionListView onSelectSession={vi.fn()} />, { wrapper: IntlTestWrapper });

    await waitFor(() => expect(screen.getByText('Session kept')).toBeInTheDocument());
    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        'Failed to load remaining sessions:',
        expect.any(Error)
      )
    );
  });

  it('hides Nostr controls when sharing is disabled', async () => {
    vi.mocked(window.electron.getConfig).mockReturnValue({
      AIBUDDY_DISABLE_NOSTR_SHARING: true,
    } as any);

    await renderSessionList([session('restricted')]);

    expect(screen.queryByRole('button', { name: 'Import Link' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Share encrypted Nostr link' })
    ).not.toBeInTheDocument();
  });

  it('selects, opens, and edits sessions through item controls', async () => {
    const first = session('first');
    const second = session('second');
    const onSelectSession = vi.fn();
    vi.mocked(acpListSessions)
      .mockReset()
      .mockResolvedValue({
        sessions: [first, second],
        nextCursor: null,
      });
    render(<SessionListView onSelectSession={onSelectSession} />, { wrapper: IntlTestWrapper });
    await waitFor(() => expect(screen.getByText('Session first')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('article')[0]);
    expect(onSelectSession).toHaveBeenCalledWith('first');

    fireEvent.click(screen.getAllByTitle('Open in new window')[0]);
    expect(window.electron.createChatWindow).toHaveBeenCalledWith({
      dir: '/work/first',
      resumeSessionId: 'first',
      viewType: 'pair',
    });

    fireEvent.click(screen.getAllByTitle('Edit session name')[0]);
    const editInput = await screen.findByPlaceholderText('Enter session description');
    await waitFor(() => expect(editInput).toHaveValue('Session first'));
    fireEvent.keyDown(editInput, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Enter session description')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('Edit session name')[0]);
    const unchangedInput = await screen.findByPlaceholderText('Enter session description');
    fireEvent.keyDown(unchangedInput, { key: 'Enter' });
    expect(acpRenameSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle('Edit session name')[0]);
    const renamedInput = await screen.findByPlaceholderText('Enter session description');
    fireEvent.change(renamedInput, { target: { value: 'Renamed first' } });
    fireEvent.keyDown(renamedInput, { key: 'Enter' });
    await waitFor(() => expect(acpRenameSession).toHaveBeenCalledWith('first', 'Renamed first'));
    expect(await screen.findByText('Renamed first')).toBeInTheDocument();
  });

  it('restores the edit value when renaming fails', async () => {
    vi.mocked(acpRenameSession).mockRejectedValueOnce(new Error('rename failed'));
    await renderSessionList([session('rename-error')]);

    fireEvent.click(screen.getByTitle('Edit session name'));
    const input = await screen.findByPlaceholderText('Enter session description');
    await waitFor(() => expect(input).toHaveValue('Session rename-error'));
    fireEvent.change(input, { target: { value: 'Broken rename' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(input).toHaveValue('Session rename-error');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('Enter session description')).not.toBeInTheDocument();
  });

  it('duplicates and reports duplicate failures', async () => {
    vi.mocked(acpListSessions)
      .mockReset()
      .mockResolvedValue({
        sessions: [session('duplicate')],
        nextCursor: null,
      });
    render(<SessionListView onSelectSession={vi.fn()} />, { wrapper: IntlTestWrapper });
    await waitFor(() => expect(screen.getByText('Session duplicate')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Duplicate session'));
    await waitFor(() => expect(acpForkSession).toHaveBeenCalledWith('duplicate'));
    expect(mockToastSuccess).toHaveBeenCalled();

    vi.mocked(acpForkSession).mockRejectedValueOnce(new Error('fork failed'));
    fireEvent.click(screen.getByTitle('Duplicate session'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('deletes sessions and clears pending requests', async () => {
    await renderSessionList([session('delete')]);
    fireEvent.click(screen.getByTitle('Delete session'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));

    await waitFor(() => expect(acpDeleteSession).toHaveBeenCalledWith('delete'));
    expect(mockCancelPermissions).toHaveBeenCalledWith('delete');
    expect(mockCancelElicitations).toHaveBeenCalledWith('delete');
    expect(mockDeleteSnapshot).toHaveBeenCalledWith('delete');
  });

  it('reports delete failures and supports canceling confirmation', async () => {
    vi.mocked(acpDeleteSession).mockRejectedValueOnce(new Error('delete failed'));
    await renderSessionList([session('delete-error')]);
    fireEvent.click(screen.getByTitle('Delete session'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));
    expect(acpDeleteSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Delete session'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.getByText('Session delete-error')).toBeInTheDocument();
  });

  it('exports sessions as JSON and Markdown', async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(acpExportSession)
      .mockResolvedValueOnce('{"ok":true}')
      .mockResolvedValueOnce('# Session');
    await renderSessionList([session('export')]);

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    await waitFor(() => expect(acpExportSession).toHaveBeenCalledWith('export', 'json'));
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    await waitFor(() => expect(acpExportSession).toHaveBeenCalledWith('export', 'markdown'));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(anchorClick).toHaveBeenCalledTimes(2);
    anchorClick.mockRestore();
  });

  it('reports export failures', async () => {
    vi.mocked(acpExportSession).mockRejectedValueOnce(new Error('export failed'));
    await renderSessionList([session('export-error')]);

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('shares and copies encrypted Nostr links', async () => {
    await renderSessionList([session('share')]);

    fireEvent.click(screen.getByTitle('Share encrypted Nostr link'));
    expect(
      await screen.findByText('aibuddy://sessions/nostr?nevent=shared&key=secret')
    ).toBeInTheDocument();
    expect(acpShareSessionNostr).toHaveBeenCalledWith('share', []);

    fireEvent.click(screen.getByRole('button', { name: 'Copied to clipboard' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'aibuddy://sessions/nostr?nevent=shared&key=secret'
      )
    );

    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('clipboard denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copied to clipboard' }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to copy: clipboard denied')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByText('aibuddy://sessions/nostr?nevent=shared&key=secret')
    ).not.toBeInTheDocument();
  });

  it('reports Nostr sharing failures', async () => {
    vi.mocked(acpShareSessionNostr).mockRejectedValueOnce(new Error('relay failed'));
    await renderSessionList([session('share-error')]);

    fireEvent.click(screen.getByTitle('Share encrypted Nostr link'));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Share Nostr Link' })).not.toBeInTheDocument();
  });

  it('imports a Nostr link and reports import failures', async () => {
    await renderSessionList();
    fireEvent.click(screen.getByRole('button', { name: 'Import Link' }));
    const textarea = screen.getByPlaceholderText('aibuddy://sessions/nostr?nevent=...&key=...');
    fireEvent.change(textarea, {
      target: { value: '  aibuddy://sessions/nostr?nevent=import&key=secret  ' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Import Session' }).at(-1)!);

    await waitFor(() =>
      expect(acpImportSession).toHaveBeenCalledWith(
        'aibuddy://sessions/nostr?nevent=import&key=secret',
        'nostr'
      )
    );
    expect(
      screen.queryByPlaceholderText('aibuddy://sessions/nostr?nevent=...&key=...')
    ).not.toBeInTheDocument();

    vi.mocked(acpImportSession).mockRejectedValueOnce(new Error('import failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Import Link' }));
    fireEvent.change(screen.getByPlaceholderText('aibuddy://sessions/nostr?nevent=...&key=...'), {
      target: { value: 'aibuddy://sessions/nostr?nevent=bad&key=secret' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Import Session' }).at(-1)!);
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('uses the native import picker for success, cancellation, errors, and failures', async () => {
    const selectImportSessionFile = vi
      .fn()
      .mockResolvedValueOnce({ contents: '{"session":1}' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ contents: '', error: 'invalid export' })
      .mockRejectedValueOnce(new Error('picker failed'));
    Object.assign(window.electron, { selectImportSessionFile });
    await renderSessionList();
    const importButton = screen.getByRole('button', { name: 'Import Session' });

    fireEvent.click(importButton);
    await waitFor(() => expect(acpImportSession).toHaveBeenCalledWith('{"session":1}', 'json'));
    fireEvent.click(importButton);
    await waitFor(() => expect(selectImportSessionFile).toHaveBeenCalledTimes(2));
    fireEvent.click(importButton);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to import session: invalid export')
    );
    fireEvent.click(importButton);
    await waitFor(() => expect(selectImportSessionFile).toHaveBeenCalledTimes(4));
  });

  it('falls back to the file input and imports selected files', async () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await renderSessionList();
    fireEvent.click(screen.getByRole('button', { name: 'Import Session' }));
    expect(inputClick).toHaveBeenCalled();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const goodFile = { text: vi.fn().mockResolvedValue('{"file":true}') };
    fireEvent.change(fileInput, { target: { files: [goodFile] } });
    await waitFor(() => expect(acpImportSession).toHaveBeenCalledWith('{"file":true}', 'json'));

    const badFile = { text: vi.fn().mockRejectedValue(new Error('read failed')) };
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    fireEvent.change(fileInput, { target: { files: [] } });
    inputClick.mockRestore();
  });

  it('reveals additional date groups only when scrolling near the end', async () => {
    const sessions = Array.from({ length: 20 }, (_, index) =>
      session(`scroll-${index}`, {
        updatedAt: new Date(Date.UTC(2026, 8, 3 - index, 9)).toISOString(),
      })
    );
    await renderSessionList(sessions);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(15));

    fireEvent.click(screen.getByRole('button', { name: 'Scroll far' }));
    expect(screen.getAllByRole('article')).toHaveLength(15);
    fireEvent.click(screen.getByRole('button', { name: 'Scroll near' }));
    expect(await screen.findAllByRole('article')).toHaveLength(20);
  });
});
