const { execFileSync } = require('node:child_process');
const path = require('node:path');

const brandScript = path.join(__dirname, 'brand.js');

describe('authentication branding', () => {
  it('resolves AIBuddy OA authentication metadata', () => {
    const { resolveBrand } = require('./brand');

    expect(resolveBrand('aibuddy')).toMatchObject({
      authMode: 'oa',
      authApiBaseUrl: 'https://ai.linyeyun.cn',
    });
  });
});

describe('resolveBrand', () => {
  it('resolves the complete AIBuddy identity', () => {
    const { resolveBrand } = require('./brand');

    expect(resolveBrand('aibuddy')).toEqual({
      edition: 'aibuddy',
      productName: 'AIBuddy',
      bundleId: 'com.electron.aibuddy',
      protocol: 'aibuddy',
      protocolName: 'AIBuddyProtocol',
      windowsAppId: '{FDA43817-EFCC-42D0-AB69-D414B629E300}',
      executableName: 'AIBuddy',
      artifactStem: 'AIBuddy',
      iconStem: 'icon',
      authMode: 'oa',
      authApiBaseUrl: 'https://ai.linyeyun.cn',
    });
  });

  it('rejects a missing edition', () => {
    const { resolveBrand } = require('./brand');
    vi.stubEnv('APP_EDITION', undefined);

    expect(() => resolveBrand()).toThrow(/APP_EDITION.*aibuddy/);

    vi.unstubAllEnvs();
  });

  it('rejects an unsupported edition', () => {
    const { resolveBrand } = require('./brand');

    expect(() => resolveBrand('goose')).toThrow(/goose.*aibuddy/);
  });

  it('returns immutable brand data', () => {
    const { resolveBrand } = require('./brand');

    expect(Object.isFrozen(resolveBrand('aibuddy'))).toBe(true);
  });
});

describe('brand CLI', () => {
  it('prints one requested scalar field', () => {
    expect(
      execFileSync(process.execPath, [brandScript, 'aibuddy', 'productName'], {
        encoding: 'utf8',
      })
    ).toBe('AIBuddy\n');
  });

  it('rejects an unknown field', () => {
    expect(() =>
      execFileSync(process.execPath, [brandScript, 'aibuddy', 'missing'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow();
  });
});
