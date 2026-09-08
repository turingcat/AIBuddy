import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../../acp/providers', () => ({ acpListProviderDetails: vi.fn().mockResolvedValue([]) }));

const setLoginCredentials = vi.fn();
const refreshAuthSession = vi.fn();

vi.mock('../../login', () => ({
  login: vi.fn().mockResolvedValue({
    token: 'access-token-sample',
    baseUrl: 'http://localhost:3001/v1',
    apiKey: 'sk-sample-key',
  }),
}));

import LoginView from './LoginView';
import { login } from '../../login';

describe('LoginView', () => {
  beforeEach(() => {
    vi.stubEnv('APP_EDITION', 'aibuddy');
    window.electron.setLoginCredentials = setLoginCredentials;
    window.electron.refreshAuthSession = refreshAuthSession;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    delete window.initAliyunCaptcha;
    delete window.AliyunCaptchaConfig;
  });

  it('keeps the AIBuddy OA login flow, original copy, and persisted credentials', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/" element={<div>main</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: '登录 AIBuddy' })).toBeInTheDocument();
    expect(screen.getByText('请使用公司OA账号登录')).toBeInTheDocument();
    expect(screen.getByText('登录名')).toBeInTheDocument();
    expect(screen.getByText('密码')).toBeInTheDocument();
    expect(screen.getByText('登录')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/login-name/i), 'seeyon6');
    await userEvent.type(screen.getByLabelText(/password/i), 'test@1234');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('seeyon6', 'test@1234');
      expect(setLoginCredentials).toHaveBeenCalledWith({
        token: 'access-token-sample',
        baseUrl: 'http://localhost:3001/v1',
        apiKey: 'sk-sample-key',
      });
      expect(refreshAuthSession).toHaveBeenCalledOnce();
    });
  });

  it('keeps the AIBuddy fallback error text', async () => {
    vi.mocked(login).mockRejectedValueOnce('failed');
    render(<LoginView />);

    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    expect(await screen.findByText('登录失败')).toBeInTheDocument();
  });
});
