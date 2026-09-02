import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';
import zhCatalog from '../i18n/messages/zh-CN.json';

vi.mock('./ChatInput', () => ({ default: () => null }));
vi.mock('./ChatInputCard', () => ({ CHAT_INPUT_MAX_WIDTH_CLASS: 'max-w-4xl', ChatInputCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./ConfigContext', () => ({ useConfig: () => ({ extensionsList: [] }) }));
vi.mock('./LoadingGoose', () => ({ default: () => null }));
vi.mock('../sessions', () => ({ createSession: vi.fn() }));
vi.mock('../utils/workingDir', () => ({ getInitialWorkingDir: () => '/workspace', getEffectiveWorkingDir: () => Promise.resolve('/workspace') }));

import Hub from './Hub';

const zhMessages = Object.fromEntries(Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage]));

describe('Hub', () => {
  it('uses the AIBuddy assistant identity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 27, 9, 0));
    render(<IntlProvider locale="zh-CN" messages={zhMessages}><Hub setView={vi.fn()} /></IntlProvider>);

    expect(screen.getByText('早上好，我是AIBuddy')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
