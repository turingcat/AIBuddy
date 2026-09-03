import { CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

const SCRIPT_SRC = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js';
const POPUP_ID = 'aliyunCaptcha-window-popup';
const MASK_ID = 'aliyunCaptcha-mask';
const POPUP_OPEN_TIMEOUT_MS = 8_000;
const POPUP_WATCH_INTERVAL_MS = 300;

let scriptPromise: Promise<void> | null = null;
let activeOwnerId: string | null = null;
let sdkConfig: { region: 'cn' | 'sgp'; prefix: string } | null = null;

export type AliyunCaptchaState = 'idle' | 'verifying' | 'verified';

export interface AliyunCaptchaHandle {
  verify(): Promise<string | null>;
  reset(): void;
}

interface AliyunCaptchaProps {
  sceneId: string;
  prefix: string;
  region?: 'cn' | 'sgp';
  onVerify?: (proof: string) => void;
  onError?: () => void;
  onStateChange?: (state: AliyunCaptchaState) => void;
}

function isCompatibleConfig(region: 'cn' | 'sgp', prefix: string): boolean {
  return sdkConfig === null || (sdkConfig.region === region && sdkConfig.prefix === prefix);
}

function loadScript(): Promise<void> {
  if (window.initAliyunCaptcha) {
    return Promise.resolve();
  }

  const existingScript = document.querySelector<
    InstanceType<typeof globalThis.HTMLScriptElement>
  >(`script[src="${SCRIPT_SRC}"]`);
  if (scriptPromise && existingScript) {
    return scriptPromise;
  }
  scriptPromise = null;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = existingScript ?? document.createElement('script');
    const cleanupListeners = () => {
      script.removeEventListener('load', succeed);
      script.removeEventListener('error', fail);
    };
    const fail = () => {
      cleanupListeners();
      script.remove();
      scriptPromise = null;
      reject(new Error('Failed to load Aliyun captcha script'));
    };
    const succeed = () => {
      if (window.initAliyunCaptcha) {
        cleanupListeners();
        resolve();
      } else {
        fail();
      }
    };

    script.addEventListener('load', succeed, { once: true });
    script.addEventListener('error', fail, { once: true });

    if (!existingScript) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

function isPopupVisible(): boolean {
  const popup = document.getElementById(POPUP_ID);
  return popup !== null && window.getComputedStyle(popup).display !== 'none';
}

const AliyunCaptcha = forwardRef<AliyunCaptchaHandle, AliyunCaptchaProps>(function AliyunCaptcha(
  { sceneId, prefix, region = 'cn', onVerify, onError, onStateChange },
  ref
) {
  const generatedId = useId().replace(/:/g, '');
  const buttonId = `aliyun-captcha-button-${generatedId}`;
  const elementId = `aliyun-captcha-element-${generatedId}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ownsCaptchaRef = useRef(false);
  const initializedRef = useRef(false);
  const initializationPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const callbackGenerationRef = useRef(0);
  const cachedProofRef = useRef<string | null>(null);
  const pendingRef = useRef<{
    promise: Promise<string | null>;
    resolve: (proof: string | null) => void;
  } | null>(null);
  const popupWatchTimerRef = useRef<number | null>(null);
  const popupSeenRef = useRef(false);
  const popupWatchStartedAtRef = useRef(0);
  const stateRef = useRef<AliyunCaptchaState>('idle');
  const [state, setState] = useState<AliyunCaptchaState>('idle');

  const updateState = useCallback(
    (nextState: AliyunCaptchaState) => {
      stateRef.current = nextState;
      setState(nextState);
      onStateChange?.(nextState);
    },
    [onStateChange]
  );

  const acquireOwnership = useCallback(() => {
    if (ownsCaptchaRef.current) {
      return true;
    }
    if (activeOwnerId !== null) {
      return false;
    }
    if (!isCompatibleConfig(region, prefix)) {
      return false;
    }

    activeOwnerId = generatedId;
    ownsCaptchaRef.current = true;
    return true;
  }, [generatedId, prefix, region]);

  const releaseOwnership = useCallback(() => {
    if (!ownsCaptchaRef.current) {
      return false;
    }

    ownsCaptchaRef.current = false;
    if (activeOwnerId === generatedId) {
      activeOwnerId = null;
    }
    return true;
  }, [generatedId]);

  const stopPopupWatch = useCallback(() => {
    if (popupWatchTimerRef.current !== null) {
      window.clearInterval(popupWatchTimerRef.current);
      popupWatchTimerRef.current = null;
    }
  }, []);

  const settlePending = useCallback((proof: string | null) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.resolve(proof);
  }, []);

  const handleInitializationFailure = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    stopPopupWatch();
    settlePending(null);
    updateState('idle');
    onError?.();
  }, [onError, settlePending, stopPopupWatch, updateState]);

  const startPopupWatch = useCallback(() => {
    stopPopupWatch();
    popupSeenRef.current = false;
    popupWatchStartedAtRef.current = Date.now();
    popupWatchTimerRef.current = window.setInterval(() => {
      if (isPopupVisible()) {
        popupSeenRef.current = true;
        return;
      }

      if (
        popupSeenRef.current ||
        Date.now() - popupWatchStartedAtRef.current >= POPUP_OPEN_TIMEOUT_MS
      ) {
        stopPopupWatch();
        updateState('idle');
        settlePending(null);
        return;
      }

      buttonRef.current?.click();
    }, POPUP_WATCH_INTERVAL_MS);
  }, [settlePending, stopPopupWatch, updateState]);

  const completeVerification = useCallback(
    (proof: string) => {
      if (!mountedRef.current) {
        return;
      }

      stopPopupWatch();
      cachedProofRef.current = proof;
      updateState('verified');
      onVerify?.(proof);
      settlePending(proof);
    },
    [onVerify, settlePending, stopPopupWatch, updateState]
  );

  const initialize = useCallback((): Promise<void> => {
    if (initializationPromiseRef.current) {
      return initializationPromiseRef.current;
    }

    if (
      !ownsCaptchaRef.current ||
      initializedRef.current ||
      !sceneId ||
      !prefix ||
      !isCompatibleConfig(region, prefix)
    ) {
      return Promise.resolve();
    }

    const reservesConfig = sdkConfig === null;
    if (reservesConfig) {
      sdkConfig = { region, prefix };
    }
    window.AliyunCaptchaConfig = { region, prefix };

    let initialization!: Promise<void>;
    const runInitialization = async () => {
      try {
        try {
          await loadScript();
        } catch (error) {
          if (reservesConfig && isCompatibleConfig(region, prefix)) {
            sdkConfig = null;
          }
          throw error;
        }

        if (
          !mountedRef.current ||
          !ownsCaptchaRef.current ||
          initializedRef.current ||
          !window.initAliyunCaptcha
        ) {
          return;
        }

        const callbackGeneration = callbackGenerationRef.current;

        window.initAliyunCaptcha({
          SceneId: sceneId,
          prefix,
          mode: 'popup',
          element: `#${elementId}`,
          button: `#${buttonId}`,
          captchaVerifyCallback: (proof) => {
            if (callbackGeneration === callbackGenerationRef.current) {
              completeVerification(proof);
            }
            return { captchaResult: true };
          },
          onBizResultCallback: () => {},
          getInstance: () => {},
          slideStyle: { width: 360, height: 40 },
        });
        initializedRef.current = true;
      } finally {
        if (initializationPromiseRef.current === initialization) {
          initializationPromiseRef.current = null;
        }
      }
    };

    initialization = runInitialization().catch(handleInitializationFailure);
    initializationPromiseRef.current = initialization;
    return initialization;
  }, [
    buttonId,
    completeVerification,
    elementId,
    handleInitializationFailure,
    prefix,
    region,
    sceneId,
  ]);

  const beginVerification = useCallback(() => {
    if (cachedProofRef.current || stateRef.current === 'verifying') {
      return;
    }

    updateState('verifying');
    startPopupWatch();
  }, [startPopupWatch, updateState]);

  const handleTriggerClick = useCallback(() => {
    if (!acquireOwnership()) {
      onError?.();
      return;
    }

    void initialize();
    beginVerification();
  }, [acquireOwnership, beginVerification, initialize, onError]);

  useImperativeHandle(
    ref,
    () => ({
      verify: () => {
        if (!acquireOwnership()) {
          return Promise.resolve(null);
        }
        if (cachedProofRef.current) {
          return Promise.resolve(cachedProofRef.current);
        }
        if (pendingRef.current) {
          return pendingRef.current.promise;
        }

        let resolvePending: (proof: string | null) => void = () => {};
        const promise = new Promise<string | null>((resolve) => {
          resolvePending = resolve;
        });
        pendingRef.current = { promise, resolve: resolvePending };
        beginVerification();
        buttonRef.current?.click();
        return promise;
      },
      reset: () => {
        stopPopupWatch();
        settlePending(null);
        cachedProofRef.current = null;
        callbackGenerationRef.current += 1;
        initializedRef.current = false;
        updateState('idle');
        if (ownsCaptchaRef.current) {
          void initialize();
        }
      },
    }),
    [
      acquireOwnership,
      beginVerification,
      initialize,
      settlePending,
      stopPopupWatch,
      updateState,
    ]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (acquireOwnership()) {
      void initialize();
    }

    return () => {
      mountedRef.current = false;
      stopPopupWatch();
      settlePending(null);
      if (releaseOwnership()) {
        document.getElementById(MASK_ID)?.remove();
        document.getElementById(POPUP_ID)?.remove();
      }
    };
  }, [acquireOwnership, initialize, onError, releaseOwnership, settlePending, stopPopupWatch]);

  const stateContent = {
    idle: (
      <>
        <ShieldCheck className="size-4" aria-hidden="true" />
        Verify captcha
      </>
    ),
    verifying: (
      <>
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Verifying
      </>
    ),
    verified: (
      <>
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Verified
      </>
    ),
  }[state];

  return (
    <div className="w-full min-h-11" data-state={state}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        onClick={handleTriggerClick}
        disabled={state === 'verified'}
        data-state={state}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border-subtle bg-background-secondary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-background-tertiary disabled:border-green-500 disabled:bg-green-500/10 disabled:text-green-700 dark:disabled:text-green-300"
      >
        {stateContent}
      </button>
      <div id={elementId} />
    </div>
  );
});

export default AliyunCaptcha;
