import { describe, expect, it } from 'vitest';
import { createMainViteConfig } from './viteMainConfig';

describe('createMainViteConfig', () => {
  it('injects fixed AIBuddy authentication defines', () => {
    const config = createMainViteConfig({
      AIBUDDY_AUTH_API_BASE_URL: 'https://sub2api.example',
    });

    expect(config.define).toMatchObject({
      __AUTH_MODE__: JSON.stringify('sub2api'),
      __AUTH_API_BASE_URL__: JSON.stringify('https://sub2api.example'),
    });
    expect(config.define).not.toHaveProperty('process.env.APP_EDITION');
  });
});
