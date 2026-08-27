import { act, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zhCatalog from '../i18n/messages/zh-CN.json';
import { ChatState } from '../types/chatState';
import ChatInput from './ChatInput';

vi.mock('./ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    currentModel: 'model',
    currentProvider: 'provider',
    getCurrentModelAndProvider: vi.fn().mockResolvedValue({ model: 'model', provider: 'provider' }),
  }),
}));
vi.mock('../acp/providers', () => ({ acpListProviderDetails: vi.fn().mockResolvedValue([]) }));

const audioRecorderState = vi.hoisted(() => ({
  isEnabled: false,
  dictationProvider: null as string | null,
  isRecording: false,
  isTranscribing: false,
}));

vi.mock('../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    ...audioRecorderState,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));
vi.mock('./alerts', () => ({
  AlertType: { Error: 'error', Warning: 'warning', Info: 'info' },
  useAlerts: () => ({ alerts: [], addAlert: vi.fn(), clearAlerts: vi.fn() }),
}));
vi.mock('../hooks/useFileDrop', () => ({
  useFileDrop: () => ({
    droppedFiles: [],
    setDroppedFiles: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
  }),
}));
vi.mock('../utils/workingDir', () => ({ getInitialWorkingDir: () => '/workspace' }));
vi.mock('./settings/models/predefinedModelsUtils', () => ({
  getPredefinedModelsFromEnv: () => [],
}));
vi.mock('../utils/canonical', () => ({ fetchCanonicalModelInfo: vi.fn().mockResolvedValue(null) }));
vi.mock('./MentionPopover', () => ({ default: () => null }));
vi.mock('./MessageQueue', () => ({ MessageQueue: () => null }));
vi.mock('./bottom_menu/DirSwitcher', () => ({ DirSwitcher: () => <span>目录</span> }));
vi.mock('./bottom_menu/ContextWindowIndicator', () => ({
  ContextWindowIndicator: () => <span>上下文</span>,
}));
vi.mock('./bottom_menu/BottomMenuExtensionSelection', () => ({
  BottomMenuExtensionSelection: () => <span>扩展</span>,
}));
vi.mock('./settings/models/bottom_bar/ModelsBottomBar', () => ({
  default: ({ isNarrow }: { isNarrow: boolean }) => (
    <button aria-label="模型">{!isNarrow && '模型'}</button>
  ),
}));

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

let resizeObserverCallback: ResizeObserverCallback | undefined;

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

describe('ChatInput toolbar', () => {
  beforeEach(() => {
    audioRecorderState.isEnabled = false;
    audioRecorderState.dictationProvider = null;
    audioRecorderState.isRecording = false;
    audioRecorderState.isTranscribing = false;
    resizeObserverCallback = undefined;
  });

  it('shows accessible Chinese attachment and send labels in the wide toolbar', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ChatInput
          sessionId={null}
          handleSubmit={vi.fn()}
          chatState={ChatState.Idle}
          setView={vi.fn()}
        />
      </IntlProvider>
    );

    expect(screen.getByText('附件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '附件' })).toBeInTheDocument();
    expect(screen.getByText('发送')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument();
  });

  it('keeps only accessible model and send controls in a narrow toolbar', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ChatInput
          sessionId={null}
          handleSubmit={vi.fn()}
          chatState={ChatState.Idle}
          setView={vi.fn()}
        />
      </IntlProvider>
    );

    act(() => {
      resizeObserverCallback?.(
        [{ contentRect: { width: 479 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    expect(screen.queryByText('目录')).not.toBeInTheDocument();
    expect(screen.queryByText('上下文')).not.toBeInTheDocument();
    expect(screen.queryByText('扩展')).not.toBeInTheDocument();
    expect(screen.queryByText('附件')).not.toBeInTheDocument();
    expect(screen.queryByText('模型')).not.toBeInTheDocument();
    expect(screen.queryByText('发送')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模型' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument();
  });

  it('shows localized diagnostics and voice labels in a wide toolbar', () => {
    audioRecorderState.isEnabled = true;
    audioRecorderState.dictationProvider = 'test';

    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ChatInput
          sessionId="session-id"
          handleSubmit={vi.fn()}
          chatState={ChatState.Idle}
          setView={vi.fn()}
        />
      </IntlProvider>
    );

    expect(screen.getByRole('button', { name: '诊断' })).toHaveTextContent('诊断');
    expect(screen.getByRole('button', { name: '语音输入' })).toHaveTextContent('语音');
  });

  it('uses localized voice state labels and tooltips in a narrow toolbar', async () => {
    const user = userEvent.setup();
    audioRecorderState.dictationProvider = 'test';

    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ChatInput
          sessionId={null}
          handleSubmit={vi.fn()}
          chatState={ChatState.Idle}
          setView={vi.fn()}
        />
      </IntlProvider>
    );

    act(() => {
      resizeObserverCallback?.(
        [{ contentRect: { width: 479 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    const voiceButton = screen.getByRole('button', { name: '语音输入未配置（设置）' });
    expect(voiceButton).not.toHaveTextContent('语音');
    await user.hover(voiceButton);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('语音输入未配置（设置）');
  });

  it('shows a localized stop label wide and keeps it accessible when narrow', () => {
    const { rerender } = render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ChatInput
          sessionId={null}
          handleSubmit={vi.fn()}
          chatState={ChatState.Streaming}
          onStop={vi.fn()}
          setView={vi.fn()}
        />
      </IntlProvider>
    );

    expect(screen.getByRole('button', { name: '停止' })).toHaveTextContent('停止');

    act(() => {
      resizeObserverCallback?.(
        [{ contentRect: { width: 479 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });
    rerender(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ChatInput
          sessionId={null}
          handleSubmit={vi.fn()}
          chatState={ChatState.Streaming}
          onStop={vi.fn()}
          setView={vi.fn()}
        />
      </IntlProvider>
    );

    expect(screen.getByRole('button', { name: '停止' })).not.toHaveTextContent('停止');
  });
});
