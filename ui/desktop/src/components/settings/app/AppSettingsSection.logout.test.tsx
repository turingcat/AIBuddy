import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { IntlProvider } from 'react-intl';
import AppSettingsSection from './AppSettingsSection';

vi.mock('../../../utils/analytics', () => ({ trackSettingToggled: vi.fn() }));
vi.mock('../../HeyBuddySidebar/ThemeSelector', () => ({ default: () => null }));

const clearLoginCredentials = vi.fn();
const refreshAuthSession = vi.fn();

const electronMock = {
  clearLoginCredentials,
  refreshAuthSession,
  getSetting: vi.fn().mockResolvedValue(undefined),
  getMenuBarIconState: vi.fn().mockResolvedValue(true),
  getWakelockState: vi.fn().mockResolvedValue(true),
  getDockIconState: vi.fn().mockResolvedValue(true),
  setSetting: vi.fn().mockResolvedValue(undefined),
  setMenuBarIcon: vi.fn().mockResolvedValue(true),
  setWakelock: vi.fn().mockResolvedValue(true),
  setDockIcon: vi.fn().mockResolvedValue(true),
  openNotificationsSettings: vi.fn().mockResolvedValue(undefined),
  reloadApp: vi.fn(),
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
    electronMock.getSetting.mockResolvedValue(undefined);
    electronMock.getMenuBarIconState.mockResolvedValue(true);
    electronMock.getWakelockState.mockResolvedValue(true);
    electronMock.getDockIconState.mockResolvedValue(true);
    electronMock.setMenuBarIcon.mockResolvedValue(true);
    electronMock.setWakelock.mockResolvedValue(true);
    electronMock.setDockIcon.mockResolvedValue(true);
    electronMock.openNotificationsSettings.mockResolvedValue(undefined);
    electronMock.platform = 'win32';
    appConfigMock.get.mockReturnValue(undefined);
    document.documentElement.classList.remove('dark');
    (window as unknown as { electron: typeof electronMock }).electron = electronMock;
    (window as unknown as { appConfig: typeof appConfigMock }).appConfig = appConfigMock;
  });

  it('uses AIBuddy account copy and issue links', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWith(<AppSettingsSection />);

    expect(screen.getByText('退出当前登录的 AIBuddy 账号')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Report a Bug' }));
    expect(open).toHaveBeenLastCalledWith(
      'https://github.com/turingcat/AIBuddy/issues/new?template=bug_report.md',
      '_blank'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Request a Feature' }));
    expect(open).toHaveBeenLastCalledWith(
      'https://github.com/turingcat/AIBuddy/issues/new?template=feature_request.md',
      '_blank'
    );
  });

  it('updates notification, menu bar, and wakelock settings', async () => {
    renderWith(<AppSettingsSection />);
    const switches = await screen.findAllByRole('switch');

    await userEvent.click(switches[0]);
    await userEvent.click(switches[1]);
    await userEvent.click(switches[2]);

    expect(electronMock.setSetting).toHaveBeenCalledWith('enableNotifications', false);
    expect(electronMock.setMenuBarIcon).toHaveBeenCalledWith(false);
    expect(electronMock.setWakelock).toHaveBeenCalledWith(false);
  });

  it('keeps a macOS app reachable when hiding its last visible icon', async () => {
    electronMock.platform = 'darwin';
    electronMock.getMenuBarIconState.mockResolvedValue(false);
    electronMock.getDockIconState.mockResolvedValue(true);
    renderWith(<AppSettingsSection />);

    await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(4));
    const switches = screen.getAllByRole('switch');
    await userEvent.click(switches[2]);

    expect(electronMock.setMenuBarIcon).toHaveBeenCalledWith(true);
    expect(electronMock.setDockIcon).toHaveBeenCalledWith(false);
  });

  it('shows the dock before hiding the macOS menu bar icon', async () => {
    electronMock.platform = 'darwin';
    electronMock.getMenuBarIconState.mockResolvedValue(true);
    electronMock.getDockIconState.mockResolvedValue(false);
    renderWith(<AppSettingsSection />);

    await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(4));
    await waitFor(() =>
      expect(screen.getAllByRole('switch')[2]).toHaveAttribute('aria-checked', 'false')
    );
    await userEvent.click(screen.getAllByRole('switch')[1]);

    expect(electronMock.setDockIcon).toHaveBeenCalledWith(true);
    expect(electronMock.setMenuBarIcon).toHaveBeenCalledWith(false);
  });

  it('opens notification instructions and delegates to system settings', async () => {
    renderWith(<AppSettingsSection />);

    await userEvent.click(screen.getByText('Configuration guide'));
    expect(screen.getByText('To enable notifications on Windows:')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);

    await userEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(electronMock.openNotificationsSettings).toHaveBeenCalled();
  });

  it('shows macOS notification instructions and the configured version theme', async () => {
    electronMock.platform = 'darwin';
    appConfigMock.get.mockImplementation((key: string) =>
      key === 'GOOSE_VERSION' ? '1.2.3' : undefined
    );
    document.documentElement.classList.add('dark');
    renderWith(<AppSettingsSection />);

    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Block Logo' }).getAttribute('src')).toContain(
      'block-lockup_white'
    );
    await userEvent.click(screen.getByText('Configuration guide'));
    expect(screen.getByText('To enable notifications on macOS:')).toBeInTheDocument();
  });

  it('handles rejected notification-settings requests', async () => {
    const error = new Error('unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    electronMock.openNotificationsSettings.mockRejectedValue(error);
    renderWith(<AppSettingsSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('Failed to open notification settings:', error)
    );
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
