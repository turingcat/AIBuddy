import { describe, it, expect } from 'vitest';
import { buildHeyBuddyEnv } from './heybuddyServeEnv';

/**
 * @author logic
 * @date 2026-08-11
 * buildHeyBuddyEnv 单测：凭证映射为 HEYBUDDY_* 环境变量，空凭证返回空对象
 */
describe('buildHeyBuddyEnv', () => {
  it('凭证存在时返回 HEYBUDDY_* 与 HEYBUDDY_PROVIDER', () => {
    expect(buildHeyBuddyEnv({ token: 't', baseUrl: 'https://gw', apiKey: 'k' })).toEqual({
      HEYBUDDY_BASE_URL: 'https://gw',
      HEYBUDDY_API_KEY: 'k',
      HEYBUDDY_PROVIDER: 'heybuddy',
    });
  });

  it('无凭证时返回空对象', () => {
    expect(buildHeyBuddyEnv(null)).toEqual({});
  });

  it('注入 HEYBUDDY_PROVIDER 强制用 heybuddy，且不泄漏 token', () => {
    const env = buildHeyBuddyEnv({
      token: 'secret-token',
      baseUrl: 'https://gw',
      apiKey: 'k',
    });
    expect(env.HEYBUDDY_PROVIDER).toBe('heybuddy');
    expect(Object.keys(env).sort()).toEqual([
      'HEYBUDDY_API_KEY',
      'HEYBUDDY_BASE_URL',
      'HEYBUDDY_PROVIDER',
    ]);
    expect(env).not.toHaveProperty('token');
    expect(env).not.toHaveProperty('HEYBUDDY_TOKEN');
  });
});
