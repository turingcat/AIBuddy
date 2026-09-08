import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, type RenderOptions, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import ModelsBottomBar from './ModelsBottomBar';
import { IntlTestWrapper } from '../../../../i18n/test-utils';
import zhCatalog from '../../../../i18n/messages/zh-CN.json';

const renderWithIntl = (ui: React.ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: IntlTestWrapper, ...options });

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

const createDropdownRef = (): React.RefObject<HTMLDivElement> =>
  ({ current: document.createElement('div') }) as React.RefObject<HTMLDivElement>;

let mockCurrentModel: string | null = 'config-model';
let mockCurrentProvider: string | null = 'config-provider';
const mockGetProviders = vi.fn();
const mockOnModelChanged = vi.fn();
const mockPreventCloseAutoFocus = vi.fn();

vi.mock('../../../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    currentModel: mockCurrentModel,
    currentProvider: mockCurrentProvider,
  }),
}));

vi.mock('../../../ConfigContext', () => ({
  useConfig: () => ({
    getProviders: mockGetProviders,
  }),
}));

vi.mock('../modelInterface', () => ({
  getProviderMetadata: vi.fn().mockResolvedValue({ display_name: 'Config Provider' }),
  fetchModelReasoning: vi.fn().mockResolvedValue(null),
}));

vi.mock('../predefinedModelsUtils', () => ({
  getModelDisplayName: (model: string) => `Display ${model}`,
}));

vi.mock('../../../bottom_menu/BottomMenuAlertPopover', () => ({
  default: () => null,
}));

vi.mock('../../../ui/dropdown-menu', () => ({
  DropdownMenu: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="model-menu" data-open={open}>
      <button onClick={() => onOpenChange(true)}>Open model menu</button>
      {children}
    </div>
  ),
  DropdownMenuTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  DropdownMenuContent: ({
    children,
    onCloseAutoFocus,
  }: {
    children: React.ReactNode;
    onCloseAutoFocus?: (event: Pick<Event, 'preventDefault'>) => void;
  }) => (
    <div>
      <button onClick={() => onCloseAutoFocus?.({ preventDefault: mockPreventCloseAutoFocus })}>
        Complete model menu close
      </button>
      {children}
    </div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => <button onClick={onSelect}>{children}</button>,
  DropdownMenuSeparator: () => null,
}));

vi.mock('../subcomponents/SwitchModelModal', () => ({
  SwitchModelModal: () => <div data-testid="switch-model-modal" />,
}));

vi.mock('../../localInference/ModelSettingsPanel', () => ({
  ModelSettingsPanel: () => null,
}));

vi.mock('../../../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ModelsBottomBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentModel = 'config-model';
    mockCurrentProvider = 'config-provider';
    mockGetProviders.mockResolvedValue([]);
  });

  it('shows a loading placeholder while the active session model is still loading', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={vi.fn()}
        onModelChanged={mockOnModelChanged}
        sessionLoaded={false}
      />
    );

    expect(screen.getByTestId('model-loading-state')).toHaveTextContent('Loading model...');
  });

  it('shows the active session model once the session has loaded', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={vi.fn()}
        sessionModel="session-model"
        sessionProvider="session-provider"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    expect(screen.getByText('session-model')).toBeInTheDocument();
    expect(screen.queryByTestId('model-loading-state')).not.toBeInTheDocument();
  });

  it('shows the configured model when there is no active session', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId={null}
        dropdownRef={createDropdownRef()}
        setView={vi.fn()}
        onModelChanged={mockOnModelChanged}
      />
    );

    expect(screen.getByText('config-model')).toBeInTheDocument();
    expect(screen.queryByTestId('model-loading-state')).not.toBeInTheDocument();
  });

  it('uses the Chinese model label for visible, accessible, and tooltip text', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ModelsBottomBar
          sessionId={null}
          dropdownRef={createDropdownRef()}
          setView={vi.fn()}
          onModelChanged={mockOnModelChanged}
        />
      </IntlProvider>
    );

    expect(screen.getByText('模型')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模型' })).toHaveAttribute('title', '模型');
  });

  it('hides the visible model label in narrow toolbars while preserving its accessible name', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ModelsBottomBar
          sessionId={null}
          dropdownRef={createDropdownRef()}
          setView={vi.fn()}
          onModelChanged={mockOnModelChanged}
          isNarrow
        />
      </IntlProvider>
    );

    expect(screen.queryByText('模型')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模型' })).toHaveAttribute('title', '模型');
  });

  it('opens model overlays after the menu closes with the appropriate focus behavior', () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={vi.fn()}
        sessionModel="local-model"
        sessionProvider="local"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open model menu' }));
    expect(screen.getByTestId('model-menu')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Local Model Settings' }));
    expect(screen.getByTestId('model-menu')).toHaveAttribute('data-open', 'false');
    expect(
      screen.queryByRole('heading', { name: 'Local Model Settings — Display local-model' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete model menu close' }));
    expect(
      screen.getByRole('heading', { name: 'Local Model Settings — Display local-model' })
    ).toBeInTheDocument();
    expect(mockPreventCloseAutoFocus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open model menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change Model' }));
    expect(screen.getByTestId('model-menu')).toHaveAttribute('data-open', 'false');
    expect(screen.queryByTestId('switch-model-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete model menu close' }));
    expect(screen.getByTestId('switch-model-modal')).toBeInTheDocument();
    expect(mockPreventCloseAutoFocus).toHaveBeenCalledOnce();
  });
});
