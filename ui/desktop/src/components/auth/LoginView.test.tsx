import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('../../acp/providers', () => ({ acpListProviderDetails: vi.fn().mockResolvedValue([]) }));

const setLoginCredentials = vi.fn();

vi.mock('../../stubLogin', () => ({
  stubLogin: vi.fn().mockResolvedValue({
    token: 'stub-token',
    baseUrl: 'https://stub-gw/v1',
    apiKey: 'stub-key',
  }),
}));

import LoginView from './LoginView';

describe('LoginView 桩登录', () => {
  it('提交后写凭证并跳转 /', async () => {
    window.electron.setLoginCredentials = setLoginCredentials;
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/" element={<div>main</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/account/i), 'alice');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    await waitFor(() => {
      expect(setLoginCredentials).toHaveBeenCalledWith({
        token: 'stub-token',
        baseUrl: 'https://stub-gw/v1',
        apiKey: 'stub-key',
      });
      expect(screen.getByText('main')).toBeInTheDocument();
    });
  });
});
