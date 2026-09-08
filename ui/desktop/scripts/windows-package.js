const { resolveBrand } = require('./brand');
const { resolveWindowsArchitecture } = require('./windows-architecture');

// Inno Setup's AppVersion only accepts a plain numeric release; a suffix or a
// stray quote would either fail ISCC or leak into the /D command line.
const VERSION_PATTERN = /^\d+\.\d+\.\d+(\.\d+)?$/;

function buildInnoDefinitions(brand, version, sourceDir, outputDir, architecture) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid installer version ${JSON.stringify(version)}; expected x.y.z`);
  }
  if (!sourceDir) {
    throw new Error('Missing installer source directory');
  }
  if (!outputDir) {
    throw new Error('Missing installer output directory');
  }
  const windowsArchitecture = resolveWindowsArchitecture(architecture);

  return Object.entries({
    MyAppName: brand.productName,
    MyAppVersion: version,
    MyAppId: brand.windowsAppId,
    MyAppExeName: `${brand.executableName}.exe`,
    SourceDir: sourceDir,
    OutputDir: outputDir,
    OutputBaseFilename: `${brand.artifactStem}-windows-${windowsArchitecture.name}-setup`,
    MyAppArch: windowsArchitecture.name,
  }).map(([name, value]) => `/D${name}=${value}`);
}

function setupFileName(brand, architecture) {
  const windowsArchitecture = resolveWindowsArchitecture(architecture);
  return `${brand.artifactStem}-windows-${windowsArchitecture.name}-setup.exe`;
}

function resolveWindowsPackage(edition, version, sourceDir, outputDir, architecture) {
  const brand = resolveBrand(edition);
  const windowsArchitecture = resolveWindowsArchitecture(architecture);

  return {
    edition: brand.edition,
    productName: brand.productName,
    appId: brand.windowsAppId,
    executableName: `${brand.executableName}.exe`,
    architecture: windowsArchitecture.name,
    electronArch: windowsArchitecture.electronArch,
    rustTarget: windowsArchitecture.rustTarget,
    packagedDirName: `${brand.productName}-win32-${windowsArchitecture.electronArch}`,
    setupFileName: setupFileName(brand, windowsArchitecture.name),
    isccArgs: buildInnoDefinitions(
      brand,
      version,
      sourceDir,
      outputDir,
      windowsArchitecture.name
    ),
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
  resolveWindowsPackage,
};
