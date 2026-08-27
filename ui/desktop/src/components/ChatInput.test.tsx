import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';
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
vi.mock('../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isEnabled: false,
    dictationProvider: null,
    isRecording: false,
    isTranscribing: false,
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
vi.mock('./bottom_menu/DirSwitcher', () => ({ DirSwitcher: () => null }));
vi.mock('./bottom_menu/ContextWindowIndicator', () => ({ ContextWindowIndicator: () => null }));
vi.mock('./bottom_menu/BottomMenuExtensionSelection', () => ({
  BottomMenuExtensionSelection: () => null,
}));
vi.mock('./settings/models/bottom_bar/ModelsBottomBar', () => ({ default: () => null }));

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

describe('ChatInput toolbar', () => {
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
});
