const { execFileSync } = require('node:child_process');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');

function loadForgeIdentity() {
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `const config = require('./forge.config.ts');
const protocol = config.packagerConfig.protocols[0];
process.stdout.write(JSON.stringify({
  name: config.packagerConfig.name,
  executableName: config.packagerConfig.executableName,
  appBundleId: config.packagerConfig.appBundleId,
  protocolName: protocol.name,
  protocol: protocol.schemes[0],
  icon: config.packagerConfig.icon,
  windowsIcon: config.packagerConfig.win32.icon
}));`,
    ],
    { cwd: desktopRoot, encoding: 'utf8', env: process.env }
  );

  return JSON.parse(output);
}

describe('Forge brand identity', () => {
  it('configures the fixed AIBuddy package identity', () => {
    expect(loadForgeIdentity()).toEqual({
      name: 'AIBuddy',
      executableName: 'AIBuddy',
      appBundleId: 'com.electron.aibuddy',
      protocolName: 'AIBuddyProtocol',
      protocol: 'aibuddy',
      icon: 'src/images/aibuddy/icon.icns',
      windowsIcon: 'src/images/aibuddy/icon.ico',
    });
  });
});
