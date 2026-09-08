import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAppDisplayName,
  getAppEdition,
  getAppIconStem,
  getAppProtocol,
  getAppTrayIconStem,
  getAppProtocolPrefix,
} from './brand';

describe('brand', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exposes HeyBuddy identity', () => {
    vi.stubEnv('APP_EDITION', 'heybuddy');

    expect(getAppEdition()).toBe('heybuddy');
    expect(getAppDisplayName()).toBe('HeyBuddy');
    expect(getAppIconStem()).toBe('icon');
    expect(getAppTrayIconStem()).toBe('iconTemplate');
    expect(getAppProtocol()).toBe('heybuddy');
    expect(getAppProtocolPrefix()).toBe('heybuddy://');
  });

  // Resolving per call, not once at import, keeps a stale module-level constant
  // from leaking a previously read edition across tests.
  it('re-resolves the edition on every call', () => {
    vi.stubEnv('APP_EDITION', 'heybuddy');
    expect(getAppProtocol()).toBe('heybuddy');

    vi.stubEnv('APP_EDITION', 'goose');
    expect(() => getAppProtocol()).toThrow(/Invalid APP_EDITION/);
  });

  it.each([undefined, '', 'goose', 'HEYBUDDY'])('rejects the unsupported edition %o', (edition) => {
    vi.stubEnv('APP_EDITION', edition);

    expect(() => getAppEdition()).toThrow(/Invalid APP_EDITION/);
    expect(() => getAppProtocol()).toThrow(/Invalid APP_EDITION/);
    expect(() => getAppDisplayName()).toThrow(/Invalid APP_EDITION/);
  });
});
