import { describe, expect, it } from 'vitest';
import { applyLegacyAIBuddyEnvironment, LEGACY_AIBUDDY_ENV_ALIASES } from './legacyEnv';

describe('applyLegacyAIBuddyEnvironment', () => {
  it('copies every supported legacy variable to its canonical name', () => {
    const environment: Record<string, string | undefined> = {};
    for (const [index, [legacyKey]] of LEGACY_AIBUDDY_ENV_ALIASES.entries()) {
      environment[legacyKey] = `legacy-${index}`;
    }

    applyLegacyAIBuddyEnvironment(environment);

    for (const [index, [, canonicalKey]] of LEGACY_AIBUDDY_ENV_ALIASES.entries()) {
      expect(environment[canonicalKey]).toBe(`legacy-${index}`);
    }
  });

  it('keeps canonical values when both names are set', () => {
    const environment = {
      GOOSE_DEFAULT_PROVIDER: 'legacy-provider',
      AIBUDDY_DEFAULT_PROVIDER: 'canonical-provider',
    };

    applyLegacyAIBuddyEnvironment(environment);

    expect(environment.AIBUDDY_DEFAULT_PROVIDER).toBe('canonical-provider');
  });

  it('does not create canonical variables when a legacy value is absent', () => {
    const environment: Record<string, string | undefined> = {};

    applyLegacyAIBuddyEnvironment(environment);

    expect(environment).toEqual({});
  });
});
