import { act, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCatalog from '../i18n/messages/zh-CN.json';

const mocks = vi.hoisted(() => ({
  chatInputProps: null as Record<string, unknown> | null,
  createSession: vi.fn(),
  getEffectiveWorkingDir: vi.fn(() => Promise.resolve('/workspace')),
  toastError: vi.fn(),
}));

vi.mock('./ChatInput', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.chatInputProps = props;
    return null;
  },
}));
vi.mock('./ChatInputCard', () => ({
  CHAT_INPUT_MAX_WIDTH_CLASS: 'max-w-4xl',
  ChatInputCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./ConfigContext', () => ({ useConfig: () => ({ extensionsList: [] }) }));
vi.mock('./LoadingAIBuddy', () => ({ default: () => null }));
vi.mock('../sessions', () => ({ createSession: mocks.createSession }));
vi.mock('../utils/workingDir', () => ({
  getInitialWorkingDir: () => '/workspace',
  getEffectiveWorkingDir: mocks.getEffectiveWorkingDir,
}));
vi.mock('../toasts', () => ({ toastError: mocks.toastError }));

import Hub from './Hub';

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

function renderHub(setView = vi.fn()) {
  render(
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      <Hub setView={setView} />
    </IntlProvider>
  );
  return setView;
}

describe('Hub', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.chatInputProps = null;
  });

  it('uses the AIBuddy assistant identity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 27, 9, 0));
    renderHub();

    expect(screen.getByText('早上好，我是AIBuddy')).toBeInTheDocument();
    expect(screen.queryByText(/AIBuddy|广林 AI 助手/)).not.toBeInTheDocument();
  });

  it.each([
    { hour: 13, greeting: '下午好，我是AIBuddy' },
    { hour: 20, greeting: '晚上好，我是AIBuddy' },
  ])('uses the AIBuddy identity at $hour:00', ({ hour, greeting }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 27, hour, 0));
    renderHub();

    expect(screen.getByText(greeting)).toBeInTheDocument();
  });

  it('ignores empty submissions', async () => {
    renderHub();

    await act(async () => {
      await (mocks.chatInputProps?.handleSubmit as (input: unknown) => Promise<void>)({
        msg: '   ',
        images: [],
      });
    });

    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('creates a session and opens the pair view', async () => {
    mocks.createSession.mockResolvedValue({ id: 'session-1' });
    const setView = renderHub();

    await act(async () => {
      await (mocks.chatInputProps?.handleSubmit as (input: unknown) => Promise<void>)({
        msg: 'hello',
        images: [],
      });
    });

    expect(mocks.createSession).toHaveBeenCalledWith('/workspace', { allExtensions: [] });
    expect(setView).toHaveBeenCalledWith('pair', {
      disableAnimation: true,
      resumeSessionId: 'session-1',
      initialMessage: { msg: 'hello', images: [] },
    });
  });

  it('uses an explicitly selected working directory', async () => {
    mocks.createSession.mockResolvedValue({ id: 'session-2' });
    renderHub();

    act(() => {
      (mocks.chatInputProps?.onWorkingDirChange as (dir: string) => void)('/picked');
    });
    await act(async () => {
      await (mocks.chatInputProps?.handleSubmit as (input: unknown) => Promise<void>)({
        msg: '',
        images: ['image-data'],
      });
    });

    expect(mocks.createSession).toHaveBeenCalledWith('/picked', { allExtensions: [] });
  });

  it('reports session creation failures and returns to idle', async () => {
    const error = new Error('session failed');
    mocks.createSession.mockRejectedValue(error);
    renderHub();

    await act(async () => {
      await (mocks.chatInputProps?.handleSubmit as (input: unknown) => Promise<void>)({
        msg: 'hello',
        images: [],
      });
    });

    expect(mocks.toastError).toHaveBeenCalled();
    expect(mocks.chatInputProps?.chatState).toBe('idle');
  });
});
