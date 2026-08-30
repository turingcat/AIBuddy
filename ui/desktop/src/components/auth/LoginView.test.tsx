import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../../acp/providers', () => ({ acpListProviderDetails: vi.fn().mockResolvedValue([]) }));

const setLoginCredentials = vi.fn();
const restartApp = vi.fn();

vi.mock('../../login', () => ({
  login: vi.fn().mockResolvedValue({
    token: 'access-token-sample',
    baseUrl: 'http://localhost:3001/v1',
    apiKey: 'sk-sample-key',
  }),
}));

vi.mock('./AIBuddyLoginForm', () => ({
  default: () => <div>AIBuddy login</div>,
}));

import LoginView from './LoginView';
import { login } from '../../login';

describe('LoginView', () => {
  beforeEach(() => {
    vi.stubEnv('APP_EDITION', 'heybuddy');
    window.electron.setLoginCredentials = setLoginCredentials;
    window.electron.restartApp = restartApp;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('keeps the HeyBuddy OA login flow and persists credentials', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/" element={<div>main</div>} />
        </Routes>
      </MemoryRouter>
    );

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
      expect(restartApp).toHaveBeenCalledOnce();
    });
  });

  it('selects the AIBuddy login flow without calling the OA login API', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');
    render(<LoginView />);

    expect(screen.getByText('AIBuddy login')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });
});
