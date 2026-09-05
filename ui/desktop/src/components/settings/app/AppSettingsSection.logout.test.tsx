import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { IntlProvider } from 'react-intl';
import AppSettingsSection from './AppSettingsSection';

vi.mock('../../../utils/analytics', () => ({ trackSettingToggled: vi.fn() }));
vi.mock('../../GooseSidebar/ThemeSelector', () => ({ default: () => null }));

const clearLoginCredentials = vi.fn();
const refreshAuthSession = vi.fn();

const electronMock = {
  clearLoginCredentials,
  refreshAuthSession,
  getSetting: vi.fn().mockResolvedValue(undefined),
  getMenuBarIconState: vi.fn().mockResolvedValue(true),
  getWakelockState: vi.fn().mockResolvedValue(true),
  getDockIconState: vi.fn().mockResolvedValue(true),
  platform: 'win32',
};
const appConfigMock = { get: vi.fn().mockReturnValue(undefined) };

function renderWith(ui: React.ReactElement) {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={ui} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </IntlProvider>
  );
}

describe('AppSettingsSection 退出登录', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { electron: typeof electronMock }).electron = electronMock;
    (window as unknown as { appConfig: typeof appConfigMock }).appConfig = appConfigMock;
  });

  it('确认退出后清凭证并刷新认证会话', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWith(<AppSettingsSection />);
    await userEvent.click(screen.getByRole('button', { name: /退出登录/ }));
    await waitFor(() => {
      expect(clearLoginCredentials).toHaveBeenCalled();
      expect(refreshAuthSession).toHaveBeenCalled();
    });
  });

  // 应用不再自带更新通道，设置页必须只剩版本展示，不能留下形同虚设的更新入口
  it('只展示版本信息，不再渲染更新区块', () => {
    renderWith(<AppSettingsSection />);

    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.queryByText('Updates')).not.toBeInTheDocument();
  });

  it('取消确认则不清凭证、不刷新认证会话', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWith(<AppSettingsSection />);
    await userEvent.click(screen.getByRole('button', { name: /退出登录/ }));
    expect(clearLoginCredentials).not.toHaveBeenCalled();
    expect(refreshAuthSession).not.toHaveBeenCalled();
  });
});
