import { describe, expect, it } from 'vitest';
import { createMainViteConfig } from './viteMainConfig';

describe('createMainViteConfig', () => {
  it('targets Electron 22 Node 16 only for x32 without changing authentication', () => {
    const x32 = createMainViteConfig({ WINDOWS_ARCH: 'x32' });
    expect(x32.build.target).toBe('node16');
    expect(x32.define.__AUTH_MODE__).toBe(JSON.stringify('sub2api'));
    expect(createMainViteConfig({ WINDOWS_ARCH: 'x64' }).build.target).toBe('node24');
    expect(createMainViteConfig({}).build.target).toBe('node24');
  });

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
