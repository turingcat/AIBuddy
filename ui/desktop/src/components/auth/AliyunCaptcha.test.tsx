import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AliyunCaptcha, { type AliyunCaptchaHandle } from './AliyunCaptcha';

type CaptchaOptions = Parameters<NonNullable<(typeof window)['initAliyunCaptcha']>>[0];

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

  it('rolls back a failed SDK config reservation before a later mount retries', async () => {
    delete window.initAliyunCaptcha;
    const first = render(
      <AliyunCaptcha sceneId="scene-failed" prefix="prefix-failed" region="sgp" />
    );
    const failedScript = document.querySelector<
      InstanceType<typeof globalThis.HTMLScriptElement>
    >(
      'script[src="https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js"]'
    );
    expect(failedScript).not.toBeNull();
    await act(async () => {
      fireEvent.error(failedScript!);
      await Promise.resolve();
      await Promise.resolve();
    });
    first.unmount();

    window.initAliyunCaptcha = vi.fn((options: CaptchaOptions) => {
      initOptions = options;
    });
    await renderCaptcha();

    expect(window.initAliyunCaptcha).toHaveBeenCalledTimes(1);
    expect(window.AliyunCaptchaConfig).toEqual({ region: 'cn', prefix: 'prefix-1' });
  });

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

  it('resolves a programmatic verification with null when the popup does not open', async () => {
    const { ref } = await renderCaptcha();
    let verification: Promise<string | null> | undefined;
    act(() => {
      verification = ref.current?.verify();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_100);
    });

    await expect(verification).resolves.toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'idle');
  });

  it('settles programmatic verification immediately when SDK loading fails', async () => {
    delete window.initAliyunCaptcha;
    const ref = createRef<AliyunCaptchaHandle>();
    const onError = vi.fn();
    render(
      <AliyunCaptcha ref={ref} sceneId="scene-1" prefix="prefix-1" region="cn" onError={onError} />
    );
    const failedScript = document.querySelector<
      InstanceType<typeof globalThis.HTMLScriptElement>
    >(
      'script[src="https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js"]'
    );
    expect(failedScript).not.toBeNull();

    let verification: Promise<string | null> | undefined;
    act(() => {
      verification = ref.current?.verify();
    });
    await act(async () => {
      fireEvent.error(failedScript!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await expect(verification).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'idle');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('ignores a proof delivered by the SDK callback that reset invalidated', async () => {
    const { ref } = await renderCaptcha();
    const previousOptions = initOptions!;
    let pendingVerification: Promise<string | null> | undefined;
    act(() => {
      pendingVerification = ref.current?.verify();
    });
    act(() => ref.current?.reset());
    await expect(pendingVerification).resolves.toBeNull();
    await act(async () => {
      await Promise.resolve();
    });

    expect(initOptions).not.toBe(previousOptions);
    act(() => {
      previousOptions.captchaVerifyCallback('stale-proof');
    });
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'idle');

    let verification: Promise<string | null> | undefined;
    act(() => {
      verification = ref.current?.verify();
      initOptions?.captchaVerifyCallback('fresh-proof');
    });

    await expect(verification).resolves.toBe('fresh-proof');
  });

  it('initializes once when verify immediately follows reset', async () => {
    const ref = createRef<AliyunCaptchaHandle>();
    const onVerify = vi.fn();
    const component = render(
      <AliyunCaptcha ref={ref} sceneId="scene-1" prefix="prefix-1" onVerify={onVerify} />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const previousOptions = initOptions!;
    let verification: Promise<string | null> | undefined;

    act(() => {
      ref.current?.reset();
      verification = ref.current?.verify();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.initAliyunCaptcha).toHaveBeenCalledTimes(2);
    expect(initOptions).not.toBe(previousOptions);
    act(() => {
      previousOptions.captchaVerifyCallback('stale-proof');
      initOptions?.captchaVerifyCallback('fresh-proof');
    });

    await expect(verification).resolves.toBe('fresh-proof');
    expect(onVerify).toHaveBeenCalledTimes(1);
    component.unmount();
  });

  it('allows only the first mounted instance to own SDK initialization and global popup cleanup', async () => {
    const owner = await renderCaptcha();
    const nonOwnerRef = createRef<AliyunCaptchaHandle>();
    const onError = vi.fn();
    const nonOwner = render(
      <AliyunCaptcha
        ref={nonOwnerRef}
        sceneId="scene-2"
        prefix="prefix-2"
        region="sgp"
        onError={onError}
      />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.initAliyunCaptcha).toHaveBeenCalledTimes(1);
    expect(window.AliyunCaptchaConfig).toEqual({ region: 'cn', prefix: 'prefix-1' });
    await expect(nonOwnerRef.current?.verify()).resolves.toBeNull();
    fireEvent.click(nonOwner.container.querySelector('button')!);
    expect(onError).toHaveBeenCalledTimes(1);

    const popup = document.createElement('div');
    popup.id = 'aliyunCaptcha-window-popup';
    document.body.appendChild(popup);
    const mask = document.createElement('div');
    mask.id = 'aliyunCaptcha-mask';
    document.body.appendChild(mask);

    nonOwner.unmount();
    expect(document.getElementById('aliyunCaptcha-window-popup')).toBe(popup);
    expect(document.getElementById('aliyunCaptcha-mask')).toBe(mask);

    const rejectedRef = createRef<AliyunCaptchaHandle>();
    const rejectedOnError = vi.fn();
    const rejected = render(
      <AliyunCaptcha
        ref={rejectedRef}
        sceneId="scene-2"
        prefix="prefix-2"
        region="sgp"
        onError={rejectedOnError}
      />
    );
    owner.unmount();
    expect(document.getElementById('aliyunCaptcha-window-popup')).toBeNull();
    expect(document.getElementById('aliyunCaptcha-mask')).toBeNull();

    fireEvent.click(rejected.container.querySelector('button')!);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(window.initAliyunCaptcha).toHaveBeenCalledTimes(1);
    expect(window.AliyunCaptchaConfig).toEqual({ region: 'cn', prefix: 'prefix-1' });
    expect(rejectedOnError).toHaveBeenCalledTimes(1);

    const replacement = render(<AliyunCaptcha sceneId="scene-3" prefix="prefix-1" region="cn" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(window.initAliyunCaptcha).toHaveBeenCalledTimes(2);
    expect(window.AliyunCaptchaConfig).toEqual({ region: 'cn', prefix: 'prefix-1' });
    replacement.unmount();
    rejected.unmount();
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
