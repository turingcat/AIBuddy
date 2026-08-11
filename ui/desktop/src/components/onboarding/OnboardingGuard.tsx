import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useConfig } from '../ConfigContext';
import { useModelAndProvider } from '../ModelAndProviderContext';
import { acpReadDefaults } from '../../acp/providers';
import { Goose } from '../icons';
import { Button } from '../ui/button';
import OnboardingSuccess from './OnboardingSuccess';
import {
  trackOnboardingStarted,
  trackOnboardingCompleted,
  trackTelemetryPreference,
  setTelemetryEnabled as setAnalyticsTelemetryEnabled,
} from '../../utils/analytics';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  welcomeTitle: {
    id: 'onboardingGuard.welcomeTitle',
    defaultMessage: 'Welcome to HeyBuddy',
  },
  welcomeDescription: {
    id: 'onboardingGuard.welcomeDescription',
    defaultMessage: 'Your local AI agent. Connect an AI model provider to get started.',
  },
  checkProviderErrorTitle: {
    id: 'onboardingGuard.checkProviderErrorTitle',
    defaultMessage: 'Unable to connect to HeyBuddy server',
  },
  checkProviderErrorDescription: {
    id: 'onboardingGuard.checkProviderErrorDescription',
    defaultMessage: 'The server may be starting up or temporarily unavailable.',
  },
  retry: {
    id: 'onboardingGuard.retry',
    defaultMessage: 'Retry',
  },
});

const TELEMETRY_CONFIG_KEY = 'GOOSE_TELEMETRY_ENABLED';

interface OnboardingGuardProps {
  children: React.ReactNode;
}

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { upsert } = useConfig();
  const { getFallbackModelAndProvider, refreshCurrentModelAndProvider } = useModelAndProvider();

  const [isCheckingProvider, setIsCheckingProvider] = useState(true);
  const [hasProvider, setHasProvider] = useState(false);
  const [checkProviderError, setCheckProviderError] = useState(false);
  const [configuredProvider] = useState<string | null>(null);
  const [configuredProviderDisplayName] = useState<string | null>(null);
  const [configuredModel] = useState<string | null>(null);
  const hasTrackedOnboardingStart = useRef(false);

  const checkProvider = async (retries = 3, delay = 1000) => {
    setIsCheckingProvider(true);
    setCheckProviderError(false);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { providerId: provider } = await acpReadDefaults();
        if (provider?.trim()) {
          setHasProvider(true);
          setIsCheckingProvider(false);
          return;
        }

        const fallback = await getFallbackModelAndProvider();
        if (fallback.provider?.trim() && fallback.model?.trim()) {
          const { providerId: configuredProvider, modelId: configuredModel } =
            await acpReadDefaults();
          if (configuredProvider?.trim() && configuredModel?.trim()) {
            await refreshCurrentModelAndProvider();
            setHasProvider(true);
            setIsCheckingProvider(false);
            return;
          }
        }

        setHasProvider(false);
        setIsCheckingProvider(false);
        return;
      } catch (error) {
        console.error(`Error checking provider (attempt ${attempt + 1}/${retries + 1}):`, error);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    setCheckProviderError(true);
    setIsCheckingProvider(false);
  };

  useEffect(() => {
    checkProvider();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isCheckingProvider && !hasProvider && !checkProviderError && !hasTrackedOnboardingStart.current) {
      trackOnboardingStarted();
      hasTrackedOnboardingStart.current = true;
    }
  }, [isCheckingProvider, hasProvider, checkProviderError]);

  const finishOnboarding = async (telemetryEnabled: boolean) => {
    try {
      await upsert(TELEMETRY_CONFIG_KEY, telemetryEnabled, false);
    } catch (error) {
      console.error('Failed to save telemetry preference:', error);
    }
    trackTelemetryPreference(telemetryEnabled, 'onboarding');
    if (configuredProvider) {
      trackOnboardingCompleted(configuredProvider, configuredModel ?? undefined);
    }
    if (!telemetryEnabled) {
      setAnalyticsTelemetryEnabled(false);
    }
    navigate('/', { replace: true });
    setHasProvider(true);
  };

  if (isCheckingProvider) {
    return null;
  }

  if (checkProviderError) {
    return (
      <div className="h-screen w-full bg-background-default flex flex-col items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <Goose className="size-8 mx-auto" />
          </div>
          <h1 className="text-xl font-light mb-3">{intl.formatMessage(i18n.checkProviderErrorTitle)}</h1>
          <p className="text-text-muted mb-6">{intl.formatMessage(i18n.checkProviderErrorDescription)}</p>
          <Button onClick={() => checkProvider()}>
            {intl.formatMessage(i18n.retry)}
          </Button>
        </div>
      </div>
    );
  }

  if (hasProvider) {
    return <>{children}</>;
  }

  if (configuredProviderDisplayName) {
    return (
      <OnboardingSuccess providerName={configuredProviderDisplayName} onFinish={finishOnboarding} />
    );
  }

  /**
   * 阶段一：provider 配置入口已隐藏，未配置时直接放行 children。
   * 登录判定由后续任务接管，本任务仅消除 provider 引导 UI。
   * @author: logic
   * @date: 2026-08-11
   */
  return <>{children}</>;
}
