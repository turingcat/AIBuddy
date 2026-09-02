const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveBrand } = require('./brand');
const { verifyInfoPlist, verifyPackage, verifyPackageTree } = require('./verify-package');

const brand = resolveBrand();

function tempRoot(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-package-')), name);
}

function makeDarwinTree(root, { omitGoose = false } = {}) {
  const contents = path.join(root, `${brand.productName}.app`, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(contents, 'MacOS', brand.executableName), '');
  fs.writeFileSync(path.join(contents, 'Info.plist'), '');
  if (!omitGoose) {
    fs.mkdirSync(path.join(contents, 'Resources', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(contents, 'Resources', 'bin', 'goose'), '');
  }
  return root;
}

function makeWin32Tree(root, { omitGoose = false } = {}) {
  fs.mkdirSync(path.join(root, 'resources', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, `${brand.executableName}.exe`), '');
  if (!omitGoose) fs.writeFileSync(path.join(root, 'resources', 'bin', 'goose.exe'), '');
  return root;
}

function plistFor() {
  return {
    CFBundleIdentifier: brand.bundleId,
    CFBundleName: brand.productName,
    CFBundleExecutable: brand.executableName,
    CFBundleURLTypes: [{ CFBundleURLName: brand.protocolName, CFBundleURLSchemes: [brand.protocol] }],
  };
}

describe('verifyPackageTree', () => {
  it('accepts a complete AIBuddy macOS tree', () => {
    expect(verifyPackageTree(brand, 'darwin', makeDarwinTree(tempRoot('AIBuddy-darwin-arm64')))).toEqual([]);
  });

  it('accepts a complete AIBuddy Windows tree', () => {
    expect(verifyPackageTree(brand, 'win32', makeWin32Tree(tempRoot('AIBuddy-win32-x64')))).toEqual([]);
  });

  it('rejects a tree named for another product', () => {
    expect(verifyPackageTree(brand, 'darwin', makeDarwinTree(tempRoot('HeyBuddy-darwin-arm64')))).toEqual([
      expect.stringContaining('AIBuddy-darwin-arm64'),
    ]);
  });

  it.each([
    ['darwin', makeDarwinTree, 'goose'],
    ['win32', makeWin32Tree, 'goose.exe'],
  ])('rejects a %s package without the embedded CLI', (platform, make, binary) => {
    const name = platform === 'darwin' ? 'AIBuddy-darwin-arm64' : 'AIBuddy-win32-x64';
    expect(verifyPackageTree(brand, platform, make(tempRoot(name), { omitGoose: true }))).toEqual([
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
    ]);
  });
});

describe('verifyPackage', () => {
  it('accepts the fixed AIBuddy package', () => {
    const root = makeDarwinTree(tempRoot('AIBuddy-darwin-arm64'));
    expect(() => verifyPackage(brand, 'darwin', root, plistFor)).not.toThrow();
  });
});
