import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIBuddyAuthResult, AIBuddySettingsResult } from '../../sub2apiAuth';
import type { AliyunCaptchaHandle } from './AliyunCaptcha';

const verifyCaptcha = vi.fn<() => Promise<string | null>>();
const resetCaptcha = vi.fn();
const setLoginCredentials = vi.fn();
const restartApp = vi.fn();
const getAIBuddyAuthSettings = vi.fn<() => Promise<AIBuddySettingsResult>>();
const loginViaAIBuddy = vi.fn();
const completeAIBuddy2FA = vi.fn();

vi.mock('./AliyunCaptcha', () => ({
  default: forwardRef<AliyunCaptchaHandle, { onStateChange?: (state: string) => void }>(
    ({ onStateChange }, ref) => {
      useImperativeHandle(ref, () => ({ verify: verifyCaptcha, reset: resetCaptcha }));
      return (
        <button type="button" onClick={() => onStateChange?.('verified')}>
          Captcha
        </button>
      );
    }
  ),
}));

import AIBuddyLoginForm from './AIBuddyLoginForm';

const settings: AIBuddySettingsResult = {
  ok: true,
  settings: {
    aliyunCaptchaEnabled: true,
    aliyunCaptchaSceneId: 'scene-1',
    aliyunCaptchaPrefix: 'prefix-1',
    aliyunCaptchaRegion: 'cn',
    apiBaseUrl: 'https://api.example.com/v1',
  },
};

function authenticatedResult(): Extract<AIBuddyAuthResult, { ok: true; step: 'authenticated' }> {
  return {
    ok: true,
    step: 'authenticated',
    creds: {
      token: 'access-token-sample',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-sample-key',
    },
  };
}

describe('AIBuddyLoginForm', () => {
  beforeEach(() => {
    verifyCaptcha.mockReset();
    verifyCaptcha.mockResolvedValue('captcha-proof');
    resetCaptcha.mockReset();
    getAIBuddyAuthSettings.mockReset();
    getAIBuddyAuthSettings.mockResolvedValue(settings);
    loginViaAIBuddy.mockReset();
    completeAIBuddy2FA.mockReset();
    setLoginCredentials.mockReset();
    restartApp.mockReset();
    window.electron.getAIBuddyAuthSettings = getAIBuddyAuthSettings;
    window.electron.loginViaAIBuddy = loginViaAIBuddy;
    window.electron.completeAIBuddy2FA = completeAIBuddy2FA;
    window.electron.setLoginCredentials = setLoginCredentials;
    window.electron.restartApp = restartApp;
  });

  it('loads AIBuddy settings and submits an email login with captcha proof', async () => {
    loginViaAIBuddy.mockResolvedValue(authenticatedResult());
    render(<AIBuddyLoginForm />);

    expect(await screen.findByRole('heading', { name: 'AIBuddy' })).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(/email/i), 'person@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(verifyCaptcha).toHaveBeenCalledOnce();
      expect(loginViaAIBuddy).toHaveBeenCalledWith(
        'person@example.com',
        'password',
        'captcha-proof'
      );
      expect(setLoginCredentials).toHaveBeenCalledWith(authenticatedResult().creds);
      expect(restartApp).toHaveBeenCalledOnce();
      expect(resetCaptcha).toHaveBeenCalledOnce();
    });
  });

  it('does not call the login IPC when captcha verification has no proof', async () => {
    verifyCaptcha.mockResolvedValue(null);
    render(<AIBuddyLoginForm />);

    await userEvent.type(await screen.findByLabelText(/email/i), 'person@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/captcha/i);
    expect(loginViaAIBuddy).not.toHaveBeenCalled();
    expect(resetCaptcha).toHaveBeenCalledOnce();
  });

  it('does not start a second login while the first one is pending', async () => {
    let resolveLogin!: (result: AIBuddyAuthResult) => void;
    loginViaAIBuddy.mockReturnValue(
      new Promise<AIBuddyAuthResult>((resolve) => {
        resolveLogin = resolve;
      })
    );
    render(<AIBuddyLoginForm />);

    await userEvent.type(await screen.findByLabelText(/email/i), 'person@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password');
    const submit = screen.getByRole('button', { name: /login/i });
    await userEvent.click(submit);
    await userEvent.click(submit);

    expect(loginViaAIBuddy).toHaveBeenCalledOnce();
    resolveLogin(authenticatedResult());
    await waitFor(() => expect(restartApp).toHaveBeenCalledOnce());
  });

  it.each([
    ['cannot load auth settings', { ok: false, message: 'Settings unavailable' }],
    [
      'has incomplete Aliyun settings',
      { ok: true, settings: { ...settings.settings, aliyunCaptchaPrefix: '' } },
    ],
  ])('disables account submission when it %s', async (_description, result) => {
    getAIBuddyAuthSettings.mockResolvedValue(result as AIBuddySettingsResult);
    render(<AIBuddyLoginForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/settings|captcha/i);
    expect(screen.getByRole('button', { name: /login/i })).toBeDisabled();
  });

  it('keeps the TOTP step after an invalid code and completes it with six digits', async () => {
    loginViaAIBuddy.mockResolvedValue({
      ok: true,
      step: 'totp-required',
      tempToken: 'temporary-token',
      maskedEmail: 'p***@example.com',
    });
    completeAIBuddy2FA.mockResolvedValueOnce({ ok: false, message: 'Invalid code' });
    completeAIBuddy2FA.mockResolvedValueOnce(authenticatedResult());
    render(<AIBuddyLoginForm />);

    await userEvent.type(await screen.findByLabelText(/email/i), 'person@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    const totp = await screen.findByLabelText(/verification code/i);
    expect(totp).toHaveAttribute('maxLength', '6');
    await userEvent.type(totp, '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid code');
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/verification code/i));
    await userEvent.type(screen.getByLabelText(/verification code/i), '654321');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(completeAIBuddy2FA).toHaveBeenLastCalledWith('temporary-token', '654321');
      expect(setLoginCredentials).toHaveBeenCalledWith(authenticatedResult().creds);
      expect(restartApp).toHaveBeenCalledOnce();
    });
  });

  it('returns to account login and resets the old captcha proof', async () => {
    loginViaAIBuddy.mockResolvedValue({
      ok: true,
      step: 'totp-required',
      tempToken: 'temporary-token',
    });
    render(<AIBuddyLoginForm />);

    await userEvent.type(await screen.findByLabelText(/email/i), 'person@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    await userEvent.click(await screen.findByRole('button', { name: /back/i }));

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(resetCaptcha).toHaveBeenCalledTimes(2);
  });
});
