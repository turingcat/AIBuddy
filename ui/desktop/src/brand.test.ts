import { describe, expect, it } from 'vitest';
import {
  getAppDisplayName,
  getAppIconStem,
  getAppProtocol,
  getAppProtocolPrefix,
  getAppTrayIconStem,
} from './brand';

describe('brand', () => {
  it('returns the fixed AIBuddy identity', () => {
    expect(getAppDisplayName()).toBe('AIBuddy');
    expect(getAppIconStem()).toBe('aibuddy/icon');
    expect(getAppTrayIconStem()).toBe('aibuddy/iconTemplate');
    expect(getAppProtocol()).toBe('aibuddy');
    expect(getAppProtocolPrefix()).toBe('aibuddy://');
  });
});
