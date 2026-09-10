import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIntl } from 'react-intl';

import { logout } from './logout';

const clearLoginCredentials = vi.fn();
const refreshAuthSession = vi.fn();
const englishIntl = createIntl({ locale: 'en' });
const chineseIntl = createIntl({
  locale: 'zh-CN',
  messages: { 'accountMenu.logoutConfirmation': '确定退出登录吗？' },
});

describe('logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      window as unknown as {
        electron: {
          clearLoginCredentials: typeof clearLoginCredentials;
          refreshAuthSession: typeof refreshAuthSession;
        };
      }
    ).electron = { clearLoginCredentials, refreshAuthSession };
  });

  it('clears credentials and refreshes the auth session after logout is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await logout(englishIntl);

    expect(clearLoginCredentials).toHaveBeenCalledTimes(1);
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);
  });

  it('does not clear credentials when logout is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await logout(englishIntl);

    expect(clearLoginCredentials).not.toHaveBeenCalled();
    expect(refreshAuthSession).not.toHaveBeenCalled();
  });

  it('formats the confirmation prompt in English', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await logout(englishIntl);

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to log out?');
  });

  it('formats the confirmation prompt in Chinese', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await logout(chineseIntl);

    expect(confirm).toHaveBeenCalledWith('确定退出登录吗？');
  });
});
