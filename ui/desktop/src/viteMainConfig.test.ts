import { describe, expect, it } from 'vitest';
import { createMainViteConfig } from './viteMainConfig';

describe('createMainViteConfig', () => {
  it('targets Electron 22 Node 16 only for x32', () => {
    expect(createMainViteConfig({ WINDOWS_ARCH: 'x32' }, 'aibuddy').build.target).toBe('node16');
    expect(createMainViteConfig({ WINDOWS_ARCH: 'x64' }, 'aibuddy').build.target).toBe('node24');
    expect(createMainViteConfig({}, 'aibuddy').build.target).toBe('node24');
  });

  it('injects AIBuddy authentication defines from the environment override', () => {
    const config = createMainViteConfig(
      { AIBUDDY_AUTH_API_BASE_URL: 'https://oa.example' },
      'aibuddy'
    );

    expect(config.define).toMatchObject({
      'process.env.APP_EDITION': JSON.stringify('aibuddy'),
      __AUTH_MODE__: JSON.stringify('oa'),
      __AUTH_API_BASE_URL__: JSON.stringify('https://oa.example'),
    });
  });
});
