import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlProvider } from 'react-intl';
import { Navigation } from './NavigationPanel';
import type { SessionListItem } from '../../acp/sessions';

const {
  mockHandleSessionClick,
  mockFetchSessions,
  mockDeleteSession,
  mockDeleteSnapshot,
  mockCancelPermissionRequests,
  mockCancelElicitationRequests,
  mockToastError,
  session,
  secondSession,
} = vi.hoisted(() => ({
  mockHandleSessionClick: vi.fn(),
  mockFetchSessions: vi.fn(),
  mockDeleteSession: vi.fn(),
  mockDeleteSnapshot: vi.fn(),
  mockCancelPermissionRequests: vi.fn(),
  mockCancelElicitationRequests: vi.fn(),
  mockToastError: vi.fn(),
  session: {
    id: 'session-1',
    name: 'A session title that is intentionally long enough to be truncated in the sidebar',
    workingDir: '/tmp',
    updatedAt: '2026-08-27T00:00:00Z',
    createdAt: '2026-08-27T00:00:00Z',
    messageCount: 1,
  } satisfies SessionListItem,
  secondSession: {
    id: 'session-2',
    name: 'Another session',
    workingDir: '/tmp',
    updatedAt: '2026-08-27T01:00:00Z',
    createdAt: '2026-08-27T01:00:00Z',
    messageCount: 1,
  } satisfies SessionListItem,
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('./NavigationContext', () => ({
  useNavigationContext: () => ({ isNavExpanded: true }),
}));

vi.mock('../ConfigContext', () => ({
  useConfig: () => ({ extensionsList: [] }),
}));

vi.mock('../../hooks/useNavigationSessions', () => ({
  useNavigationSessions: () => ({
    recentSessions: [session, secondSession],
    recentSessionsByProject: [],
    activeSessionId: undefined,
    fetchSessions: mockFetchSessions,
    handleNavClick: vi.fn(),
    handleSessionClick: mockHandleSessionClick,
  }),
}));

vi.mock('../../hooks/useNavigationItems', () => ({
  NAV_ITEMS: [],
  SETTINGS_NAV_ITEM: { id: 'settings', path: '/settings', label: 'Settings', icon: () => null },
  getNavItemLabel: (item: { label: string }) => item.label,
}));

vi.mock('../common/InlineEditText', () => ({
  InlineEditText: ({ value, className }: { value: string; className: string }) => (
    <span className={className}>{value}</span>
  ),
}));

vi.mock('../SessionIndicators', () => ({ SessionIndicators: () => null }));
vi.mock('./BalanceWidget', () => ({ BalanceWidget: () => null }));
vi.mock('../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
}));

vi.mock('../../acp/sessions', () => ({
  acpRenameSession: vi.fn(),
  acpDeleteSession: mockDeleteSession,
}));

vi.mock('../../acp/chatSessionStore', () => ({
  acpChatSessionActions: { deleteSnapshot: mockDeleteSnapshot },
}));

vi.mock('../../acp/permissionRequests', () => ({
  cancelAcpPermissionRequestsForSession: mockCancelPermissionRequests,
}));

vi.mock('../../acp/elicitationRequests', () => ({
  cancelAcpElicitationRequestsForSession: mockCancelElicitationRequests,
}));

vi.mock('react-toastify', () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

vi.mock('../ui/ConfirmationModal', () => ({
  ConfirmationModal: ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    isSubmitting,
  }: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    isSubmitting?: boolean;
  }) =>
    isOpen ? (
      <div role="dialog">
        <span>{message}</span>
        <button onClick={onConfirm} disabled={isSubmitting}>
          {title}
        </button>
        <button onClick={onCancel} disabled={isSubmitting}>
          取消
        </button>
      </div>
    ) : null,
}));

function renderNavigation() {
  return render(
    <IntlProvider
      locale="zh-CN"
      defaultLocale="zh-CN"
      messages={{ 'sessions.delete.title': '删除会话', 'sessions.cancel': '取消' }}
    >
      <Navigation />
    </IntlProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function sessionTitle() {
  return screen
    .getAllByText(session.name)
    .find((element) => element.classList.contains('truncate'));
}

function deleteButton(index = 0) {
  return screen.getAllByRole('button', { name: '删除会话' })[index];
}

describe('Navigation sidebar session deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteSession.mockResolvedValue(undefined);
  });

  it('shows an accessible delete button and truncates the visible session title', () => {
    renderNavigation();

    expect(deleteButton()).toBeInTheDocument();
    expect(sessionTitle()).toHaveClass('truncate', 'min-w-0');
    expect(screen.getAllByRole('tooltip')[0]).toHaveTextContent(session.name);
  });

  it('does not open the session when the delete button is clicked', async () => {
    const user = userEvent.setup();
    renderNavigation();

    await user.click(deleteButton());

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockHandleSessionClick).not.toHaveBeenCalled();
  });

  it('leaves the session untouched when deletion is cancelled', async () => {
    const user = userEvent.setup();
    renderNavigation();

    await user.click(deleteButton());
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockDeleteSnapshot).not.toHaveBeenCalled();
    expect(mockFetchSessions).toHaveBeenCalledTimes(1);
  });

  it('deletes through ACP before cleaning local session state and refreshing the list', async () => {
    const user = userEvent.setup();
    const sessionDeleted = vi.fn();
    window.addEventListener('session-deleted', sessionDeleted);
    renderNavigation();

    await user.click(deleteButton());
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除会话' }));

    await waitFor(() => expect(mockDeleteSession).toHaveBeenCalledWith(session.id));
    expect(mockCancelPermissionRequests).toHaveBeenCalledWith(session.id);
    expect(mockCancelElicitationRequests).toHaveBeenCalledWith(session.id);
    expect(mockDeleteSnapshot).toHaveBeenCalledWith(session.id);
    expect(mockFetchSessions).toHaveBeenCalledTimes(2);
    expect(sessionDeleted).toHaveBeenCalledTimes(1);
    window.removeEventListener('session-deleted', sessionDeleted);
  });

  it('prevents duplicate confirmation and cancellation while ACP deletion is in flight', async () => {
    const user = userEvent.setup();
    const request = deferred<void>();
    mockDeleteSession.mockReturnValueOnce(request.promise);
    renderNavigation();

    await user.click(deleteButton());
    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: '删除会话' });
    const cancelButton = within(dialog).getByRole('button', { name: '取消' });

    await user.dblClick(confirmButton);

    try {
      expect(mockDeleteSession).toHaveBeenCalledTimes(1);
      expect(confirmButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
      await user.click(cancelButton);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      request.resolve();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  });

  it('keeps a newer session pending when an older deletion finishes', async () => {
    const user = userEvent.setup();
    const request = deferred<void>();
    mockDeleteSession.mockReturnValueOnce(request.promise);
    renderNavigation();

    await user.click(deleteButton());
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除会话' }));
    await waitFor(() => expect(mockDeleteSession).toHaveBeenCalledWith(session.id));

    await user.click(deleteButton(1));
    expect(screen.getByRole('dialog')).toHaveTextContent(secondSession.name);

    await act(async () => {
      request.resolve();
      await request.promise;
      await Promise.resolve();
    });

    expect(screen.getByRole('dialog')).toHaveTextContent(secondSession.name);
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: '删除会话' })
    ).toBeEnabled();
  });

  it('keeps the session and reports an error when ACP deletion fails', async () => {
    const user = userEvent.setup();
    const sessionDeleted = vi.fn();
    window.addEventListener('session-deleted', sessionDeleted);
    mockDeleteSession.mockRejectedValueOnce(new Error('ACP unavailable'));
    renderNavigation();

    await user.click(deleteButton());
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除会话' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(sessionTitle()).toBeInTheDocument();
    expect(mockCancelPermissionRequests).not.toHaveBeenCalled();
    expect(mockCancelElicitationRequests).not.toHaveBeenCalled();
    expect(mockDeleteSnapshot).not.toHaveBeenCalled();
    expect(mockFetchSessions).toHaveBeenCalledTimes(1);
    expect(sessionDeleted).not.toHaveBeenCalled();
    window.removeEventListener('session-deleted', sessionDeleted);
  });
});
