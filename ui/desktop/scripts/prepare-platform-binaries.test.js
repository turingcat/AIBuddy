const { resolveWindowsUvRelease } = require('./prepare-platform-binaries');

describe('resolveWindowsUvRelease', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['ia32', 'x64'])('uses the workflow ELECTRON_ARCH %s before WINDOWS_ARCH', (arch) => {
    vi.stubEnv('ELECTRON_ARCH', arch);
    vi.stubEnv('WINDOWS_ARCH', arch === 'ia32' ? 'x64' : 'x32');
    expect(resolveWindowsUvRelease()).toEqual(resolveWindowsUvRelease(arch));
  });

  it.each(['x32', 'x64'])('falls back to WINDOWS_ARCH %s without ELECTRON_ARCH', (arch) => {
    vi.stubEnv('ELECTRON_ARCH', '');
    vi.stubEnv('WINDOWS_ARCH', arch);
    expect(resolveWindowsUvRelease()).toEqual(windowsUvRelease(arch));
  });

  it('falls back to the host architecture without workflow overrides', () => {
    vi.stubEnv('ELECTRON_ARCH', '');
    vi.stubEnv('WINDOWS_ARCH', '');
    if (process.arch === 'ia32' || process.arch === 'x64') {
      expect(resolveWindowsUvRelease()).toEqual(resolveWindowsUvRelease(process.arch));
    } else {
      expect(() => resolveWindowsUvRelease()).toThrow(/WINDOWS_ARCH/);
    }
  });

  it('selects the pinned 32-bit uv release for ia32 packaging', () => {
    expect(resolveWindowsUvRelease('ia32')).toEqual({
      target: 'i686-pc-windows-msvc',
      url: 'https://github.com/astral-sh/uv/releases/download/0.11.11/uv-i686-pc-windows-msvc.zip',
      hashes: {
        'uv.exe': 'cddbdecdf0f488c7d11085d44436a3bf87a40777b1cfebdc0cbca83cb3ebbe85',
        'uvx.exe': 'b19c9ef61e0caa1a1092fbafb887b4ba4ef6951b15565ad6cd087124598da09a',
      },
    });
  });

  it('selects the pinned 64-bit uv release for x64 packaging', () => {
    expect(resolveWindowsUvRelease('x64')).toEqual({
      target: 'x86_64-pc-windows-msvc',
      url: 'https://github.com/astral-sh/uv/releases/download/0.11.11/uv-x86_64-pc-windows-msvc.zip',
      hashes: {
        'uv.exe': 'b1645e948603c12dd741987d0c072471195e18dd299b42334477ceac694f0af8',
        'uvx.exe': '0305c488dc29c16df1483c02a902d21a6798b0744f8e9eb34271d6b3e4bf6e2a',
      },
    });
  });

  it('rejects unsupported Electron architectures', () => {
    expect(() => resolveWindowsUvRelease('arm64')).toThrow(/WINDOWS_ARCH/);
  });
});

const { windowsUvRelease } = require('./prepare-platform-binaries');

describe('windowsUvRelease', () => {
  it('selects the i686 uv release for x32', () => {
    expect(typeof windowsUvRelease).toBe('function');

    const release = windowsUvRelease('x32');
    expect(release.url).toMatch(/uv-i686-pc-windows-msvc\.zip$/);
    expect(release.hashes['uv.exe']).toMatch(/^[a-f0-9]{64}$/);
    expect(release.hashes['uvx.exe']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('selects the x86_64 uv release for x64', () => {
    const release = windowsUvRelease('x64');
    expect(release.url).toMatch(/uv-x86_64-pc-windows-msvc\.zip$/);
    expect(release.hashes['uv.exe']).toMatch(/^[a-f0-9]{64}$/);
    expect(release.hashes['uvx.exe']).toMatch(/^[a-f0-9]{64}$/);
  });
});
