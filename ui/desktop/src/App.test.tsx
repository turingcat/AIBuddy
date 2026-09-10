/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, screen, render, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppInner, PairRouteWrapper, resolveSessionInitialMessage } from './App';
import { IntlTestWrapper } from './i18n/test-utils';
import { FeaturesProvider } from './contexts/FeaturesContext';
import { reconnectAcpAfterSystemResume } from './acp/acpConnection';
import { createSession } from './sessions';
import { RecipeParameterScopesUnsupportedError } from './acp/errors';
import { acpDeleteSession, acpListSessions } from './acp/sessions';

const mockToastError = vi.hoisted(() => vi.fn());
const mockImportNostrSessionFromDeepLink = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// Set up globals for jsdom
Object.defineProperty(window, 'location', {
  value: {
    hash: '',
    search: '',
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    pathname: '/',
  },
  writable: true,
});

Object.defineProperty(window, 'history', {
  value: {
    replaceState: vi.fn(),
    state: null,
  },
  writable: true,
});

vi.mock('./utils/costDatabase', () => ({
  initializeCostDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./acp/sessions', () => ({
  acpListSessions: vi.fn().mockResolvedValue({ sessions: [], nextCursor: null }),
  acpDeleteSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./sessionLinks', () => ({
  importNostrSessionFromDeepLink: mockImportNostrSessionFromDeepLink,
}));

vi.mock('./sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sessions')>()),
  fetchSessionDetails: vi
    .fn()
    .mockResolvedValue({ sessionId: 'test', messages: [], metadata: { description: '' } }),
  generateSessionId: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock('./acp/capabilities', () => ({
  getAcpFeatureCapabilities: vi.fn().mockResolvedValue({ localInference: true }),
}));

vi.mock('./acp/acpConnection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./acp/acpConnection')>()),
  reconnectAcpAfterSystemResume: vi.fn(),
}));

// Mock the ACP providers module used by OnboardingGuard so it doesn't try to
// open a real ACP client connection during tests. Returning null defaults
// keeps the app in the "brand new" (no provider configured) onboarding state.
vi.mock('./acp/providers', () => ({
  acpReadDefaults: vi.fn().mockResolvedValue({ providerId: null, modelId: null }),
  acpSaveDefaults: vi.fn().mockResolvedValue(undefined),
  acpListProviderDetails: vi.fn().mockResolvedValue([]),
}));

// Mock the ConfigContext module
vi.mock('./components/ConfigContext', () => ({
  useConfig: () => ({
    read: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    getExtensions: vi.fn().mockReturnValue([]),
    addExtension: vi.fn(),
    updateExtension: vi.fn(),
    createProviderDefaults: vi.fn(),
  }),
  ConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock other components to simplify testing
vi.mock('./components/ErrorBoundary', () => ({
  ErrorUI: ({ error }: { error: Error | string }) => (
    <div>Error: {error instanceof Error ? error.message : error}</div>
  ),
}));

vi.mock('./components/ModelAndProviderContext', () => ({
  ModelAndProviderProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useModelAndProvider: () => ({
    provider: null,
    model: null,
    getCurrentModelAndProvider: vi.fn(),
    getFallbackModelAndProvider: vi.fn().mockResolvedValue({ provider: '', model: '' }),
    refreshCurrentModelAndProvider: vi.fn().mockResolvedValue(undefined),
    setCurrentModelAndProvider: vi.fn(),
  }),
}));

vi.mock('./contexts/ChatContext', () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useChatContext: () => ({
    chat: {
      id: 'test-id',
      name: 'Test Chat',
      messages: [],
      recipe: null,
    },
    setChat: vi.fn(),
    setPairChat: vi.fn(), // Keep this from HEAD
    resetChat: vi.fn(),
    hasActiveSession: false,
    setRecipe: vi.fn(),
    clearRecipe: vi.fn(),
    contextKey: 'hub',
  }),
  DEFAULT_CHAT_TITLE: 'New Chat', // Keep this from HEAD
}));

vi.mock('./components/ui/ConfirmationModal', () => ({
  ConfirmationModal: () => null,
}));

vi.mock('react-toastify', () => ({
  ToastContainer: () => null,
  toast: {
    error: mockToastError,
  },
}));

vi.mock('./components/AIBuddyhintsModal', () => ({
  AIBuddyhintsModal: () => null,
}));

vi.mock('./components/AnnouncementModal', () => ({
  default: () => null,
}));

vi.mock('./components/onboarding/OnboardingGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./components/Layout/AppLayout', () => ({
  AppLayout: ({ activeSessions }: { activeSessions: Array<{ sessionId: string }> }) => (
    <output data-testid="active-sessions">
      {activeSessions.map((session) => session.sessionId).join(',')}
    </output>
  ),
}));

vi.mock('./components/auth/LoginView', () => ({
  default: () => null,
}));

// Create mocks that we can track and configure per test
const mockNavigate = vi.fn();
const mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

// Mock react-router to avoid HashRouter issues in tests
vi.mock('react-router', () => ({
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Routes: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Route: ({ element }: { element: React.ReactNode }) => element,
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null, pathname: '/' }),
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  Outlet: () => null,
}));

// Mock electron API
const mockElectron = {
  getConfig: vi.fn().mockReturnValue({
    AIBUDDY_ALLOWLIST_WARNING: false,
    AIBUDDY_WORKING_DIR: '/test/dir',
  }),
  logInfo: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  reactReady: vi.fn(),
  getAllowedExtensions: vi.fn().mockResolvedValue([]),
  platform: 'darwin',
  createChatWindow: vi.fn(),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  getIsFullScreen: vi.fn().mockResolvedValue(false),
  // OnboardingGuard 现在基于登录状态放行 children；这里默认登录，保持原有渲染路径
  isLoggedIn: vi.fn().mockResolvedValue(true),
};

// Mock appConfig
const mockAppConfig = {
  get: vi.fn((key: string): string | null => {
    if (key === 'AIBUDDY_WORKING_DIR') return '/test/dir';
    return null;
  }),
};

// Attach mocks to window
(window as any).electron = mockElectron;
(window as any).appConfig = mockAppConfig;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function AppInnerTestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlTestWrapper>
      <FeaturesProvider>{children}</FeaturesProvider>
    </IntlTestWrapper>
  );
}

function getIpcHandler(channel: string) {
  return mockElectron.on.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )?.[1];
}

async function renderAppInner() {
  render(<AppInner />, { wrapper: AppInnerTestWrapper });
  await waitFor(() => {
    expect(mockElectron.reactReady).toHaveBeenCalled();
  });
}

describe('App Component - Brand New State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockAppConfig.get.mockImplementation((key: string): string | null => {
      if (key === 'AIBUDDY_WORKING_DIR') return '/test/dir';
      return null;
    });

    // Reset search params
    mockSearchParams.forEach((_, key) => {
      mockSearchParams.delete(key);
    });

    window.location.hash = '';
    window.location.search = '';
    window.location.pathname = '/';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should redirect to "/" when app is brand new (no provider configured)', async () => {
    // Mock no provider configured
    mockElectron.getConfig.mockReturnValue({
      AIBUDDY_DEFAULT_PROVIDER: null,
      AIBUDDY_DEFAULT_MODEL: null,
      AIBUDDY_ALLOWLIST_WARNING: false,
    });

    render(<AppInner />, { wrapper: AppInnerTestWrapper });

    // Wait for initialization
    await waitFor(() => {
      expect(mockElectron.reactReady).toHaveBeenCalled();
    });

    // The app should initialize without any navigation calls since we're already at "/"
    // No navigate calls should be made when no provider is configured
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should handle deep links correctly when app is brand new', async () => {
    // Mock no provider configured
    mockElectron.getConfig.mockReturnValue({
      AIBUDDY_DEFAULT_PROVIDER: null,
      AIBUDDY_DEFAULT_MODEL: null,
      AIBUDDY_ALLOWLIST_WARNING: false,
    });

    // Set up search params to simulate view=settings deep link
    mockSearchParams.set('view', 'settings');

    render(<AppInner />, { wrapper: AppInnerTestWrapper });

    // Wait for initialization
    await waitFor(() => {
      expect(mockElectron.reactReady).toHaveBeenCalled();
    });

    expect(screen.queryByText(/^Welcome to AIBuddy/)).not.toBeInTheDocument();
  });

  it('should not redirect when provider is configured', async () => {
    // Mock provider configured
    mockElectron.getConfig.mockReturnValue({
      AIBUDDY_DEFAULT_PROVIDER: 'openai',
      AIBUDDY_DEFAULT_MODEL: 'gpt-4',
      AIBUDDY_ALLOWLIST_WARNING: false,
    });

    render(<AppInner />, { wrapper: AppInnerTestWrapper });

    // Wait for initialization
    await waitFor(() => {
      expect(mockElectron.reactReady).toHaveBeenCalled();
    });

    // Should not navigate anywhere since provider is configured and we're already at "/"
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows the scoped-parameter incompatibility before returning home', async () => {
    mockAppConfig.get.mockImplementation((key: string): string | null => {
      if (key === 'AIBUDDY_WORKING_DIR') return '/test/dir';
      if (key === 'recipeDeeplink') return 'aibuddy://recipe?url=example';
      return null;
    });
    vi.mocked(createSession).mockRejectedValueOnce(new RecipeParameterScopesUnsupportedError());

    render(<PairRouteWrapper activeSessions={[]} setActiveSessions={vi.fn()} />, {
      wrapper: AppInnerTestWrapper,
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'The connected AIBuddy server does not support securely scoped deeplink recipe parameters. Update the server and try again.'
      );
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should navigate home when the main process emits new-chat', async () => {
    mockElectron.getConfig.mockReturnValue({
      AIBUDDY_DEFAULT_PROVIDER: 'openai',
      AIBUDDY_DEFAULT_MODEL: 'gpt-4',
      AIBUDDY_ALLOWLIST_WARNING: false,
    });

    render(<AppInner />, { wrapper: AppInnerTestWrapper });

    await waitFor(() => {
      expect(mockElectron.reactReady).toHaveBeenCalled();
    });

    const newChatHandler = mockElectron.on.mock.calls.find(
      ([channel]) => channel === 'new-chat'
    )?.[1];
    expect(newChatHandler).toBeDefined();

    newChatHandler?.({} as any);

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should reconnect ACP when the main process emits system-resume', async () => {
    render(<AppInner />, { wrapper: AppInnerTestWrapper });

    await waitFor(() => {
      expect(mockElectron.reactReady).toHaveBeenCalled();
    });

    const systemResumeHandler = mockElectron.on.mock.calls.find(
      ([channel]) => channel === 'system-resume'
    )?.[1];
    expect(systemResumeHandler).toBeDefined();

    systemResumeHandler?.({} as any);

    expect(reconnectAcpAfterSystemResume).toHaveBeenCalledOnce();
  });

  it('imports generic Goose Nostr session links', async () => {
    render(<AppInner />, { wrapper: AppInnerTestWrapper });

    await waitFor(() => {
      expect(mockElectron.reactReady).toHaveBeenCalled();
    });

    const openSharedSessionHandler = mockElectron.on.mock.calls.find(
      ([channel]) => channel === 'open-shared-session'
    )?.[1];
    const link = 'goose://sessions/nostr?nevent=test&key=secret';

    expect(openSharedSessionHandler).toBeDefined();
    await openSharedSessionHandler?.({} as any, link);

    expect(mockImportNostrSessionFromDeepLink).toHaveBeenCalledWith(link);
    expect(mockNavigate).toHaveBeenCalledWith('/sessions');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('rejects product-protocol Nostr session links', async () => {
    render(<AppInner />, { wrapper: AppInnerTestWrapper });

    await waitFor(() => {
      expect(mockElectron.reactReady).toHaveBeenCalled();
    });

    const openSharedSessionHandler = mockElectron.on.mock.calls.find(
      ([channel]) => channel === 'open-shared-session'
    )?.[1];

    expect(openSharedSessionHandler).toBeDefined();
    await openSharedSessionHandler?.({} as any, 'aibuddy://sessions/nostr?nevent=test&key=secret');

    expect(mockImportNostrSessionFromDeepLink).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Unsupported session share link');
    expect(mockNavigate).toHaveBeenCalledWith('/sessions');
  });

  it('cleans up only empty unnamed non-recipe sessions', async () => {
    vi.mocked(acpListSessions).mockResolvedValueOnce({
      sessions: [
        { id: 'phantom', messageCount: 0, userSetName: false, hasRecipe: false },
        { id: 'named', messageCount: 0, userSetName: true, hasRecipe: false },
        { id: 'recipe', messageCount: 0, userSetName: false, hasRecipe: true },
        { id: 'used', messageCount: 1, userSetName: false, hasRecipe: false },
      ] as any,
      nextCursor: null,
    });

    await renderAppInner();

    await waitFor(() => {
      expect(acpDeleteSession).toHaveBeenCalledTimes(1);
    });
    expect(acpDeleteSession).toHaveBeenCalledWith('phantom');
  });

  it('maintains active sessions as an LRU list and applies session events', async () => {
    await renderAppInner();

    for (let index = 0; index < 11; index += 1) {
      act(() => {
        window.dispatchEvent(
          new CustomEvent('add-active-session', {
            detail: {
              sessionId: `session-${index}`,
              initialMessage: { msg: `${index}`, images: [] },
            },
          })
        );
      });
    }

    expect(screen.getByTestId('active-sessions')).toHaveTextContent(
      'session-1,session-2,session-3,session-4,session-5,session-6,session-7,session-8,session-9,session-10'
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('add-active-session', { detail: { sessionId: 'session-3' } })
      );
      window.dispatchEvent(
        new CustomEvent('clear-initial-message', { detail: { sessionId: 'session-4' } })
      );
      window.dispatchEvent(
        new CustomEvent('session-deleted', { detail: { sessionId: 'session-5' } })
      );
    });

    expect(screen.getByTestId('active-sessions')).toHaveTextContent(
      'session-1,session-2,session-4,session-6,session-7,session-8,session-9,session-10,session-3'
    );
  });

  it('deduplicates concurrent Nostr imports and clears stale in-flight requests', async () => {
    let resolveFirst: (() => void) | undefined;
    mockImportNostrSessionFromDeepLink
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce(undefined);
    await renderAppInner();
    const handler = getIpcHandler('open-shared-session');
    const firstLink = 'goose://sessions/nostr?nevent=first&key=secret';
    const secondLink = 'goose://sessions/nostr?nevent=second&key=secret';

    const firstImport = handler?.({} as any, firstLink);
    await handler?.({} as any, firstLink);
    await handler?.({} as any, secondLink);
    resolveFirst?.();
    await firstImport;

    expect(mockImportNostrSessionFromDeepLink).toHaveBeenCalledTimes(2);
    expect(mockElectron.logInfo).toHaveBeenCalledWith('Skipping duplicate Nostr deep link import');
  });

  it('reports Nostr import failures and returns to sessions', async () => {
    mockImportNostrSessionFromDeepLink.mockRejectedValueOnce(new Error('relay unavailable'));
    await renderAppInner();

    await getIpcHandler('open-shared-session')?.(
      {} as any,
      'goose://sessions/nostr?nevent=test&key=secret'
    );

    expect(mockToastError).toHaveBeenCalledWith(
      'Failed to import Nostr session: relay unavailable'
    );
    expect(mockNavigate).toHaveBeenCalledWith('/sessions');
  });

  it('handles platform new-window shortcuts and ignores other key combinations', async () => {
    await renderAppInner();

    mockElectron.platform = 'darwin';
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    fireEvent.keyDown(window, { key: 'x', metaKey: true });
    fireEvent.keyDown(window, { key: 'n' });
    mockElectron.platform = 'win32';
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });

    expect(mockElectron.createChatWindow).toHaveBeenCalledTimes(2);
    expect(mockElectron.createChatWindow).toHaveBeenCalledWith({ dir: '/test/dir' });
  });

  it('contains global drag events outside designated drop zones', async () => {
    await renderAppInner();
    const outside = document.createElement('div');
    const dropZone = document.createElement('div');
    const inside = document.createElement('span');
    dropZone.dataset.dropZone = 'true';
    dropZone.appendChild(inside);
    document.body.append(outside, dropZone);

    const outsideDrag = new Event('dragenter', { bubbles: true, cancelable: true });
    outside.dispatchEvent(outsideDrag);
    const insideDrop = new Event('drop', { bubbles: true, cancelable: true });
    inside.dispatchEvent(insideDrop);
    const dragOver = new Event('dragover', { bubbles: true, cancelable: true });
    inside.dispatchEvent(dragOver);

    expect(outsideDrag.defaultPrevented).toBe(true);
    expect(insideDrop.defaultPrevented).toBe(false);
    expect(dragOver.defaultPrevented).toBe(true);
    outside.remove();
    dropZone.remove();
  });

  it('handles view, focus, and initial-message IPC commands', async () => {
    await renderAppInner();

    getIpcHandler('set-view')?.({} as any, 'settings', 'models');
    getIpcHandler('set-view')?.({} as any, 'sessions');
    expect(mockNavigate).toHaveBeenCalledWith('/settings?section=models');
    expect(mockNavigate).toHaveBeenCalledWith('/sessions');

    const input = document.createElement('input');
    const focus = vi.spyOn(input, 'focus');
    const querySelector = vi
      .spyOn(document, 'querySelector')
      .mockReturnValueOnce(input)
      .mockReturnValueOnce(null);
    getIpcHandler('focus-input')?.({} as any);
    getIpcHandler('focus-input')?.({} as any);
    expect(focus).toHaveBeenCalledOnce();
    querySelector.mockRestore();

    getIpcHandler('set-initial-message')?.({} as any, 'draft reply', { noAutoSubmit: true });
    getIpcHandler('set-initial-message')?.({} as any, 'ignored while processing');
    getIpcHandler('set-initial-message')?.({} as any, '');
    expect(mockNavigate).toHaveBeenCalledWith('/pair', {
      state: {
        initialMessage: { msg: 'draft reply', images: [] },
        noAutoSubmit: true,
      },
    });
  });

  it('renders fatal errors from startup and main-process events', async () => {
    mockElectron.reactReady.mockImplementationOnce(() => {
      throw new Error('renderer handshake failed');
    });
    render(<AppInner />, { wrapper: AppInnerTestWrapper });
    expect(await screen.findByText(/renderer handshake failed/)).toBeInTheDocument();

    vi.clearAllMocks();
    mockElectron.reactReady.mockImplementation(() => undefined);
    render(<AppInner />, { wrapper: AppInnerTestWrapper });
    await waitFor(() => expect(getIpcHandler('fatal-error')).toBeDefined());
    act(() => {
      getIpcHandler('fatal-error')?.({} as any, 'backend crashed');
    });
    expect(await screen.findByText(/backend crashed/)).toBeInTheDocument();
  });

  it('should seed recipe sessions with the recipe prompt when no initial message is provided', () => {
    expect(
      resolveSessionInitialMessage(
        {
          recipe: {
            prompt: 'Write a release note for the latest change',
          },
        },
        undefined
      )
    ).toEqual({
      msg: 'Write a release note for the latest change',
      images: [],
    });
  });
});
