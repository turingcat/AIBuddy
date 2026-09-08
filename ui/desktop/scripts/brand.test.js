const { execFileSync } = require('node:child_process');
const path = require('node:path');

const brandScript = path.join(__dirname, 'brand.js');

describe('resolveBrand', () => {
  it('resolves the complete AIBuddy identity', () => {
    const { resolveBrand } = require('./brand');

    expect(resolveBrand()).toEqual({
      edition: 'aibuddy',
      productName: 'AIBuddy',
      bundleId: 'com.electron.aibuddy',
      protocol: 'aibuddy',
      protocolName: 'AIBuddyProtocol',
      windowsAppId: '{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}',
      executableName: 'AIBuddy',
      artifactStem: 'AIBuddy',
      iconStem: 'aibuddy/icon',
      authMode: 'sub2api',
      authApiBaseUrl: 'https://tflow.online',
    });
  });

  it('does not use APP_EDITION', () => {
    const { resolveBrand } = require('./brand');
    const previousEdition = process.env.APP_EDITION;
    process.env.APP_EDITION = 'aibuddy';

    expect(resolveBrand().productName).toBe('AIBuddy');

    if (previousEdition === undefined) {
      delete process.env.APP_EDITION;
    } else {
      process.env.APP_EDITION = previousEdition;
    }
  });

  it('returns immutable brand data', () => {
    const { resolveBrand } = require('./brand');

    expect(Object.isFrozen(resolveBrand())).toBe(true);
  });
});

describe('brand CLI', () => {
  it('prints one requested scalar field without an edition argument', () => {
    expect(execFileSync(process.execPath, [brandScript, 'artifactStem'], { encoding: 'utf8' })).toBe(
      'AIBuddy\n'
    );
  });

  it('rejects unknown fields', () => {
    expect(() =>
      execFileSync(process.execPath, [brandScript, 'missing'], { encoding: 'utf8', stdio: 'pipe' })
    ).toThrow();
  });
});
