import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlTestWrapper } from '../../i18n/test-utils';

vi.mock('../../acp/providers', () => ({
  acpReadDefaults: vi.fn().mockResolvedValue({ providerId: '', modelId: '' }),
  acpListProviderDetails: vi.fn().mockResolvedValue([]),
  acpSaveDefaults: vi.fn(),
}));

vi.mock('../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    getFallbackModelAndProvider: vi.fn().mockResolvedValue({ provider: '', model: '' }),
    refreshCurrentModelAndProvider: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../ConfigContext', () => ({
  useConfig: () => ({
    upsert: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../utils/analytics', () => ({
  trackOnboardingStarted: vi.fn(),
  trackOnboardingCompleted: vi.fn(),
  trackOnboardingProviderSelected: vi.fn(),
  trackTelemetryPreference: vi.fn(),
  setTelemetryEnabled: vi.fn(),
}));

import OnboardingGuard from './OnboardingGuard';

describe('OnboardingGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未配置 provider 时不渲染 ProviderSelector 引导', async () => {
    render(
      <MemoryRouter>
        <IntlTestWrapper>
          <OnboardingGuard>
            <div>child</div>
          </OnboardingGuard>
        </IntlTestWrapper>
      </MemoryRouter>
    );
    expect(await screen.findByText('child', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(/Connect to a Provider/i)).not.toBeInTheDocument();
  });
});
