import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIBuddyAuthResult } from '../../aibuddyAuthIpc';
import type { Sub2apiPublicSettings } from '../../sub2apiAuth';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import AliyunCaptcha, { type AliyunCaptchaHandle } from './AliyunCaptcha';

type LoginStep =
  | { kind: 'account' }
  | { kind: 'totp'; tempToken: string; maskedEmail?: string }
  | { kind: 'select-group'; pendingLoginId: string; groups: { id: string; name: string }[] };

function captchaRegion(settings: Sub2apiPublicSettings): 'cn' | 'sgp' | null {
  if (settings.aliyunCaptchaRegion === 'cn' || settings.aliyunCaptchaRegion === 'sgp') {
    return settings.aliyunCaptchaRegion;
  }

  return null;
}

function captchaConfigIsComplete(settings: Sub2apiPublicSettings): boolean {
  return (
    settings.aliyunCaptchaEnabled &&
    Boolean(settings.aliyunCaptchaSceneId) &&
    Boolean(settings.aliyunCaptchaPrefix) &&
    captchaRegion(settings) !== null
  );
}

function settingsError(settings: Sub2apiPublicSettings): string | null {
  if (!settings.aliyunCaptchaEnabled) {
    return 'Captcha is not available for this account.';
  }

  if (!settings.aliyunCaptchaSceneId || !settings.aliyunCaptchaPrefix) {
    return 'Captcha configuration is incomplete.';
  }

  if (settings.aliyunCaptchaRegion !== 'cn' && settings.aliyunCaptchaRegion !== 'sgp') {
    return 'Captcha configuration is incomplete.';
  }

  return null;
}

export default function AIBuddyLoginForm() {
  const captchaRef = useRef<AliyunCaptchaHandle>(null);
  const captchaErrorRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [settings, setSettings] = useState<Sub2apiPublicSettings | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [step, setStep] = useState<LoginStep>({ kind: 'account' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetCaptchaWhenReady, setResetCaptchaWhenReady] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  useEffect(() => {
    let active = true;

    void window.electron.getAIBuddyAuthSettings().then(
      (result) => {
        if (!active) {
          return;
        }

        if (!result.ok) {
          setSettingsMessage(result.message || 'Unable to load sign-in settings.');
          return;
        }

        setSettings(result.settings);
        setSettingsMessage(settingsError(result.settings));
      },
      () => {
        if (active) {
          setSettingsMessage('Unable to load sign-in settings.');
        }
      }
    );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (resetCaptchaWhenReady && step.kind === 'account') {
      captchaRef.current?.reset();
      setResetCaptchaWhenReady(false);
    }
  }, [resetCaptchaWhenReady, step]);

  const finishAuthentication = async (result: AIBuddyAuthResult) => {
    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (result.step === 'totp-required') {
      setStep({ kind: 'totp', tempToken: result.tempToken, maskedEmail: result.maskedEmail });
      setError(null);
      return;
    }
    if (result.step === 'select-group') {
      setStep({
        kind: 'select-group',
        pendingLoginId: result.pendingLoginId,
        groups: result.groups,
      });
      setSelectedGroupId(result.groups[0]?.id ?? '');
      setError(null);
      return;
    }
    // 默认模型不能在这里写：登录时运行中的 aibuddy serve 尚未拿到 AIBUDDY_* 环境变量，
    // 后端会以 invalid_params 拒绝未配置的 provider。刷新认证会话后由
    // ModelAndProviderContext 的兜底路径按网关首个模型落库。
    await window.electron.refreshAuthSession();
  };

  const handleCaptchaError = useCallback(() => {
    const message = 'Unable to load captcha. Please try again.';
    captchaErrorRef.current = message;
    setError(message);
  }, []);

  const handleCaptchaVerify = useCallback(() => {
    captchaErrorRef.current = null;
    setError(null);
  }, []);

  const handleAccountSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current || !settings || settingsMessage) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const proof = await captchaRef.current?.verify();
      if (!proof) {
        setError(captchaErrorRef.current ?? 'Complete the captcha before signing in.');
        return;
      }
      captchaErrorRef.current = null;

      const result = await window.electron.loginViaAIBuddy(email, password, proof);
      await finishAuthentication(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      captchaRef.current?.reset();
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleTotpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current || step.kind !== 'totp' || totpCode.length !== 6) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const result = await window.electron.completeAIBuddy2FA(step.tempToken, totpCode);
      await finishAuthentication(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleGroupSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current || step.kind !== 'select-group' || !selectedGroupId) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await finishAuthentication(
        await window.electron.provisionAIBuddyGroup(step.pendingLoginId, selectedGroupId)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Group setup failed.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const returnToAccountLogin = () => {
    captchaRef.current?.reset();
    setResetCaptchaWhenReady(true);
    setStep({ kind: 'account' });
    setTotpCode('');
    setError(null);
  };

  const canSubmit = Boolean(settings && captchaConfigIsComplete(settings) && !settingsMessage);
  const region = settings ? captchaRegion(settings) : null;

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background-primary px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-6 text-center text-xl font-light text-text-primary">AIBuddy</h1>
        {step.kind === 'account' ? (
          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <label className="block">
              <span className="text-xs text-text-secondary">Email</span>
              <Input
                className="mt-1"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label="email"
              />
            </label>
            <label className="block">
              <span className="text-xs text-text-secondary">Password</span>
              <Input
                className="mt-1"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-label="password"
              />
            </label>
            {settings && region && canSubmit && (
              <AliyunCaptcha
                ref={captchaRef}
                sceneId={settings.aliyunCaptchaSceneId}
                prefix={settings.aliyunCaptchaPrefix}
                region={region}
                onError={handleCaptchaError}
                onVerify={handleCaptchaVerify}
              />
            )}
            {settingsMessage && (
              <p role="alert" className="break-words text-sm text-background-danger">
                {settingsMessage}
              </p>
            )}
            {error && (
              <p role="alert" className="break-words text-sm text-background-danger">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit || submitting}
              aria-label="login"
            >
              {submitting ? 'Signing in...' : 'Login'}
            </Button>
          </form>
        ) : step.kind === 'totp' ? (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <label className="block">
              <span className="text-xs text-text-secondary">Verification code</span>
              <Input
                className="mt-1 text-center"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-label="verification code"
              />
            </label>
            {step.maskedEmail && <p className="text-sm text-text-secondary">{step.maskedEmail}</p>}
            {error && (
              <p role="alert" className="break-words text-sm text-background-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting || totpCode.length !== 6}>
              {submitting ? 'Verifying...' : 'Verify'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={returnToAccountLogin}>
              Back
            </Button>
          </form>
        ) : (
          <form onSubmit={handleGroupSubmit} className="space-y-4">
            <h2 className="text-center text-base text-text-primary">Choose group</h2>
            <label className="block">
              <span className="text-xs text-text-secondary">Group</span>
              <select
                className="mt-1 w-full rounded-md border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                aria-label="group"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
              >
                {step.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="break-words text-sm text-background-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting || !selectedGroupId}>
              {submitting ? 'Setting up...' : 'Continue'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
