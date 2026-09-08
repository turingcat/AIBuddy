const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPackageTree, verifyInfoPlist, verifyPackage } = require('./verify-package');
const { resolveBrand } = require('./brand');

function makeDarwinTree(root, productName, { omitAIBuddy = false } = {}) {
  const contents = path.join(root, `${productName}.app`, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(contents, 'MacOS', productName), '');
  fs.writeFileSync(path.join(contents, 'Info.plist'), '');
  if (!omitAIBuddy) {
    fs.mkdirSync(path.join(contents, 'Resources', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(contents, 'Resources', 'bin', 'aibuddy'), '');
  }
  return root;
}

function makeWin32Tree(root, productName, { omitAIBuddy = false } = {}) {
  fs.mkdirSync(path.join(root, 'resources', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, `${productName}.exe`), '');
  if (!omitAIBuddy) {
    fs.writeFileSync(path.join(root, 'resources', 'bin', 'aibuddy.exe'), '');
  }
  return root;
}

function tempRoot(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-package-'));
  return path.join(dir, name);
}

function plistFor(brand) {
  return {
    CFBundleIdentifier: brand.bundleId,
    CFBundleName: brand.productName,
    CFBundleExecutable: brand.executableName,
    CFBundleURLTypes: [
      { CFBundleURLName: brand.protocolName, CFBundleURLSchemes: [brand.protocol] },
    ],
  };
}

// The verifier exists to catch a package built under the wrong identity, so the
// negative cases check a tree carrying a foreign product name.
const foreignBrand = {
  edition: 'otherapp',
  productName: 'OtherApp',
  bundleId: 'com.electron.otherapp',
  protocol: 'otherapp',
  protocolName: 'OtherAppProtocol',
  executableName: 'OtherApp',
  artifactStem: 'OtherApp',
};

describe('verifyPackageTree', () => {
  it('accepts a complete macOS tree', () => {
    const brand = resolveBrand('aibuddy');
    const root = makeDarwinTree(tempRoot(`${brand.artifactStem}-darwin-arm64`), brand.productName);

    expect(verifyPackageTree(brand, 'darwin', root)).toEqual([]);
  });

  it('accepts a complete Windows tree', () => {
    const brand = resolveBrand('aibuddy');
    const root = makeWin32Tree(tempRoot(`${brand.productName}-win32-x64`), brand.productName);

    expect(verifyPackageTree(brand, 'win32', root)).toEqual([]);
  });

  // A swapped identity is the failure this whole verifier exists to catch: the
  // build succeeds and only the name inside the bundle betrays the wrong product.
  it('rejects a foreign tree checked against AIBuddy', () => {
    const root = makeDarwinTree(tempRoot('OtherApp-darwin-arm64'), foreignBrand.productName);

    expect(verifyPackageTree(resolveBrand('aibuddy'), 'darwin', root)).toEqual([
      expect.stringContaining('AIBuddy.app/Contents/MacOS/AIBuddy'),
      expect.stringContaining('AIBuddy.app/Contents/Resources/bin/aibuddy'),
      expect.stringContaining('AIBuddy-darwin-arm64'),
    ]);
  });

  it('rejects a Windows directory named for another product', () => {
    const brand = resolveBrand('aibuddy');
    const root = makeWin32Tree(tempRoot('OtherApp-win32-x64'), brand.productName);

    expect(verifyPackageTree(brand, 'win32', root)).toEqual([
      expect.stringContaining('AIBuddy-win32-x64'),
    ]);
  });

  it.each([
    ['darwin', makeDarwinTree, 'aibuddy'],
    ['win32', makeWin32Tree, 'aibuddy.exe'],
  ])('rejects a %s package with no embedded CLI', (platform, make, binary) => {
    const brand = resolveBrand('aibuddy');
    const dirName = platform === 'darwin' ? 'AIBuddy-darwin-arm64' : 'AIBuddy-win32-x64';
    const root = make(tempRoot(dirName), brand.productName, { omitAIBuddy: true });

    expect(verifyPackageTree(brand, platform, root)).toEqual([expect.stringContaining(binary)]);
  });

  it('rejects an unsupported platform', () => {
    expect(() => verifyPackageTree(resolveBrand('aibuddy'), 'linux', '/tmp')).toThrow(/linux/);
  });
});

describe('verifyInfoPlist', () => {
  it('accepts the AIBuddy bundle identity', () => {
    const brand = resolveBrand('aibuddy');

    expect(verifyInfoPlist(brand, plistFor(brand))).toEqual([]);
  });

  it('rejects a foreign bundle id', () => {
    const plist = plistFor(foreignBrand);

    expect(verifyInfoPlist(resolveBrand('aibuddy'), plist)).toEqual([
      expect.stringContaining('com.electron.aibuddy'),
      expect.stringContaining('aibuddy'),
    ]);
  });

  it('rejects a bundle that registers no URL scheme', () => {
    const plist = { ...plistFor(resolveBrand('aibuddy')), CFBundleURLTypes: [] };

    expect(verifyInfoPlist(resolveBrand('aibuddy'), plist)).toEqual([
      expect.stringContaining('aibuddy'),
    ]);
  });
});

describe('verifyPackage', () => {
  it('reports every problem at once', () => {
    const brand = resolveBrand('aibuddy');
    const root = makeDarwinTree(tempRoot('OtherApp-darwin-arm64'), foreignBrand.productName);

    expect(() => verifyPackage(brand, 'darwin', root, () => plistFor(foreignBrand))).toThrow(
      /AIBuddy\.app/
    );
  });

  it('passes a consistent package', () => {
    const brand = resolveBrand('aibuddy');
    const root = makeDarwinTree(tempRoot('AIBuddy-darwin-arm64'), brand.productName);

    expect(() => verifyPackage(brand, 'darwin', root, () => plistFor(brand))).not.toThrow();
  });
});
