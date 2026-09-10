const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveBrand } = require('./brand');
const { verifyInfoPlist, verifyPackage, verifyPackageTree } = require('./verify-package');

const brand = resolveBrand();
const runtimeAssets = [
  'icon.icns',
  'icon.ico',
  'icon.png',
  'iconTemplate.png',
  'iconTemplate@2x.png',
];

function tempRoot(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-package-')), name);
}

function makeRuntimeAssets(resourcesDir, omitAsset) {
  const assetsDir = path.join(resourcesDir, 'aibuddy');
  fs.mkdirSync(assetsDir, { recursive: true });
  for (const asset of runtimeAssets) {
    if (asset !== omitAsset) fs.writeFileSync(path.join(assetsDir, asset), '');
  }
}

function makeDarwinTree(root, { omitAIBuddy = false, omitAsset = null } = {}) {
  const contents = path.join(root, `${brand.productName}.app`, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(contents, 'MacOS', brand.executableName), '');
  fs.writeFileSync(path.join(contents, 'Info.plist'), '');
  if (!omitAIBuddy) {
    fs.mkdirSync(path.join(contents, 'Resources', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(contents, 'Resources', 'bin', 'aibuddy'), '');
  }
  makeRuntimeAssets(path.join(contents, 'Resources'), omitAsset);
  return root;
}

function makeWin32Tree(root, { omitAIBuddy = false, omitAsset = null } = {}) {
  fs.mkdirSync(path.join(root, 'resources', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, `${brand.executableName}.exe`), '');
  if (!omitAIBuddy) fs.writeFileSync(path.join(root, 'resources', 'bin', 'aibuddy.exe'), '');
  makeRuntimeAssets(path.join(root, 'resources'), omitAsset);
  return root;
}

function plistFor() {
  return {
    CFBundleIdentifier: brand.bundleId,
    CFBundleName: brand.productName,
    CFBundleExecutable: brand.executableName,
    CFBundleURLTypes: [
      { CFBundleURLName: brand.protocolName, CFBundleURLSchemes: [brand.protocol] },
      { CFBundleURLName: 'GooseNostrProtocol', CFBundleURLSchemes: ['goose'] },
    ],
  };
}

describe('verifyPackageTree', () => {
  it('rejects unsupported package platforms', () => {
    expect(() => verifyPackageTree(brand, 'linux', tempRoot('AIBuddy-linux-x64'))).toThrow(
      'Unsupported platform "linux"'
    );
  });

  it('accepts a complete AIBuddy macOS tree', () => {
    expect(
      verifyPackageTree(brand, 'darwin', makeDarwinTree(tempRoot('AIBuddy-darwin-arm64')))
    ).toEqual([]);
  });

  it('accepts a complete AIBuddy Windows tree', () => {
    expect(verifyPackageTree(brand, 'win32', makeWin32Tree(tempRoot('AIBuddy-win32-x64')))).toEqual(
      []
    );
  });

  it('rejects a tree named for another product', () => {
    expect(
      verifyPackageTree(brand, 'darwin', makeDarwinTree(tempRoot('OtherApp-darwin-arm64')))
    ).toEqual([expect.stringContaining('AIBuddy-darwin-arm64')]);
  });

  it.each([
    ['darwin', makeDarwinTree, 'aibuddy'],
    ['win32', makeWin32Tree, 'aibuddy.exe'],
  ])('rejects a %s package without the embedded CLI', (platform, make, binary) => {
    const name = platform === 'darwin' ? 'AIBuddy-darwin-arm64' : 'AIBuddy-win32-x64';
    expect(verifyPackageTree(brand, platform, make(tempRoot(name), { omitAIBuddy: true }))).toEqual([
      expect.stringContaining(binary),
    ]);
  });
});

describe('verifyInfoPlist', () => {
  it('accepts the fixed AIBuddy bundle identity', () => {
    expect(verifyInfoPlist(brand, plistFor())).toEqual([]);
  });

  it('rejects a missing AIBuddy URL scheme', () => {
    expect(verifyInfoPlist(brand, { ...plistFor(), CFBundleURLTypes: [] })).toEqual([
      expect.stringContaining('aibuddy'),
      expect.stringContaining('goose'),
    ]);
  });

  it('rejects a plist without URL type metadata', () => {
    const plist = plistFor();
    delete plist.CFBundleURLTypes;

    expect(verifyInfoPlist(brand, plist)).toEqual([
      expect.stringContaining('aibuddy'),
      expect.stringContaining('goose'),
    ]);
  });

  it('rejects a mismatched bundle identifier and URL type without schemes', () => {
    expect(
      verifyInfoPlist(brand, {
        ...plistFor(),
        CFBundleIdentifier: 'com.electron.otherapp',
        CFBundleURLTypes: [{}],
      })
    ).toEqual([
      expect.stringContaining('com.electron.otherapp'),
      expect.stringContaining('aibuddy'),
      expect.stringContaining('goose'),
    ]);
  });
});

describe('verifyPackage', () => {
  it('accepts the fixed AIBuddy package', () => {
    const root = makeDarwinTree(tempRoot('AIBuddy-darwin-arm64'));
    expect(() => verifyPackage(brand, 'darwin', root, plistFor)).not.toThrow();
  });

  it('accepts a Windows package without reading a macOS plist', () => {
    const root = makeWin32Tree(tempRoot('AIBuddy-win32-x64'));
    expect(() => verifyPackage(brand, 'win32', root)).not.toThrow();
  });

  it('rejects an invalid tree before reading a macOS plist', () => {
    const root = tempRoot('AIBuddy-darwin-arm64');

    expect(() =>
      verifyPackage(brand, 'darwin', root, () => {
        throw new Error('plist reader should not run');
      })
    ).toThrow(/missing/);
  });
});
