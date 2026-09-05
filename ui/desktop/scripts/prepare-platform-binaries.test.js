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
