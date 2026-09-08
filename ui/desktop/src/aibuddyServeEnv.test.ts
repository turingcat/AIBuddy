import { describe, it, expect } from 'vitest';
import { buildAIBuddyEnv } from './aibuddyServeEnv';

/**
 * @author logic
 * @date 2026-08-11
 * buildAIBuddyEnv 单测：凭证映射为 AIBUDDY_* 环境变量，空凭证返回空对象
 */
describe('buildAIBuddyEnv', () => {
  it('凭证存在时返回 AIBUDDY_* 与 AIBUDDY_PROVIDER', () => {
    expect(buildAIBuddyEnv({ token: 't', baseUrl: 'https://gw', apiKey: 'k' })).toEqual({
      AIBUDDY_BASE_URL: 'https://gw',
      AIBUDDY_API_KEY: 'k',
      AIBUDDY_PROVIDER: 'aibuddy',
    });
  });

  it('无凭证时返回空对象', () => {
    expect(buildAIBuddyEnv(null)).toEqual({});
  });

  it('注入 AIBUDDY_PROVIDER 强制用 aibuddy，且不泄漏 token', () => {
    const env = buildAIBuddyEnv({
      token: 'secret-token',
      baseUrl: 'https://gw',
      apiKey: 'k',
    });
    expect(env.AIBUDDY_PROVIDER).toBe('aibuddy');
    expect(Object.keys(env).sort()).toEqual([
      'AIBUDDY_API_KEY',
      'AIBUDDY_BASE_URL',
      'AIBUDDY_PROVIDER',
    ]);
    expect(env).not.toHaveProperty('token');
    expect(env).not.toHaveProperty('AIBUDDY_TOKEN');
  });
});
