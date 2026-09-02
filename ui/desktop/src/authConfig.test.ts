import { describe, expect, it } from 'vitest';
import { LOCAL_AUTH_API_BASE_URL, resolveAuthApiBaseUrl, resolveAuthMode } from './authConfig';

describe('edition-specific authentication configuration', () => {
  it('uses the AIBuddy production API base URL by default', () => {
    expect(resolveAuthApiBaseUrl({}, 'aibuddy')).toBe('https://tflow.online');
  });

  it('does not allow the HeyBuddy API base URL to override AIBuddy', () => {
    expect(
      resolveAuthApiBaseUrl({ HEYBUDDY_AUTH_API_BASE_URL: 'https://oa.example' }, 'aibuddy')
    ).toBe('https://tflow.online');
  });

  it('uses the AIBuddy API base URL when supplied', () => {
    expect(
      resolveAuthApiBaseUrl({ AIBUDDY_AUTH_API_BASE_URL: 'https://api.example' }, 'aibuddy')
    ).toBe('https://api.example');
  });

  it('uses Sub2API authentication for AIBuddy', () => {
    expect(resolveAuthMode('aibuddy')).toBe('sub2api');
  });

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
