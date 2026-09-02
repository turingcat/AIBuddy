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
 * 额度耗尽通知单测："充值额度"按钮打开应用内充值弹窗事件，不再走外部充值链接。
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

  it('C1: 无 top_up_url 也渲染按钮，点击派发应用内充值事件', async () => {
    const listener = vi.fn();
    window.addEventListener(AppEvents.OPEN_RECHARGE_DIALOG, listener);

    renderNotification(notification());
    await userEvent.setup().click(screen.getByRole('button', { name: /Add credits/ }));

    expect(listener).toHaveBeenCalled();
    expect(electronMock.openExternal).not.toHaveBeenCalled();
    window.removeEventListener(AppEvents.OPEN_RECHARGE_DIALOG, listener);
  });

  it('C2: 有 top_up_url 时也走应用内充值（不打开外部链接）', async () => {
    const listener = vi.fn();
    window.addEventListener(AppEvents.OPEN_RECHARGE_DIALOG, listener);

    renderNotification(notification({ top_up_url: 'https://example.com/topup' }));
    await userEvent.setup().click(screen.getByRole('button', { name: /Add credits/ }));

    expect(listener).toHaveBeenCalled();
    expect(electronMock.openExternal).not.toHaveBeenCalled();
    window.removeEventListener(AppEvents.OPEN_RECHARGE_DIALOG, listener);
  });
});
