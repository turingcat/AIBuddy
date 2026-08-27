import { describe, expect, it } from 'vitest';
import { resolveAuthApiBaseUrl } from './authConfig';

describe('resolveAuthApiBaseUrl', () => {
  it('uses HEYBUDDY_AUTH_API_BASE_URL when supplied', () => {
    expect(resolveAuthApiBaseUrl({ HEYBUDDY_AUTH_API_BASE_URL: 'https://ai.linyeyun.cn' })).toBe(
      'https://ai.linyeyun.cn'
    );
  });

  it('uses the fallback when the environment value is blank', () => {
    expect(resolveAuthApiBaseUrl({ HEYBUDDY_AUTH_API_BASE_URL: '   ' })).toBe(
      'http://localhost:3001'
    );
  });

  it('uses the fallback when the environment value is absent', () => {
    expect(resolveAuthApiBaseUrl({})).toBe('http://localhost:3001');
  });

  it('uses a supplied fallback when the environment value is absent', () => {
    expect(resolveAuthApiBaseUrl({}, 'https://ai.linyeyun.cn')).toBe('https://ai.linyeyun.cn');
  });
});
