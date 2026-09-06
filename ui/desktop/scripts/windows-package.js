const { resolveBrand } = require('./brand');
const { resolveWindowsArchitecture } = require('./windows-architecture');

// Inno Setup's AppVersion only accepts a plain numeric release; a suffix or a
// stray quote would either fail ISCC or leak into the /D command line.
const VERSION_PATTERN = /^\d+\.\d+\.\d+(\.\d+)?$/;
const WINDOWS_ARCHITECTURES = {
  x32: {
    electronArch: 'ia32',
    innoAllowed: 'x86compatible and not x64compatible',
    installIn64BitMode: '0',
  },
  x64: {
    electronArch: 'x64',
    innoAllowed: 'x64compatible',
    installIn64BitMode: '1',
  },
};

function resolveArchitecture(architecture) {
  const resolved = WINDOWS_ARCHITECTURES[architecture];
  if (!resolved) {
    throw new Error(
      `Unsupported Windows architecture ${JSON.stringify(architecture)}; expected x32 or x64`
    );
  }
  return { ...resolved, rustTarget: resolveWindowsArchitecture(architecture).rustTarget };
}

function buildInnoDefinitions(brand, architecture, version, sourceDir, outputDir) {
  const architectureConfig = resolveArchitecture(architecture);
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid installer version ${JSON.stringify(version)}; expected x.y.z`);
  }
  if (!sourceDir) {
    throw new Error('Missing installer source directory');
  }
  if (!outputDir) {
    throw new Error('Missing installer output directory');
  }

  return Object.entries({
    MyAppName: brand.productName,
    MyAppVersion: version,
    MyAppId: brand.windowsAppId,
    MyAppExeName: `${brand.executableName}.exe`,
    SourceDir: sourceDir,
    OutputDir: outputDir,
    OutputBaseFilename: `${brand.artifactStem}-windows-${architecture}-setup`,
    MyArchitecturesAllowed: architectureConfig.innoAllowed,
    MyInstallIn64BitMode: architectureConfig.installIn64BitMode,
  }).map(([name, value]) => `/D${name}=${value}`);
}

function setupFileName(brand, architecture) {
  resolveArchitecture(architecture);
  return `${brand.artifactStem}-windows-${architecture}-setup.exe`;
}

function portableArchiveName(brand, architecture) {
  resolveArchitecture(architecture);
  return `${brand.artifactStem}-windows-${architecture}-portable.zip`;
}

function resolveWindowsPackage(architecture, version, sourceDir, outputDir) {
  const brand = resolveBrand();
  const architectureConfig = resolveArchitecture(architecture);
  return {
    architecture,
    electronArch: architectureConfig.electronArch,
    rustTarget: architectureConfig.rustTarget,
    productName: brand.productName,
    appId: brand.windowsAppId,
    executableName: `${brand.executableName}.exe`,
    packagedDirName: `${brand.productName}-win32-${architectureConfig.electronArch}`,
    setupFileName: setupFileName(brand, architecture),
    portableFileName: portableArchiveName(brand, architecture),
    isccArgs: buildInnoDefinitions(brand, architecture, version, sourceDir, outputDir),
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(resolveWindowsPackage(...process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildInnoDefinitions,
  setupFileName,
  portableArchiveName,
  resolveArchitecture,
  resolveWindowsPackage,
};
