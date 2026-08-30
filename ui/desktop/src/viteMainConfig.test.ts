import { describe, expect, it } from 'vitest';
import { createMainViteConfig } from '../vite.main.config.mts';

describe('createMainViteConfig', () => {
  it('injects HeyBuddy authentication defines without using an AIBuddy override', () => {
    const config = createMainViteConfig(
      {
        HEYBUDDY_AUTH_API_BASE_URL: 'https://oa.example',
        AIBUDDY_AUTH_API_BASE_URL: 'https://sub2api.example',
      },
      'heybuddy'
    );

    expect(config.define).toMatchObject({
      'process.env.APP_EDITION': JSON.stringify('heybuddy'),
      __AUTH_MODE__: JSON.stringify('oa'),
      __AUTH_API_BASE_URL__: JSON.stringify('https://oa.example'),
    });
  });

  it('injects AIBuddy authentication defines without using a HeyBuddy override', () => {
    const config = createMainViteConfig(
      {
        HEYBUDDY_AUTH_API_BASE_URL: 'https://oa.example',
        AIBUDDY_AUTH_API_BASE_URL: 'https://sub2api.example',
      },
      'aibuddy'
    );

    expect(config.define).toMatchObject({
      'process.env.APP_EDITION': JSON.stringify('aibuddy'),
      __AUTH_MODE__: JSON.stringify('sub2api'),
      __AUTH_API_BASE_URL__: JSON.stringify('https://sub2api.example'),
    });
  });
});
