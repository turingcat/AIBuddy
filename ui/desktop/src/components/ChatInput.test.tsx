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
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));

vi.mock('../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    ...audioRecorderState,
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
vi.mock('./GitBranchIndicator', () => ({ GitBranchIndicator: () => null }));
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
    audioRecorderState.startRecording.mockReset();
    audioRecorderState.stopRecording.mockReset();
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
    const attachButton = screen.getByRole('button', { name: '附件' });
    expect(attachButton).toHaveClass('text-xs', 'mr-1');
    expect(attachButton).not.toHaveClass('w-8', 'rounded-full');
    expect(screen.getByText('发送')).toBeInTheDocument();
    const sendButton = screen.getByRole('button', { name: '发送' });
    expect(sendButton).toBeInTheDocument();
    expect(sendButton).toHaveClass('text-sm');
    expect(sendButton).not.toHaveClass('text-xs');
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

    const diagnosticsButton = screen.getByRole('button', { name: '诊断' });
    const voiceButton = screen.getByRole('button', { name: '语音输入' });
    expect(diagnosticsButton).toHaveTextContent('诊断');
    expect(voiceButton).toHaveTextContent('语音');
    expect(diagnosticsButton).toHaveClass('text-xs');
    expect(voiceButton).toHaveClass('text-xs');
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

  it('keeps the transcribing voice control accessible without triggering recording actions', async () => {
    const user = userEvent.setup();
    audioRecorderState.isEnabled = true;
    audioRecorderState.dictationProvider = 'test';
    audioRecorderState.isTranscribing = true;

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

    const voiceButton = screen.getByRole('button', { name: '转写中…' });
    expect(voiceButton).not.toBeDisabled();
    expect(voiceButton).toHaveAttribute('aria-disabled', 'true');
    voiceButton.focus();
    expect(voiceButton).toHaveFocus();
    await user.hover(voiceButton);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('转写中…');
    await user.click(voiceButton);
    expect(audioRecorderState.startRecording).not.toHaveBeenCalled();
    expect(audioRecorderState.stopRecording).not.toHaveBeenCalled();
  });

  it('uses localized recording aria and tooltip copy in a narrow toolbar', async () => {
    const user = userEvent.setup();
    audioRecorderState.isEnabled = true;
    audioRecorderState.dictationProvider = 'test';
    audioRecorderState.isRecording = true;

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

    const voiceButton = screen.getByRole('button', { name: '停止录音' });
    await user.hover(voiceButton);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('停止录音');
    await user.click(voiceButton);
    expect(audioRecorderState.stopRecording).toHaveBeenCalledOnce();
    expect(audioRecorderState.startRecording).not.toHaveBeenCalled();
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

    const stopButton = screen.getByRole('button', { name: '停止' });
    expect(stopButton).toHaveTextContent('停止');
    expect(stopButton).toHaveClass('text-sm');
    expect(stopButton).not.toHaveClass('text-xs');

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
