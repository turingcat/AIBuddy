const {
  buildInnoDefinitions,
  portableArchiveName,
  setupFileName,
  resolveWindowsPackage,
} = require('./windows-package');
const { resolveBrand } = require('./brand');

function definitionMap(args) {
  return Object.fromEntries(
    args.map((arg) => {
      const [name, ...rest] = arg.replace(/^\/D/, '').split('=');
      return [name, rest.join('=')];
    })
  );
}

describe('buildInnoDefinitions', () => {
  it.each([
    ['heybuddy', 'HeyBuddy', '{FDA43817-EFCC-42D0-AB69-D414B629E300}'],
    ['aibuddy', 'AIBuddy', '{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}'],
  ])('carries the %s identity into the installer', (edition, productName, appId) => {
    const args = buildInnoDefinitions(
      resolveBrand(edition),
      '1.0.1',
      'C:\\build\\dist',
      'C:\\artifacts'
    );

    expect(args.every((arg) => arg.startsWith('/D'))).toBe(true);
    expect(definitionMap(args)).toEqual({
      MyAppName: productName,
      MyAppVersion: '1.0.1',
      MyAppId: appId,
      MyAppExeName: `${productName}.exe`,
      SourceDir: 'C:\\build\\dist',
      OutputDir: 'C:\\artifacts',
      OutputBaseFilename: `${productName}-windows-x64-setup`,
    });
  });

  // Each edition upgrades in place off its own AppId; sharing one would let
  // installing AIBuddy silently uninstall HeyBuddy.
  it('gives each edition a distinct AppId', () => {
    const [heybuddy, aibuddy] = ['heybuddy', 'aibuddy'].map(
      (edition) =>
        definitionMap(buildInnoDefinitions(resolveBrand(edition), '1.0.1', 'src', 'out')).MyAppId
    );

    expect(heybuddy).not.toBe(aibuddy);
  });

  it.each(['', '1.0', 'v1.0.1', '1.0.1-rc.1', '1.0.1; shutdown'])(
    'rejects the malformed version %j',
    (version) => {
      expect(() =>
        buildInnoDefinitions(resolveBrand('heybuddy'), version, 'src', 'out')
      ).toThrow(/version/i);
    }
  );

  it.each(['src', 'out'])('rejects a missing %s directory', (missing) => {
    const dirs = { src: 'C:\\build\\dist', out: 'C:\\artifacts' };
    dirs[missing] = '';
    expect(() =>
      buildInnoDefinitions(resolveBrand('heybuddy'), '1.0.1', dirs.src, dirs.out)
    ).toThrow(/director/i);
  });
});

describe('release artifact names', () => {
  it.each([
    ['heybuddy', 'HeyBuddy'],
    ['aibuddy', 'AIBuddy'],
  ])('names the %s artifacts after the edition', (edition, productName) => {
    const brand = resolveBrand(edition);

    expect(setupFileName(brand)).toBe(`${productName}-windows-x64-setup.exe`);
    expect(portableArchiveName(brand)).toBe(`${productName}-windows-x64-portable.zip`);
  });
});

describe('resolveWindowsPackage', () => {
  it('describes the package the PowerShell build consumes', () => {
    expect(resolveWindowsPackage('aibuddy', '1.0.1', 'C:\\build\\dist', 'C:\\artifacts')).toEqual({
      edition: 'aibuddy',
      productName: 'AIBuddy',
      appId: '{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}',
      executableName: 'AIBuddy.exe',
      packagedDirName: 'AIBuddy-win32-x64',
      setupFileName: 'AIBuddy-windows-x64-setup.exe',
      portableFileName: 'AIBuddy-windows-x64-portable.zip',
      isccArgs: buildInnoDefinitions(
        resolveBrand('aibuddy'),
        '1.0.1',
        'C:\\build\\dist',
        'C:\\artifacts'
      ),
    });
  });

  it.each(['', 'goose', 'HEYBUDDY'])('rejects the edition %j', (edition) => {
    expect(() => resolveWindowsPackage(edition, '1.0.1', 'src', 'out')).toThrow(/APP_EDITION/);
  });

  it('falls back to APP_EDITION when the CLI omits the edition', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');

    expect(resolveWindowsPackage(undefined, '1.0.1', 'src', 'out').edition).toBe('aibuddy');

    vi.unstubAllEnvs();
  });
});
