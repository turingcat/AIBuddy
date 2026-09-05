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
  it('carries the HeyBuddy x64 identity into the installer', () => {
    const args = buildInnoDefinitions(
      resolveBrand('heybuddy'),
      '1.0.1',
      'C:\\build\\dist',
      'C:\\artifacts',
      'x64'
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
      MyAppArch: 'x64',
    });
  });

  it('carries the x32 architecture into the installer', () => {
    const args = buildInnoDefinitions(
      resolveBrand('heybuddy'),
      '1.0.1',
      'C:\\build\\dist',
      'C:\\artifacts',
      'x32'
    );

    expect(definitionMap(args)).toMatchObject({
      OutputBaseFilename: 'HeyBuddy-windows-x32-setup',
      MyAppArch: 'x32',
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
  it('names the installers after the edition and architecture', () => {
    const brand = resolveBrand('heybuddy');

    expect(setupFileName(brand, 'x32')).toBe('HeyBuddy-windows-x32-setup.exe');
    expect(setupFileName(brand, 'x64')).toBe('HeyBuddy-windows-x64-setup.exe');
    expect(portableArchiveName).toBeUndefined();
  });
});

describe('resolveWindowsPackage', () => {
  it('describes the x32 package the PowerShell build consumes', () => {
    expect(
      resolveWindowsPackage(
        'heybuddy',
        '1.0.1',
        'C:\\build\\dist',
        'C:\\artifacts',
        'x32'
      )
    ).toEqual({
      edition: 'heybuddy',
      productName: 'HeyBuddy',
      appId: '{FDA43817-EFCC-42D0-AB69-D414B629E300}',
      executableName: 'HeyBuddy.exe',
      architecture: 'x32',
      electronArch: 'ia32',
      rustTarget: 'i686-pc-windows-msvc',
      packagedDirName: 'HeyBuddy-win32-ia32',
      setupFileName: 'HeyBuddy-windows-x32-setup.exe',
      isccArgs: buildInnoDefinitions(
        resolveBrand('heybuddy'),
        '1.0.1',
        'C:\\build\\dist',
        'C:\\artifacts',
        'x32'
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
