const { resolveBrand } = require('./brand');

// Inno Setup's AppVersion only accepts a plain numeric release; a suffix or a
// stray quote would either fail ISCC or leak into the /D command line.
const VERSION_PATTERN = /^\d+\.\d+\.\d+(\.\d+)?$/;

function buildInnoDefinitions(brand, version, sourceDir, outputDir) {
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
    OutputBaseFilename: `${brand.artifactStem}-windows-x64-setup`,
  }).map(([name, value]) => `/D${name}=${value}`);
}

function setupFileName(brand) {
  return `${brand.artifactStem}-windows-x64-setup.exe`;
}

function portableArchiveName(brand) {
  return `${brand.artifactStem}-windows-x64-portable.zip`;
}

function resolveWindowsPackage(version, sourceDir, outputDir) {
  const brand = resolveBrand();
  return {
    productName: brand.productName,
    appId: brand.windowsAppId,
    executableName: `${brand.executableName}.exe`,
    packagedDirName: `${brand.productName}-win32-x64`,
    setupFileName: setupFileName(brand),
    portableFileName: portableArchiveName(brand),
    isccArgs: buildInnoDefinitions(brand, version, sourceDir, outputDir),
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
  resolveWindowsPackage,
};
