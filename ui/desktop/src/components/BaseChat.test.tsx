import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';
import { ChatState } from '../types/chatState';
import BaseChat from './BaseChat';

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/pair', state: null }),
  useNavigate: () => vi.fn(),
}));
vi.mock('./ChatInput', () => ({ default: () => <div data-testid="chat-input" /> }));
vi.mock('./conversation/SearchView', () => ({
  SearchView: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('./LoadingGoose', () => ({ default: () => null }));
vi.mock('./ProgressiveMessageList', () => ({ default: () => null }));
vi.mock('./Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('./ui/scroll-area', () => ({
  ScrollArea: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('../hooks/useFileDrop', () => ({
  useFileDrop: () => ({
    droppedFiles: [],
    setDroppedFiles: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
  }),
}));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('./Layout/NavigationContext', () => ({
  useNavigationContextSafe: () => ({ isNavExpanded: true }),
}));
vi.mock('../hooks/useChatSession', () => ({
  useChatSession: () => ({
    session: undefined,
    messages: [],
    chatState: ChatState.Idle,
    progressMessage: undefined,
    updateSession: vi.fn(),
    handleSubmit: vi.fn(),
    onSteerQueuedMessage: undefined,
    submitElicitationResponse: vi.fn(),
    stopStreaming: vi.fn(),
    sessionLoadError: undefined,
    tokenState: { totalTokens: 0 },
    notifications: new Map(),
    pauseQueueOnStop: false,
    queueProcessingBlocked: false,
    onMessageUpdate: vi.fn(),
  }),
}));
vi.mock('../acp/sessions', () => ({ acpDeleteSession: vi.fn(), acpUpdateWorkingDir: vi.fn() }));
vi.mock('../hooks/useNavigation', () => ({ useNavigation: () => vi.fn() }));
vi.mock('./RecipeHeader', () => ({ RecipeHeader: () => null }));
vi.mock('./ui/RecipeWarningModal', () => ({ RecipeWarningModal: () => null }));
vi.mock('../recipe', () => ({ scanRecipe: vi.fn() }));
vi.mock('./recipes/RecipeActivities', () => ({ default: () => null }));
vi.mock('../hooks/useAutoSubmit', () => ({ useAutoSubmit: vi.fn() }));
vi.mock('./icons', () => ({ Goose: () => null }));
vi.mock('./GooseSidebar/EnvironmentBadge', () => ({ default: () => null }));
vi.mock('./SessionActionsHeader', () => ({ default: () => null }));
vi.mock('../acp/acpConnection', () => ({
  isAcpRecovering: () => false,
  subscribeToAcpRecovery: () => () => {},
}));

describe('BaseChat', () => {
  it('preserves 16px gutters around the centered active-session input', () => {
    render(
      <IntlProvider locale="en">
        <BaseChat
          setChat={vi.fn()}
          suppressEmptyState={false}
          sessionId="session-id"
          isActiveSession={true}
        />
      </IntlProvider>
    );

    expect(screen.getByTestId('chat-input').parentElement).toHaveClass(
      'w-[calc(100%-2rem)]',
      'mx-auto'
    );
    expect(screen.getByTestId('chat-input').parentElement).not.toHaveClass('mx-4');
  });
});
