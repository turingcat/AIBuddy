import { describe, expect, it } from 'vitest';
import { createMainViteConfig } from './viteMainConfig';

describe('createMainViteConfig', () => {
  it('injects HeyBuddy authentication defines from the environment override', () => {
    const config = createMainViteConfig(
      { HEYBUDDY_AUTH_API_BASE_URL: 'https://oa.example' },
      'heybuddy'
    );

    expect(config.define).toMatchObject({
      'process.env.APP_EDITION': JSON.stringify('heybuddy'),
      __AUTH_MODE__: JSON.stringify('oa'),
      __AUTH_API_BASE_URL__: JSON.stringify('https://oa.example'),
    });
  });
});
