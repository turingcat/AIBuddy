const { execFileSync } = require('node:child_process');
const path = require('node:path');

const brandScript = path.join(__dirname, 'brand.js');

describe('authentication branding', () => {
  it('resolves HeyBuddy OA authentication metadata', () => {
    const { resolveBrand } = require('./brand');

    expect(resolveBrand('heybuddy')).toMatchObject({
      authMode: 'oa',
      authApiBaseUrl: 'https://ai.linyeyun.cn',
    });
  });
});

describe('resolveBrand', () => {
  it('resolves the complete HeyBuddy identity', () => {
    const { resolveBrand } = require('./brand');

    expect(resolveBrand('heybuddy')).toEqual({
      edition: 'heybuddy',
      productName: 'HeyBuddy',
      bundleId: 'com.electron.heybuddy',
      protocol: 'goose',
      protocolName: 'GooseProtocol',
      windowsAppId: '{FDA43817-EFCC-42D0-AB69-D414B629E300}',
      executableName: 'HeyBuddy',
      artifactStem: 'HeyBuddy',
      iconStem: 'icon',
      authMode: 'oa',
      authApiBaseUrl: 'https://ai.linyeyun.cn',
    });
  });

  it('rejects a missing edition', () => {
    const { resolveBrand } = require('./brand');
    vi.stubEnv('APP_EDITION', undefined);

    expect(() => resolveBrand()).toThrow(/APP_EDITION.*heybuddy/);

    vi.unstubAllEnvs();
  });

  it('rejects an unsupported edition', () => {
    const { resolveBrand } = require('./brand');

    expect(() => resolveBrand('goose')).toThrow(/goose.*heybuddy/);
  });

  it('returns immutable brand data', () => {
    const { resolveBrand } = require('./brand');

    expect(Object.isFrozen(resolveBrand('heybuddy'))).toBe(true);
  });
});

describe('brand CLI', () => {
  it('prints one requested scalar field', () => {
    expect(
      execFileSync(process.execPath, [brandScript, 'heybuddy', 'productName'], {
        encoding: 'utf8',
      })
    ).toBe('HeyBuddy\n');
  });

  it('rejects an unknown field', () => {
    expect(() =>
      execFileSync(process.execPath, [brandScript, 'heybuddy', 'missing'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow();
  });
});
