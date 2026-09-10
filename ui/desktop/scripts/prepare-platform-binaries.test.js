const { windowsUvRelease } = require('./prepare-platform-binaries');

describe('windowsUvRelease', () => {
  it('does not download the incompatible generic x32 uv release', () => {
    expect(() => windowsUvRelease('x32')).toThrow(/built from source/);
  });

  it('selects the x86_64 uv release for x64', () => {
    const release = windowsUvRelease('x64');
    expect(release.url).toMatch(/uv-x86_64-pc-windows-msvc\.zip$/);
    expect(release.hashes['uv.exe']).toMatch(/^[a-f0-9]{64}$/);
    expect(release.hashes['uvx.exe']).toMatch(/^[a-f0-9]{64}$/);
  });
});
