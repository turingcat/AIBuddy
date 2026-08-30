const { execFileSync } = require('node:child_process');
const path = require('node:path');

const brandScript = path.join(__dirname, 'brand.js');

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
    });
  });

  it('resolves the complete AIBuddy identity', () => {
    const { resolveBrand } = require('./brand');

    expect(resolveBrand('aibuddy')).toEqual({
      edition: 'aibuddy',
      productName: 'AIBuddy',
      bundleId: 'com.electron.aibuddy',
      protocol: 'aibuddy',
      protocolName: 'AIBuddyProtocol',
      windowsAppId: '{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}',
      executableName: 'AIBuddy',
      artifactStem: 'AIBuddy',
    });
  });

  it('rejects a missing edition', () => {
    const { resolveBrand } = require('./brand');
    vi.stubEnv('APP_EDITION', undefined);

    expect(() => resolveBrand()).toThrow(/APP_EDITION.*heybuddy, aibuddy/);

    vi.unstubAllEnvs();
  });

  it('rejects an unsupported edition', () => {
    const { resolveBrand } = require('./brand');

    expect(() => resolveBrand('goose')).toThrow(/goose.*heybuddy, aibuddy/);
  });

  it('returns immutable brand data', () => {
    const { resolveBrand } = require('./brand');

    expect(Object.isFrozen(resolveBrand('heybuddy'))).toBe(true);
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
      execFileSync(process.execPath, [brandScript, 'heybuddy', 'missing'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow();
  });
});
