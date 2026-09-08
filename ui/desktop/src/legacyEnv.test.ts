import { describe, expect, it } from 'vitest';
import { applyLegacyHeyBuddyEnvironment, LEGACY_HEYBUDDY_ENV_ALIASES } from './legacyEnv';

describe('applyLegacyHeyBuddyEnvironment', () => {
  it('copies every supported legacy variable to its canonical name', () => {
    const environment: Record<string, string | undefined> = {};
    for (const [index, [legacyKey]] of LEGACY_HEYBUDDY_ENV_ALIASES.entries()) {
      environment[legacyKey] = `legacy-${index}`;
    }

    applyLegacyHeyBuddyEnvironment(environment);

    for (const [index, [, canonicalKey]] of LEGACY_HEYBUDDY_ENV_ALIASES.entries()) {
      expect(environment[canonicalKey]).toBe(`legacy-${index}`);
    }
  });

  it('keeps canonical values when both names are set', () => {
    const environment = {
      GOOSE_DEFAULT_PROVIDER: 'legacy-provider',
      HEYBUDDY_DEFAULT_PROVIDER: 'canonical-provider',
    };

    applyLegacyHeyBuddyEnvironment(environment);

    expect(environment.HEYBUDDY_DEFAULT_PROVIDER).toBe('canonical-provider');
  });

  it('does not create canonical variables when a legacy value is absent', () => {
    const environment: Record<string, string | undefined> = {};

    applyLegacyHeyBuddyEnvironment(environment);

    expect(environment).toEqual({});
  });
});
