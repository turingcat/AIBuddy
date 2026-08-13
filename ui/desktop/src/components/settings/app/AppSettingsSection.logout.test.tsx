import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { IntlProvider } from 'react-intl';
import AppSettingsSection from './AppSettingsSection';

vi.mock('../../../updates', () => ({ COST_TRACKING_ENABLED: false, UPDATES_ENABLED: false }));
vi.mock('../../../utils/analytics', () => ({ trackSettingToggled: vi.fn() }));
vi.mock('../../GooseSidebar/ThemeSelector', () => ({ default: () => null }));
vi.mock('./TelemetrySettings', () => ({ default: () => null }));
vi.mock('./UpdateSection', () => ({ default: () => null }));

const clearLoginCredentials = vi.fn();

function renderWith(ui: React.ReactElement) {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={ui} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </IntlProvider>,
  );
}

describe('AppSettingsSection 退出登录', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).electron = {
      clearLoginCredentials,
      getSetting: vi.fn().mockResolvedValue(undefined),
      getMenuBarIconState: vi.fn().mockResolvedValue(true),
      getWakelockState: vi.fn().mockResolvedValue(true),
      getDockIconState: vi.fn().mockResolvedValue(true),
      platform: 'win32',
    };
    (window as any).appConfig = { get: vi.fn().mockReturnValue(undefined) };
  });

  it('确认退出后清凭证并跳 /login', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWith(<AppSettingsSection />);
    await userEvent.click(screen.getByRole('button', { name: /退出登录/ }));
    await waitFor(() => {
      expect(clearLoginCredentials).toHaveBeenCalled();
      expect(screen.getByText('login page')).toBeInTheDocument();
    });
  });

  it('取消确认则不清凭证、不跳转', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWith(<AppSettingsSection />);
    await userEvent.click(screen.getByRole('button', { name: /退出登录/ }));
    expect(clearLoginCredentials).not.toHaveBeenCalled();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });
});
