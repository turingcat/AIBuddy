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
  it('carries the AIBuddy x64 identity into the installer', () => {
    const args = buildInnoDefinitions(
      resolveBrand('aibuddy'),
      '1.0.1',
      'C:\\build\\dist',
      'C:\\artifacts',
      'x64'
    );

    expect(args.every((arg) => arg.startsWith('/D'))).toBe(true);
    expect(definitionMap(args)).toEqual({
      MyAppName: 'AIBuddy',
      MyAppVersion: '1.0.1',
      MyAppId: '{FDA43817-EFCC-42D0-AB69-D414B629E300}',
      MyAppExeName: 'AIBuddy.exe',
      SourceDir: 'C:\\build\\dist',
      OutputDir: 'C:\\artifacts',
      OutputBaseFilename: 'AIBuddy-windows-x64-setup',
      MyAppArch: 'x64',
    });
  });

  it('carries the x32 architecture into the installer', () => {
    const args = buildInnoDefinitions(
      resolveBrand('aibuddy'),
      '1.0.1',
      'C:\\build\\dist',
      'C:\\artifacts',
      'x32'
    );

    expect(definitionMap(args)).toMatchObject({
      OutputBaseFilename: 'AIBuddy-windows-x32-setup',
      MyAppArch: 'x32',
    });
  });

  it.each(['', '1.0', 'v1.0.1', '1.0.1-rc.1', '1.0.1; shutdown'])(
    'rejects the malformed version %j',
    (version) => {
      expect(() =>
        buildInnoDefinitions(resolveBrand('aibuddy'), version, 'src', 'out')
      ).toThrow(/version/i);
    }
  );

  it.each(['src', 'out'])('rejects a missing %s directory', (missing) => {
    const dirs = { src: 'C:\\build\\dist', out: 'C:\\artifacts' };
    dirs[missing] = '';
    expect(() =>
      buildInnoDefinitions(resolveBrand('aibuddy'), '1.0.1', dirs.src, dirs.out)
    ).toThrow(/director/i);
  });
});

describe('release artifact names', () => {
  it('names the installers after the edition and architecture', () => {
    const brand = resolveBrand('aibuddy');

    expect(setupFileName(brand, 'x32')).toBe('AIBuddy-windows-x32-setup.exe');
    expect(setupFileName(brand, 'x64')).toBe('AIBuddy-windows-x64-setup.exe');
    expect(portableArchiveName).toBeUndefined();
  });
});

describe('resolveWindowsPackage', () => {
  it('describes the x32 package the PowerShell build consumes', () => {
    expect(
      resolveWindowsPackage(
        'aibuddy',
        '1.0.1',
        'C:\\build\\dist',
        'C:\\artifacts',
        'x32'
      )
    ).toEqual({
      edition: 'aibuddy',
      productName: 'AIBuddy',
      appId: '{FDA43817-EFCC-42D0-AB69-D414B629E300}',
      executableName: 'AIBuddy.exe',
      architecture: 'x32',
      electronArch: 'ia32',
      rustTarget: 'i686-pc-windows-msvc',
      packagedDirName: 'AIBuddy-win32-ia32',
      setupFileName: 'AIBuddy-windows-x32-setup.exe',
      isccArgs: buildInnoDefinitions(
        resolveBrand('aibuddy'),
        '1.0.1',
        'C:\\build\\dist',
        'C:\\artifacts',
        'x32'
      ),
    });
  });

  it.each(['', 'goose', 'AIBUDDY'])('rejects the edition %j', (edition) => {
    expect(() => resolveWindowsPackage(edition, '1.0.1', 'src', 'out')).toThrow(/APP_EDITION/);
  });

  it('falls back to APP_EDITION when the CLI omits the edition', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');

    expect(resolveWindowsPackage(undefined, '1.0.1', 'src', 'out').edition).toBe('aibuddy');

    vi.unstubAllEnvs();
  });
});
