import React from 'react';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCatalog from '../i18n/messages/zh-CN.json';
import Hub from './Hub';

vi.mock('./ChatInput', () => ({ default: () => null }));
vi.mock('./ChatInputCard', () => ({
  CHAT_INPUT_MAX_WIDTH_CLASS: 'max-w-4xl',
  ChatInputCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./ConfigContext', () => ({ useConfig: () => ({ extensionsList: [] }) }));
vi.mock('./LoadingAIBuddy', () => ({ default: () => null }));
vi.mock('../sessions', () => ({ createSession: vi.fn() }));
vi.mock('../utils/workingDir', () => ({
  getInitialWorkingDir: () => '/workspace',
  getEffectiveWorkingDir: () => Promise.resolve('/workspace'),
}));

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

describe('Hub', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const renderMorningHub = () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 27, 9, 0));

    return render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <Hub setView={vi.fn()} draftRef={{ current: '' }} />
      </IntlProvider>
    );
  };

  it('adds the Guanglin assistant identity to the AIBuddy morning greeting', () => {
    renderMorningHub();

    expect(screen.getByText('早上好，我是广林AI助手')).toBeInTheDocument();
    expect(screen.getByText('早上好，我是广林AI助手').parentElement).toHaveClass(
      'w-full',
      'max-w-4xl'
    );
  });
});
