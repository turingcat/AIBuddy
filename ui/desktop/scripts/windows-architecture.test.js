function loadArchitectureModule() {
  return require('./windows-architecture');
}

describe('resolveWindowsArchitecture', () => {
  it('describes the x32 build inputs', () => {
    expect(() => loadArchitectureModule()).not.toThrow();

    const { resolveWindowsArchitecture } = loadArchitectureModule();
    expect(resolveWindowsArchitecture('x32')).toEqual({
      name: 'x32',
      electronArch: 'ia32',
      rustTarget: 'i686-win7-windows-msvc',
      nodeArch: 'x86',
      uvTarget: 'i686-pc-windows-msvc',
    });
  });

  it('describes the x64 build inputs', () => {
    const { resolveWindowsArchitecture } = loadArchitectureModule();
    expect(resolveWindowsArchitecture('x64')).toEqual({
      name: 'x64',
      electronArch: 'x64',
      rustTarget: 'x86_64-pc-windows-msvc',
      nodeArch: 'x64',
      uvTarget: 'x86_64-pc-windows-msvc',
    });
  });

  it('defaults to WINDOWS_ARCH and then x64', () => {
    const { resolveWindowsArchitecture } = loadArchitectureModule();

    vi.stubEnv('WINDOWS_ARCH', 'x32');
    expect(resolveWindowsArchitecture().name).toBe('x32');
    vi.unstubAllEnvs();

    expect(resolveWindowsArchitecture().name).toBe('x64');
  });

  it('rejects unsupported architectures', () => {
    const { resolveWindowsArchitecture } = loadArchitectureModule();
    expect(() => resolveWindowsArchitecture('arm64')).toThrow(/WINDOWS_ARCH/);
  });
});
