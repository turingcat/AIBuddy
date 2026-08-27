import React from 'react';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCatalog from '../i18n/messages/zh-CN.json';
import Hub from './Hub';

vi.mock('./ChatInput', () => ({ default: () => null }));
vi.mock('./ChatInputCard', () => ({
  ChatInputCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./ConfigContext', () => ({ useConfig: () => ({ extensionsList: [] }) }));
vi.mock('./LoadingGoose', () => ({ default: () => null }));
vi.mock('../sessions', () => ({ createSession: vi.fn() }));
vi.mock('../utils/workingDir', () => ({ getInitialWorkingDir: () => '/workspace' }));

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

describe('Hub', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the Guanglin assistant identity to the morning greeting', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 27, 9, 0));

    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <Hub setView={vi.fn()} />
      </IntlProvider>
    );

    expect(screen.getByText('早上好，我是广林AI助手')).toBeInTheDocument();
  });
});
