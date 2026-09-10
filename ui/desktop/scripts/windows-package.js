const { resolveBrand } = require('./brand');
const { resolveWindowsArchitecture } = require('./windows-architecture');

const { resolveWindowsVersion } = require('./windows-release-version');

function buildInnoDefinitions(brand, version, sourceDir, outputDir, architecture) {
  const releaseVersion = resolveWindowsVersion(version);
  if (!sourceDir) {
    throw new Error('Missing installer source directory');
  }
  if (!outputDir) {
    throw new Error('Missing installer output directory');
  }
  const windowsArchitecture = resolveWindowsArchitecture(architecture);

  return Object.entries({
    MyAppName: brand.productName,
    MyAppVersion: releaseVersion,
    MyAppNumericVersion: releaseVersion.split('-')[0],
    MyAppId: brand.windowsAppId,
    MyAppExeName: `${brand.executableName}.exe`,
    SourceDir: sourceDir,
    OutputDir: outputDir,
    OutputBaseFilename: setupFileName(brand, windowsArchitecture.name, releaseVersion).slice(0, -4),
    MyAppArch: windowsArchitecture.name,
  }).map(([name, value]) => `/D${name}=${value}`);
}

function setupFileName(brand, architecture, version) {
  const windowsArchitecture = resolveWindowsArchitecture(architecture);
  return `${brand.artifactStem}-windows-${windowsArchitecture.name}-V${resolveWindowsVersion(version)}.exe`;
}

function resolveWindowsPackage(edition, version, sourceDir, outputDir, architecture) {
  version = resolveWindowsVersion(version);
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
    setupFileName: setupFileName(brand, windowsArchitecture.name, version),
    isccArgs: buildInnoDefinitions(brand, version, sourceDir, outputDir, windowsArchitecture.name),
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
