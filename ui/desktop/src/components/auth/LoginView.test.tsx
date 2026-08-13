import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('../../acp/providers', () => ({ acpListProviderDetails: vi.fn().mockResolvedValue([]) }));

const setLoginCredentials = vi.fn();

vi.mock('../../login', () => ({
  login: vi.fn().mockResolvedValue({
    token: 'access-token-sample',
    baseUrl: 'http://localhost:3001/v1',
    apiKey: 'sk-sample-key',
  }),
}));

import LoginView from './LoginView';
import { login } from '../../login';

describe('LoginView OA 登录', () => {
  it('提交后以 login_name/password 调用 login，写凭证并跳转 /', async () => {
    window.electron.setLoginCredentials = setLoginCredentials;
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/" element={<div>main</div>} />
        </Routes>
      </MemoryRouter>,
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
      expect(screen.getByText('main')).toBeInTheDocument();
    });
  });
});
