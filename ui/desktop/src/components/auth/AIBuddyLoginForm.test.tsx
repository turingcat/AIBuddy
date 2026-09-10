import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIBuddyAuthResult } from '../../aibuddyAuthIpc';
import type { AIBuddySettingsResult } from '../../sub2apiAuth';
import type { AliyunCaptchaHandle } from './AliyunCaptcha';

const { saveDefaults, verifyCaptcha } = vi.hoisted(() => ({
  saveDefaults: vi.fn(),
  verifyCaptcha: vi.fn<() => Promise<string | null>>(),
}));
const getAIBuddyAuthSettings = vi.fn<() => Promise<AIBuddySettingsResult>>();
const loginViaAIBuddy = vi.fn();
const completeAIBuddy2FA = vi.fn();
const provisionAIBuddyGroup = vi.fn();
const refreshAuthSession = vi.fn();
const restartApp = vi.fn();

vi.mock('../../acp/providers', () => ({ acpSaveDefaults: saveDefaults }));
vi.mock('./AliyunCaptcha', () => ({
  default: forwardRef<AliyunCaptchaHandle>((_props, ref) => {
    useImperativeHandle(ref, () => ({ verify: verifyCaptcha, reset: vi.fn() }));
    return null;
  }),
}));

import AIBuddyLoginForm from './AIBuddyLoginForm';

const settings: AIBuddySettingsResult = {
  ok: true,
  settings: {
    aliyunCaptchaEnabled: true,
    aliyunCaptchaSceneId: 'scene-1',
    aliyunCaptchaPrefix: 'prefix-1',
    aliyunCaptchaRegion: 'cn',
    apiBaseUrl: 'https://tflow.online/v1',
  },
};

const authenticated = (firstModelId = 'tflow-first-model'): AIBuddyAuthResult => ({
  ok: true,
  step: 'authenticated',
  firstModelId,
});

describe('AIBuddyLoginForm', () => {
  beforeEach(() => {
    verifyCaptcha.mockReset();
    verifyCaptcha.mockResolvedValue('captcha-proof');
    getAIBuddyAuthSettings.mockReset();
    getAIBuddyAuthSettings.mockResolvedValue(settings);
    loginViaAIBuddy.mockReset();
    completeAIBuddy2FA.mockReset();
    provisionAIBuddyGroup.mockReset();
    refreshAuthSession.mockReset();
    restartApp.mockReset();
    saveDefaults.mockReset();
    saveDefaults.mockResolvedValue(undefined);
    window.electron.getAIBuddyAuthSettings = getAIBuddyAuthSettings;
    window.electron.loginViaAIBuddy = loginViaAIBuddy;
    window.electron.completeAIBuddy2FA = completeAIBuddy2FA;
    window.electron.provisionAIBuddyGroup = provisionAIBuddyGroup;
    window.electron.refreshAuthSession = refreshAuthSession;
    window.electron.restartApp = restartApp;
  });

  async function submitAccountLogin() {
    await userEvent.type(await screen.findByLabelText(/email/i), 'person@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
  }

  it('shows group selection without saving credentials when no grouped key exists', async () => {
    loginViaAIBuddy.mockResolvedValue({
      ok: true,
      step: 'select-group',
      pendingLoginId: 'opaque-pending-id',
      groups: [{ id: 'team-a', name: 'Team A' }],
    });
    render(<AIBuddyLoginForm />);

    await submitAccountLogin();

    expect(await screen.findByRole('heading', { name: /choose group/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/group/i)).toHaveValue('team-a');
    expect(refreshAuthSession).not.toHaveBeenCalled();
  });

  it('provisions the selected opaque login and refreshes the session without touching agent defaults', async () => {
    loginViaAIBuddy.mockResolvedValue({
      ok: true,
      step: 'select-group',
      pendingLoginId: 'opaque-pending-id',
      groups: [
        { id: 'team-a', name: 'Team A' },
        { id: 'team-b', name: 'Team B' },
      ],
    });
    provisionAIBuddyGroup.mockResolvedValue(authenticated('team-b-model'));
    render(<AIBuddyLoginForm />);

    await submitAccountLogin();
    await userEvent.selectOptions(screen.getByLabelText(/group/i), 'team-b');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(provisionAIBuddyGroup).toHaveBeenCalledWith('opaque-pending-id', 'team-b');
      expect(refreshAuthSession).toHaveBeenCalledOnce();
    });
  });

  // 登录时运行中的后端还没有 AIBUDDY_* 环境变量，此刻写默认 provider 会被后端以
  // invalid_params 拒绝，登录界面只会显示 "Invalid params"。默认模型必须留到刷新认证会话之后。
  it('refreshes the session without writing agent defaults while the provider is still unconfigured', async () => {
    loginViaAIBuddy.mockResolvedValue(authenticated());
    render(<AIBuddyLoginForm />);

    await submitAccountLogin();

    await waitFor(() => {
      expect(refreshAuthSession).toHaveBeenCalledOnce();
    });
    expect(saveDefaults).not.toHaveBeenCalled();
    expect(restartApp).not.toHaveBeenCalled();
  });

  it('waits for session refresh before allowing another submission', async () => {
    loginViaAIBuddy.mockResolvedValue(authenticated());
    let completeRefresh!: () => void;
    refreshAuthSession.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeRefresh = resolve;
        })
    );
    render(<AIBuddyLoginForm />);

    await submitAccountLogin();
    expect(refreshAuthSession).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /login/i })).toBeDisabled();
    expect(restartApp).not.toHaveBeenCalled();

    completeRefresh();
    await waitFor(() => expect(screen.getByRole('button', { name: /login/i })).toBeEnabled());
  });

  it('shows session refresh errors without relaunching the app', async () => {
    loginViaAIBuddy.mockResolvedValue(authenticated());
    refreshAuthSession.mockRejectedValueOnce(new Error('Session refresh failed'));
    render(<AIBuddyLoginForm />);

    await submitAccountLogin();
    expect(await screen.findByRole('alert')).toHaveTextContent('Session refresh failed');
    expect(screen.getByRole('button', { name: /login/i })).toBeEnabled();
    expect(restartApp).not.toHaveBeenCalled();
  });

  it('completes TOTP authentication and refreshes into the provisioned session', async () => {
    loginViaAIBuddy.mockResolvedValue({
      ok: true,
      step: 'totp-required',
      tempToken: 'temporary-token',
      maskedEmail: 'p***@example.com',
    });
    completeAIBuddy2FA.mockResolvedValue(authenticated('totp-model'));
    render(<AIBuddyLoginForm />);

    await submitAccountLogin();
    await userEvent.type(await screen.findByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(completeAIBuddy2FA).toHaveBeenCalledWith('temporary-token', '123456');
      expect(refreshAuthSession).toHaveBeenCalledOnce();
    });
  });

  it('keeps account login disabled when public sign-in settings cannot load', async () => {
    getAIBuddyAuthSettings.mockResolvedValue({ ok: false, message: 'Settings unavailable' });
    render(<AIBuddyLoginForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Settings unavailable');
    expect(screen.getByRole('button', { name: /login/i })).toBeDisabled();
  });

  it('keeps the group step and shows a pending-login expiry error', async () => {
    loginViaAIBuddy.mockResolvedValue({
      ok: true,
      step: 'select-group',
      pendingLoginId: 'expired-id',
      groups: [{ id: 'team-a', name: 'Team A' }],
    });
    provisionAIBuddyGroup.mockResolvedValue({ ok: false, message: '登录状态已过期，请重新登录' });
    render(<AIBuddyLoginForm />);

    await submitAccountLogin();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('登录状态已过期');
    expect(screen.getByRole('heading', { name: /choose group/i })).toBeInTheDocument();
  });
});
