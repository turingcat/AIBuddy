import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAppDisplayName,
  getAppEdition,
  getAppIconStem,
  getAppProtocol,
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
    expect(getAppProtocol()).toBe('goose');
    expect(getAppProtocolPrefix()).toBe('goose://');
  });

  it('exposes AIBuddy identity', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');

    expect(getAppEdition()).toBe('aibuddy');
    expect(getAppDisplayName()).toBe('AIBuddy');
    expect(getAppIconStem()).toBe('aibuddy/icon');
    expect(getAppProtocol()).toBe('aibuddy');
    expect(getAppProtocolPrefix()).toBe('aibuddy://');
  });

  // Resolving per call, not once at import, is what lets a single process run
  // both editions; a cached module-level constant would leak across tests.
  it('re-resolves the edition on every call', () => {
    vi.stubEnv('APP_EDITION', 'heybuddy');
    expect(getAppProtocol()).toBe('goose');

    vi.stubEnv('APP_EDITION', 'aibuddy');
    expect(getAppProtocol()).toBe('aibuddy');
  });

  it.each([undefined, '', 'goose', 'HEYBUDDY'])('rejects the unsupported edition %o', (edition) => {
    vi.stubEnv('APP_EDITION', edition);

    expect(() => getAppEdition()).toThrow(/Invalid APP_EDITION/);
    expect(() => getAppProtocol()).toThrow(/Invalid APP_EDITION/);
    expect(() => getAppDisplayName()).toThrow(/Invalid APP_EDITION/);
  });
});
