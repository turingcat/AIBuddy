const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildInnoDefinitions,
  portableArchiveName,
  resolveWindowsPackage,
  setupFileName,
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
    ['x32', 'x86compatible and not x64compatible', '0'],
    ['x64', 'x64compatible', '1'],
  ])('builds AIBuddy %s Inno definitions', (architecture, allowed, installIn64BitMode) => {
    const args = buildInnoDefinitions(resolveBrand(), architecture, '1.2.3', 'dist', 'out');

    expect(args.every((arg) => arg.startsWith('/D'))).toBe(true);
    expect(definitionMap(args)).toEqual({
      MyAppName: 'AIBuddy',
      MyAppVersion: '1.2.3',
      MyAppId: '{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}',
      MyAppExeName: 'AIBuddy.exe',
      SourceDir: 'dist',
      OutputDir: 'out',
      OutputBaseFilename: `AIBuddy-windows-${architecture}-setup`,
      MyArchitecturesAllowed: allowed,
      MyInstallIn64BitMode: installIn64BitMode,
    });
  });

  it.each(['', '1.0', 'v1.0.1', '1.0.1-rc.1', '1.0.1.2.3'])(
    'rejects invalid version %j',
    (version) => {
      expect(() => buildInnoDefinitions(resolveBrand(), 'x64', version, 'src', 'out')).toThrow(
        /version/i
      );
    }
  );

  it.each(['sourceDir', 'outputDir'])('rejects a missing %s', (missing) => {
    const directories = { sourceDir: 'src', outputDir: 'out' };
    directories[missing] = '';

    expect(() =>
      buildInnoDefinitions(
        resolveBrand(),
        'x64',
        '1.0.1',
        directories.sourceDir,
        directories.outputDir
      )
    ).toThrow(/directory/i);
  });

  it('rejects unsupported Windows architectures', () => {
    expect(() => buildInnoDefinitions(resolveBrand(), 'arm64', '1.0.1', 'src', 'out')).toThrow(
      /architecture/i
    );
  });
});

describe('release artifact names', () => {
  it.each(['x32', 'x64'])('uses the AIBuddy %s artifact stem', (architecture) => {
    const brand = resolveBrand();

    expect(setupFileName(brand, architecture)).toBe(`AIBuddy-windows-${architecture}-setup.exe`);
    expect(portableArchiveName(brand, architecture)).toBe(
      `AIBuddy-windows-${architecture}-portable.zip`
    );
  });
});

describe('resolveWindowsPackage', () => {
  it.each([
    ['x32', 'ia32'],
    ['x64', 'x64'],
  ])('describes the AIBuddy %s package consumed by automation', (architecture, electronArch) => {
    expect(
      resolveWindowsPackage(architecture, '1.0.1', 'C:\\build\\dist', 'C:\\artifacts')
    ).toEqual({
      architecture,
      electronArch,
      rustTarget: architecture === 'x32' ? 'i686-pc-windows-msvc' : 'x86_64-pc-windows-msvc',
      productName: 'AIBuddy',
      appId: '{6D21D2A5-3C17-4F2B-8E61-91B39598A2D7}',
      executableName: 'AIBuddy.exe',
      packagedDirName: `AIBuddy-win32-${electronArch}`,
      setupFileName: `AIBuddy-windows-${architecture}-setup.exe`,
      portableFileName: `AIBuddy-windows-${architecture}-portable.zip`,
      isccArgs: buildInnoDefinitions(
        resolveBrand(),
        architecture,
        '1.0.1',
        'C:\\build\\dist',
        'C:\\artifacts'
      ),
    });
  });
});

describe('Windows packaging automation contracts', () => {
  const repositoryRoot = path.resolve(__dirname, '../../..');

  it('keeps the Windows bundle workflow parseable', () => {
    expect(() =>
      execFileSync(
        'ruby',
        [
          '-e',
          "require 'yaml'; YAML.load_file(ARGV.fetch(0))",
          '.github/workflows/bundle-windows.yml',
        ],
        {
          cwd: repositoryRoot,
          stdio: 'pipe',
        }
      )
    ).not.toThrow();
  });

  it('keeps AIBuddy upload artifacts inside the upload action options', () => {
    const output = execFileSync(
      'ruby',
      [
        '-rjson',
        '-ryaml',
        '-e',
        "workflow = YAML.load_file(ARGV.fetch(0)); step = workflow['jobs']['package-desktop-windows']['steps'].find { |entry| entry['name'] == 'Upload Windows build' }; puts JSON.generate(step)",
        '.github/workflows/bundle-windows.yml',
      ],
      { cwd: repositoryRoot, encoding: 'utf8' }
    );
    const upload = JSON.parse(output);

    expect(upload.with.path.trim().split(/\r?\n/)).toEqual([
      '${{ steps.package-windows-zip.outputs.portable_file_name }}',
      '${{ steps.package-windows-installer.outputs.setup_file_name }}',
    ]);
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(upload.with.overwrite).toBe(true);
  });

  it('does not apply the removed edition validator to the proxy parameter', () => {
    const script = fs.readFileSync(path.join(repositoryRoot, 'build-windows.ps1'), 'utf8');

    expect(script).not.toMatch(/\[ValidateSet\('aibuddy', 'aibuddy'\)\]/);
    expect(script).not.toMatch(/build-windows\.ps1\s+-Edition/);
  });
});
