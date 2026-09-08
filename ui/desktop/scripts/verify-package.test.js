const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPackageTree, verifyInfoPlist, verifyPackage } = require('./verify-package');
const { resolveBrand } = require('./brand');

function makeDarwinTree(root, productName, { omitHeyBuddy = false } = {}) {
  const contents = path.join(root, `${productName}.app`, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(contents, 'MacOS', productName), '');
  fs.writeFileSync(path.join(contents, 'Info.plist'), '');
  if (!omitHeyBuddy) {
    fs.mkdirSync(path.join(contents, 'Resources', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(contents, 'Resources', 'bin', 'heybuddy'), '');
  }
  return root;
}

function makeWin32Tree(root, productName, { omitHeyBuddy = false } = {}) {
  fs.mkdirSync(path.join(root, 'resources', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, `${productName}.exe`), '');
  if (!omitHeyBuddy) {
    fs.writeFileSync(path.join(root, 'resources', 'bin', 'heybuddy.exe'), '');
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
    const brand = resolveBrand('heybuddy');
    const root = makeDarwinTree(tempRoot(`${brand.artifactStem}-darwin-arm64`), brand.productName);

    expect(verifyPackageTree(brand, 'darwin', root)).toEqual([]);
  });

  it('accepts a complete Windows tree', () => {
    const brand = resolveBrand('heybuddy');
    const root = makeWin32Tree(tempRoot(`${brand.productName}-win32-x64`), brand.productName);

    expect(verifyPackageTree(brand, 'win32', root)).toEqual([]);
  });

  // A swapped identity is the failure this whole verifier exists to catch: the
  // build succeeds and only the name inside the bundle betrays the wrong product.
  it('rejects a foreign tree checked against HeyBuddy', () => {
    const root = makeDarwinTree(tempRoot('OtherApp-darwin-arm64'), foreignBrand.productName);

    expect(verifyPackageTree(resolveBrand('heybuddy'), 'darwin', root)).toEqual([
      expect.stringContaining('HeyBuddy.app/Contents/MacOS/HeyBuddy'),
      expect.stringContaining('HeyBuddy.app/Contents/Resources/bin/heybuddy'),
      expect.stringContaining('HeyBuddy-darwin-arm64'),
    ]);
  });

  it('rejects a Windows directory named for another product', () => {
    const brand = resolveBrand('heybuddy');
    const root = makeWin32Tree(tempRoot('OtherApp-win32-x64'), brand.productName);

    expect(verifyPackageTree(brand, 'win32', root)).toEqual([
      expect.stringContaining('HeyBuddy-win32-x64'),
    ]);
  });

  it.each([
    ['darwin', makeDarwinTree, 'heybuddy'],
    ['win32', makeWin32Tree, 'heybuddy.exe'],
  ])('rejects a %s package with no embedded CLI', (platform, make, binary) => {
    const brand = resolveBrand('heybuddy');
    const dirName = platform === 'darwin' ? 'HeyBuddy-darwin-arm64' : 'HeyBuddy-win32-x64';
    const root = make(tempRoot(dirName), brand.productName, { omitHeyBuddy: true });

    expect(verifyPackageTree(brand, platform, root)).toEqual([expect.stringContaining(binary)]);
  });

  it('rejects an unsupported platform', () => {
    expect(() => verifyPackageTree(resolveBrand('heybuddy'), 'linux', '/tmp')).toThrow(/linux/);
  });
});

describe('verifyInfoPlist', () => {
  it('accepts the HeyBuddy bundle identity', () => {
    const brand = resolveBrand('heybuddy');

    expect(verifyInfoPlist(brand, plistFor(brand))).toEqual([]);
  });

  it('rejects a foreign bundle id', () => {
    const plist = plistFor(foreignBrand);

    expect(verifyInfoPlist(resolveBrand('heybuddy'), plist)).toEqual([
      expect.stringContaining('com.electron.heybuddy'),
      expect.stringContaining('heybuddy'),
    ]);
  });

  it('rejects a bundle that registers no URL scheme', () => {
    const plist = { ...plistFor(resolveBrand('heybuddy')), CFBundleURLTypes: [] };

    expect(verifyInfoPlist(resolveBrand('heybuddy'), plist)).toEqual([
      expect.stringContaining('heybuddy'),
    ]);
  });
});

describe('verifyPackage', () => {
  it('reports every problem at once', () => {
    const brand = resolveBrand('heybuddy');
    const root = makeDarwinTree(tempRoot('OtherApp-darwin-arm64'), foreignBrand.productName);

    expect(() => verifyPackage(brand, 'darwin', root, () => plistFor(foreignBrand))).toThrow(
      /HeyBuddy\.app/
    );
  });

  it('passes a consistent package', () => {
    const brand = resolveBrand('heybuddy');
    const root = makeDarwinTree(tempRoot('HeyBuddy-darwin-arm64'), brand.productName);

    expect(() => verifyPackage(brand, 'darwin', root, () => plistFor(brand))).not.toThrow();
  });
});
