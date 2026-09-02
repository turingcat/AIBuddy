const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPackageTree, verifyInfoPlist, verifyPackage } = require('./verify-package');
const { resolveBrand } = require('./brand');

function makeDarwinTree(root, productName, { omitGoose = false } = {}) {
  const contents = path.join(root, `${productName}.app`, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(contents, 'MacOS', productName), '');
  fs.writeFileSync(path.join(contents, 'Info.plist'), '');
  if (!omitGoose) {
    fs.mkdirSync(path.join(contents, 'Resources', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(contents, 'Resources', 'bin', 'goose'), '');
  }
  return root;
}

function makeWin32Tree(root, productName, { omitGoose = false } = {}) {
  fs.mkdirSync(path.join(root, 'resources', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, `${productName}.exe`), '');
  if (!omitGoose) {
    fs.writeFileSync(path.join(root, 'resources', 'bin', 'goose.exe'), '');
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

describe('verifyPackageTree', () => {
  it.each(['heybuddy', 'aibuddy'])('accepts a complete %s macOS tree', (edition) => {
    const brand = resolveBrand(edition);
    const root = makeDarwinTree(tempRoot(`${brand.artifactStem}-darwin-arm64`), brand.productName);

    expect(verifyPackageTree(brand, 'darwin', root)).toEqual([]);
  });

  it.each(['heybuddy', 'aibuddy'])('accepts a complete %s Windows tree', (edition) => {
    const brand = resolveBrand(edition);
    const root = makeWin32Tree(tempRoot(`${brand.productName}-win32-x64`), brand.productName);

    expect(verifyPackageTree(brand, 'win32', root)).toEqual([]);
  });

  // A swapped identity is the failure this whole verifier exists to catch: the
  // build succeeds and only the name inside the bundle betrays the wrong edition.
  it('rejects an AIBuddy tree checked against HeyBuddy', () => {
    const root = makeDarwinTree(tempRoot('AIBuddy-darwin-arm64'), 'AIBuddy');

    expect(verifyPackageTree(resolveBrand('heybuddy'), 'darwin', root)).toEqual([
      expect.stringContaining('HeyBuddy.app/Contents/MacOS/HeyBuddy'),
      expect.stringContaining('HeyBuddy.app/Contents/Resources/bin/goose'),
      expect.stringContaining('HeyBuddy-darwin-arm64'),
    ]);
  });

  it('rejects a Windows directory named for another edition', () => {
    const root = makeWin32Tree(tempRoot('HeyBuddy-win32-x64'), 'AIBuddy');

    expect(verifyPackageTree(resolveBrand('aibuddy'), 'win32', root)).toEqual([
      expect.stringContaining('AIBuddy-win32-x64'),
    ]);
  });

  it.each([
    ['darwin', makeDarwinTree, 'goose'],
    ['win32', makeWin32Tree, 'goose.exe'],
  ])('rejects a %s package with no embedded CLI', (platform, make, binary) => {
    const brand = resolveBrand('heybuddy');
    const dirName = platform === 'darwin' ? 'HeyBuddy-darwin-arm64' : 'HeyBuddy-win32-x64';
    const root = make(tempRoot(dirName), brand.productName, { omitGoose: true });

    expect(verifyPackageTree(brand, platform, root)).toEqual([expect.stringContaining(binary)]);
  });

  it('rejects an unsupported platform', () => {
    expect(() => verifyPackageTree(resolveBrand('heybuddy'), 'linux', '/tmp')).toThrow(/linux/);
  });
});

describe('verifyInfoPlist', () => {
  it.each(['heybuddy', 'aibuddy'])('accepts the %s bundle identity', (edition) => {
    const brand = resolveBrand(edition);

    expect(verifyInfoPlist(brand, plistFor(brand))).toEqual([]);
  });

  it('rejects the other edition bundle id', () => {
    const plist = plistFor(resolveBrand('aibuddy'));

    expect(verifyInfoPlist(resolveBrand('heybuddy'), plist)).toEqual([
      expect.stringContaining('com.electron.heybuddy'),
      expect.stringContaining('goose'),
    ]);
  });

  it('rejects a bundle that registers no URL scheme', () => {
    const plist = { ...plistFor(resolveBrand('heybuddy')), CFBundleURLTypes: [] };

    expect(verifyInfoPlist(resolveBrand('heybuddy'), plist)).toEqual([
      expect.stringContaining('goose'),
    ]);
  });
});

describe('verifyPackage', () => {
  it('reports every problem at once', () => {
    const brand = resolveBrand('heybuddy');
    const root = makeDarwinTree(tempRoot('AIBuddy-darwin-arm64'), 'AIBuddy');

    expect(() => verifyPackage(brand, 'darwin', root, () => plistFor(resolveBrand('aibuddy'))))
      .toThrow(/HeyBuddy\.app/);
  });

  it('passes a consistent package', () => {
    const brand = resolveBrand('aibuddy');
    const root = makeDarwinTree(tempRoot('AIBuddy-darwin-arm64'), brand.productName);

    expect(() => verifyPackage(brand, 'darwin', root, () => plistFor(brand))).not.toThrow();
  });
});
