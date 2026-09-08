const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveBrand } = require('./brand');
const { verifyInfoPlist, verifyPackageTree } = require('./verify-package');

const brand = resolveBrand();

function makePackageTree(platform, omittedAsset) {
  const packageName = platform === 'darwin' ? 'AIBuddy-darwin-arm64' : 'AIBuddy-win32-x64';
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'package-assets-')), packageName);
  const resources =
    platform === 'darwin'
      ? path.join(root, 'AIBuddy.app', 'Contents', 'Resources')
      : path.join(root, 'resources');

  if (platform === 'darwin') {
    const executable = path.join(root, 'AIBuddy.app', 'Contents', 'MacOS', 'AIBuddy');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, '');
    fs.mkdirSync(path.join(resources, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(resources, 'bin', 'aibuddy'), '');
  } else {
    fs.mkdirSync(path.join(resources, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'AIBuddy.exe'), '');
    fs.writeFileSync(path.join(resources, 'bin', 'aibuddy.exe'), '');
  }

  const assetsDir = path.join(resources, 'aibuddy');
  fs.mkdirSync(assetsDir, { recursive: true });
  for (const asset of [
    'icon.icns',
    'icon.ico',
    'icon.png',
    'iconTemplate.png',
    'iconTemplate@2x.png',
  ]) {
    if (asset !== omittedAsset) fs.writeFileSync(path.join(assetsDir, asset), '');
  }

  return root;
}

describe('packaged AIBuddy asset contracts', () => {
  it.each(['darwin', 'win32'])('requires runtime assets in the %s package', (platform) => {
    const root = makePackageTree(platform, 'iconTemplate.png');

    expect(verifyPackageTree(brand, platform, root)).toEqual([
      expect.stringContaining(path.join('aibuddy', 'iconTemplate.png')),
    ]);
  });

  it('requires the macOS AIBuddy Nostr compatibility scheme', () => {
    expect(
      verifyInfoPlist(brand, {
        CFBundleIdentifier: brand.bundleId,
        CFBundleURLTypes: [
          { CFBundleURLName: brand.protocolName, CFBundleURLSchemes: [brand.protocol] },
        ],
      })
    ).toEqual([expect.stringContaining('aibuddy')]);
  });

  it('uses the AIBuddy icon for the Windows installer', () => {
    const installer = fs.readFileSync(path.join(__dirname, '..', 'desktop-setup.iss'), 'utf8');

    expect(installer).toContain('SetupIconFile=src\\images\\aibuddy\\icon.ico');
    expect(installer).not.toMatch(/SetupIconFile=src\\images\\icon\.ico/);
  });
});
