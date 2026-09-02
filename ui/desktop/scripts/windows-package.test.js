const {
  buildInnoDefinitions,
  portableArchiveName,
  resolveWindowsPackage,
  setupFileName,
} = require('./windows-package');
const { resolveBrand } = require('./brand');

function definitionMap(args) {
  return Object.fromEntries(args.map((arg) => {
    const [name, ...rest] = arg.replace(/^\/D/, '').split('=');
    return [name, rest.join('=')];
  }));
}

describe('buildInnoDefinitions', () => {
  it('builds AIBuddy Inno definitions', () => {
    const args = buildInnoDefinitions(resolveBrand(), '1.2.3', 'dist', 'out');

    expect(args.every((arg) => arg.startsWith('/D'))).toBe(true);
    expect(definitionMap(args)).toEqual({
      MyAppName: 'AIBuddy',
      MyAppVersion: '1.2.3',
      MyAppId: '{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}',
      MyAppExeName: 'AIBuddy.exe',
      SourceDir: 'dist',
      OutputDir: 'out',
      OutputBaseFilename: 'AIBuddy-windows-x64-setup',
    });
  });

  it.each(['', '1.0', 'v1.0.1', '1.0.1-rc.1', '1.0.1.2.3'])('rejects invalid version %j', (version) => {
    expect(() => buildInnoDefinitions(resolveBrand(), version, 'src', 'out')).toThrow(/version/i);
  });
});

describe('release artifact names', () => {
  it('uses the AIBuddy artifact stem', () => {
    const brand = resolveBrand();

    expect(setupFileName(brand)).toBe('AIBuddy-windows-x64-setup.exe');
    expect(portableArchiveName(brand)).toBe('AIBuddy-windows-x64-portable.zip');
  });
});

describe('resolveWindowsPackage', () => {
  it('describes the AIBuddy package consumed by the PowerShell build', () => {
    expect(resolveWindowsPackage('1.0.1', 'C:\\build\\dist', 'C:\\artifacts')).toEqual({
      productName: 'AIBuddy',
      appId: '{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}',
      executableName: 'AIBuddy.exe',
      packagedDirName: 'AIBuddy-win32-x64',
      setupFileName: 'AIBuddy-windows-x64-setup.exe',
      portableFileName: 'AIBuddy-windows-x64-portable.zip',
      isccArgs: buildInnoDefinitions(
        resolveBrand(),
        '1.0.1',
        'C:\\build\\dist',
        'C:\\artifacts'
      ),
    });
  });
});
