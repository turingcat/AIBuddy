import { describe, expect, it } from 'vitest';
import { LOCAL_AUTH_API_BASE_URL, resolveAuthApiBaseUrl, resolveAuthMode } from './authConfig';

describe('edition-specific authentication configuration', () => {
  it('uses OA authentication for HeyBuddy', () => {
    expect(resolveAuthMode('heybuddy')).toBe('oa');
  });
});
describe('resolveAuthApiBaseUrl', () => {
  it('uses HEYBUDDY_AUTH_API_BASE_URL when supplied', () => {
    expect(
      resolveAuthApiBaseUrl({ HEYBUDDY_AUTH_API_BASE_URL: 'https://override.example.com' })
    ).toBe('https://override.example.com');
  });

  it('uses the production API when the environment value is blank', () => {
    expect(resolveAuthApiBaseUrl({ HEYBUDDY_AUTH_API_BASE_URL: '   ' })).toBe(
      'https://ai.linyeyun.cn'
    );
  });

  it('uses the production API when the environment value is absent', () => {
    expect(resolveAuthApiBaseUrl({})).toBe('https://ai.linyeyun.cn');
  });

  it('uses a supplied local fallback when explicitly requested', () => {
    expect(resolveAuthApiBaseUrl({}, 'heybuddy', LOCAL_AUTH_API_BASE_URL)).toBe(
      'http://localhost:3001'
    );
  });
});
