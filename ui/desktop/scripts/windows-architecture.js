const WINDOWS_ARCHITECTURES = Object.freeze({
  x32: Object.freeze({
    name: 'x32',
    electronArch: 'ia32',
    rustTarget: 'i686-pc-windows-msvc',
    nodeArch: 'x86',
    uvTarget: 'i686-pc-windows-msvc',
  }),
  x64: Object.freeze({
    name: 'x64',
    electronArch: 'x64',
    rustTarget: 'x86_64-pc-windows-msvc',
    nodeArch: 'x64',
    uvTarget: 'x86_64-pc-windows-msvc',
  }),
});

function resolveWindowsArchitecture(name = process.env.WINDOWS_ARCH || 'x64') {
  const architecture = WINDOWS_ARCHITECTURES[name];
  if (!architecture) {
    throw new Error(`Unsupported WINDOWS_ARCH ${JSON.stringify(name)}; expected x32 or x64`);
  }
  return architecture;
}

module.exports = { resolveWindowsArchitecture };
