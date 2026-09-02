import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { CreditsExhaustedNotification } from './CreditsExhaustedNotification';
import { AppEvents } from '../../constants/events';
import type { SystemNotificationContent } from '../../types/message';

/**
 * @author logic
 * @date 2026-09-02
 * 额度耗尽通知单测：HeyBuddy 版"充值额度"按钮改为打开应用内充值弹窗事件；
 * 其余版本维持打开外部充值链接（含 URL 协议校验与无链接时不渲染按钮）。
 */

const electronMock = window.electron as unknown as {
  openExternal: ReturnType<typeof vi.fn>;
};

function notification(data?: unknown): SystemNotificationContent {
  return { notificationType: 'creditsExhausted', msg: '额度已用尽', data };
}

function renderNotification(content: SystemNotificationContent) {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <CreditsExhaustedNotification notification={content} />
    </IntlProvider>
  );
}

describe('CreditsExhaustedNotification（额度耗尽充值入口）', () => {
  beforeEach(() => {
    electronMock.openExternal = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('C1: HeyBuddy 版无 top_up_url 也渲染按钮，点击派发应用内充值事件', async () => {
    const listener = vi.fn();
    window.addEventListener(AppEvents.OPEN_RECHARGE_DIALOG, listener);

    renderNotification(notification());
    await userEvent.setup().click(screen.getByRole('button', { name: /Add credits/ }));

    expect(listener).toHaveBeenCalled();
    expect(electronMock.openExternal).not.toHaveBeenCalled();
    window.removeEventListener(AppEvents.OPEN_RECHARGE_DIALOG, listener);
  });

  it('C2: HeyBuddy 版有 top_up_url 时也走应用内充值（不打开外部链接）', async () => {
    const listener = vi.fn();
    window.addEventListener(AppEvents.OPEN_RECHARGE_DIALOG, listener);

    renderNotification(notification({ top_up_url: 'https://example.com/topup' }));
    await userEvent.setup().click(screen.getByRole('button', { name: /Add credits/ }));

    expect(listener).toHaveBeenCalled();
    expect(electronMock.openExternal).not.toHaveBeenCalled();
    window.removeEventListener(AppEvents.OPEN_RECHARGE_DIALOG, listener);
  });

  it('C3: 其他版本有合法 top_up_url 时打开外部链接', async () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');

    renderNotification(notification({ top_up_url: 'https://example.com/topup' }));
    await userEvent.setup().click(screen.getByRole('button', { name: /Add credits/ }));

    expect(electronMock.openExternal).toHaveBeenCalledWith('https://example.com/topup');
  });

  it('C4: 其他版本无 top_up_url 时不渲染按钮；非法协议的链接按无链接处理', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');

    const { rerender } = renderNotification(notification());
    expect(screen.queryByRole('button', { name: /Add credits/ })).toBeNull();

    rerender(
      <IntlProvider locale="en" onError={() => {}}>
        <CreditsExhaustedNotification
          notification={notification({ top_up_url: 'javascript:alert(1)' })}
        />
      </IntlProvider>
    );
    expect(screen.queryByRole('button', { name: /Add credits/ })).toBeNull();
  });

  it('C5: top_up_url 为非对象数据/非字符串/空白/无法解析的值时均按无链接处理', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');

    const invalidPayloads: unknown[] = [
      'not-an-object',
      { top_up_url: 12345 },
      { top_up_url: '' },
      { top_up_url: '   ' },
      { top_up_url: '::not a url::' },
    ];

    const { rerender } = renderNotification(notification(invalidPayloads[0]));
    for (const payload of invalidPayloads.slice(1)) {
      rerender(
        <IntlProvider locale="en" onError={() => {}}>
          <CreditsExhaustedNotification notification={notification(payload)} />
        </IntlProvider>
      );
      expect(screen.queryByRole('button', { name: /Add credits/ })).toBeNull();
    }
  });
});
