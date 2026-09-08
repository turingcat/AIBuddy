const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { resolveBrand } = require('./brand');

const SUPPORTED_PLATFORMS = ['darwin', 'win32'];

function verifyPackageTree(brand, platform, root) {
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `Unsupported platform ${JSON.stringify(platform)}; expected one of: ${SUPPORTED_PLATFORMS.join(', ')}`
    );
  }

  const required =
    platform === 'darwin'
      ? [
          path.join(root, `${brand.productName}.app`, 'Contents', 'MacOS', brand.executableName),
          path.join(root, `${brand.productName}.app`, 'Contents', 'Resources', 'bin', 'aibuddy'),
        ]
      : [
          path.join(root, `${brand.executableName}.exe`),
          path.join(root, 'resources', 'bin', 'aibuddy.exe'),
        ];

  const problems = required.filter((file) => !fs.existsSync(file)).map((file) => `missing ${file}`);

  // A correctly named tree is what release automation globs for, so a package
  // built into another edition's directory has to fail even if its contents match.
  const expectedDirName =
    platform === 'darwin'
      ? `${brand.artifactStem}-darwin-arm64`
      : `${brand.productName}-win32-x64`;
  if (path.basename(root) !== expectedDirName) {
    problems.push(`package root ${path.basename(root)} is not named ${expectedDirName}`);
  }

  return problems;
}

function verifyInfoPlist(brand, plist) {
  const problems = [];

  if (plist.CFBundleIdentifier !== brand.bundleId) {
    problems.push(
      `CFBundleIdentifier is ${JSON.stringify(plist.CFBundleIdentifier)}, expected ${brand.bundleId}`
    );
  }

  const schemes = (plist.CFBundleURLTypes ?? []).flatMap((type) => type.CFBundleURLSchemes ?? []);
  if (!schemes.includes(brand.protocol)) {
    problems.push(`CFBundleURLTypes registers ${JSON.stringify(schemes)}, expected ${brand.protocol}`);
  }

  return problems;
}

function readInfoPlist(brand, root) {
  const plistPath = path.join(root, `${brand.productName}.app`, 'Contents', 'Info.plist');
  return JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', plistPath]));
}

function verifyPackage(brand, platform, root, readPlist = readInfoPlist) {
  const problems = verifyPackageTree(brand, platform, root);
  if (platform === 'darwin' && problems.length === 0) {
    problems.push(...verifyInfoPlist(brand, readPlist(brand, root)));
  }

  if (problems.length > 0) {
    throw new Error(`${brand.productName} package at ${root} is invalid:\n  ${problems.join('\n  ')}`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
}

if (require.main === module) {
  try {
    const { edition, platform, root } = parseArgs(process.argv.slice(2));
    const brand = resolveBrand(edition);
    verifyPackage(brand, platform, root);
    process.stdout.write(`${brand.productName} ${platform} package at ${root} is valid\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { verifyPackageTree, verifyInfoPlist, verifyPackage };
