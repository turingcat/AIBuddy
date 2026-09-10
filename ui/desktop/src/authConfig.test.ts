import { describe, expect, it } from 'vitest';
import { LOCAL_AUTH_API_BASE_URL, resolveAuthApiBaseUrl } from './authConfig';

describe('AIBuddy authentication configuration', () => {
  it('uses the TFlow production API base URL by default', () => {
    expect(resolveAuthApiBaseUrl({})).toBe('https://tflow.online');
  });

  it('uses the AIBuddy API base URL override', () => {
    expect(resolveAuthApiBaseUrl({ AIBUDDY_AUTH_API_BASE_URL: 'https://api.example' })).toBe(
      'https://api.example'
    );
  });

  it('uses a supplied local fallback', () => {
    expect(resolveAuthApiBaseUrl({}, LOCAL_AUTH_API_BASE_URL)).toBe('http://localhost:3001');
  });
});
