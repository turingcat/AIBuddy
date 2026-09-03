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
  it('carries the HeyBuddy identity into the installer', () => {
    const args = buildInnoDefinitions(
      resolveBrand('heybuddy'),
      '1.0.1',
      'C:\\build\\dist',
      'C:\\artifacts'
    );

    expect(args.every((arg) => arg.startsWith('/D'))).toBe(true);
    expect(definitionMap(args)).toEqual({
      MyAppName: 'HeyBuddy',
      MyAppVersion: '1.0.1',
      MyAppId: '{FDA43817-EFCC-42D0-AB69-D414B629E300}',
      MyAppExeName: 'HeyBuddy.exe',
      SourceDir: 'C:\\build\\dist',
      OutputDir: 'C:\\artifacts',
      OutputBaseFilename: 'HeyBuddy-windows-x64-setup',
    });
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
  it('names the artifacts after the edition', () => {
    const brand = resolveBrand('heybuddy');

    expect(setupFileName(brand)).toBe('HeyBuddy-windows-x64-setup.exe');
    expect(portableArchiveName(brand)).toBe('HeyBuddy-windows-x64-portable.zip');
  });
});

describe('resolveWindowsPackage', () => {
  it('describes the package the PowerShell build consumes', () => {
    expect(resolveWindowsPackage('heybuddy', '1.0.1', 'C:\\build\\dist', 'C:\\artifacts')).toEqual({
      edition: 'heybuddy',
      productName: 'HeyBuddy',
      appId: '{FDA43817-EFCC-42D0-AB69-D414B629E300}',
      executableName: 'HeyBuddy.exe',
      packagedDirName: 'HeyBuddy-win32-x64',
      setupFileName: 'HeyBuddy-windows-x64-setup.exe',
      portableFileName: 'HeyBuddy-windows-x64-portable.zip',
      isccArgs: buildInnoDefinitions(
        resolveBrand('heybuddy'),
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
    vi.stubEnv('APP_EDITION', 'heybuddy');

    expect(resolveWindowsPackage(undefined, '1.0.1', 'src', 'out').edition).toBe('heybuddy');

    vi.unstubAllEnvs();
  });
});
