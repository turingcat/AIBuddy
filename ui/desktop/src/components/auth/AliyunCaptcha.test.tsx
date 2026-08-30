import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AliyunCaptcha, { type AliyunCaptchaHandle } from './AliyunCaptcha';

type CaptchaOptions = Parameters<NonNullable<Window['initAliyunCaptcha']>>[0];

describe('AliyunCaptcha', () => {
  let initOptions: CaptchaOptions | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    initOptions = undefined;
    window.initAliyunCaptcha = vi.fn((options: CaptchaOptions) => {
      initOptions = options;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.initAliyunCaptcha;
    delete window.AliyunCaptchaConfig;
    document.getElementById('aliyunCaptcha-window-popup')?.remove();
    document.getElementById('aliyunCaptcha-mask')?.remove();
    document
      .querySelectorAll(
        'script[src="https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js"]'
      )
      .forEach((script) => script.remove());
  });

  async function renderCaptcha(ref = createRef<AliyunCaptchaHandle>()) {
    const result = render(
      <AliyunCaptcha ref={ref} sceneId="scene-1" prefix="prefix-1" region="cn" />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(initOptions).toBeDefined();
    return { ...result, ref };
  }

  it('configures the SDK before popup initialization and accepts a proof', async () => {
    await renderCaptcha();

    expect(window.AliyunCaptchaConfig).toEqual({ region: 'cn', prefix: 'prefix-1' });
    expect(initOptions).toMatchObject({
      SceneId: 'scene-1',
      prefix: 'prefix-1',
      mode: 'popup',
      element: expect.stringMatching(/^#aliyun-captcha-element-/),
      button: expect.stringMatching(/^#aliyun-captcha-button-/),
    });
    let result: { captchaResult: boolean } | undefined;
    act(() => {
      result = initOptions?.captchaVerifyCallback('proof-1');
    });
    expect(result).toEqual({ captchaResult: true });
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'verified');
  });

  it('reuses a cached proof without reopening the popup', async () => {
    const { ref } = await renderCaptcha();
    act(() => {
      initOptions?.captchaVerifyCallback('cached-proof');
    });

    await expect(ref.current?.verify()).resolves.toBe('cached-proof');
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'verified');
  });

  it('opens a programmatic verification and resolves with its proof', async () => {
    const { ref } = await renderCaptcha();
    let verification: Promise<string | null> | undefined;
    act(() => {
      verification = ref.current?.verify();
    });

    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'verifying');
    act(() => {
      initOptions?.captchaVerifyCallback('programmatic-proof');
    });
    await expect(verification).resolves.toBe('programmatic-proof');
  });

  it('resolves a programmatic verification with null after the popup closes', async () => {
    const { ref } = await renderCaptcha();
    let verification: Promise<string | null> | undefined;
    act(() => {
      verification = ref.current?.verify();
    });
    const popup = document.createElement('div');
    popup.id = 'aliyunCaptcha-window-popup';
    popup.style.display = 'block';
    document.body.appendChild(popup);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    popup.remove();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    await expect(verification).resolves.toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'idle');
  });

  it('invalidates a cached proof when reset is called', async () => {
    const { ref } = await renderCaptcha();
    act(() => {
      initOptions?.captchaVerifyCallback('expired-proof');
    });
    act(() => ref.current?.reset());

    let verification: Promise<string | null> | undefined;
    act(() => {
      verification = ref.current?.verify();
      initOptions?.captchaVerifyCallback('fresh-proof');
    });

    await expect(verification).resolves.toBe('fresh-proof');
  });

  it('allows a later mount to retry after the SDK script fails to load', async () => {
    delete window.initAliyunCaptcha;
    const first = render(<AliyunCaptcha sceneId="scene-1" prefix="prefix-1" />);
    const failedScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js"]'
    );
    expect(failedScript).not.toBeNull();
    fireEvent.error(failedScript!);
    first.unmount();

    window.initAliyunCaptcha = vi.fn((options: CaptchaOptions) => {
      initOptions = options;
    });
    await renderCaptcha();

    expect(window.initAliyunCaptcha).toHaveBeenCalledTimes(1);
  });

  it('cleans popup timers and residual SDK DOM on unmount', async () => {
    const { unmount, ref } = await renderCaptcha();
    act(() => {
      ref.current?.verify();
    });
    const popup = document.createElement('div');
    popup.id = 'aliyunCaptcha-window-popup';
    document.body.appendChild(popup);
    const mask = document.createElement('div');
    mask.id = 'aliyunCaptcha-mask';
    document.body.appendChild(mask);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });

    expect(document.getElementById('aliyunCaptcha-window-popup')).toBeNull();
    expect(document.getElementById('aliyunCaptcha-mask')).toBeNull();
  });
});
