const { execFileSync } = require('node:child_process');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');

function loadForgeIdentity(edition) {
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
    {
      cwd: desktopRoot,
      encoding: 'utf8',
      env: { ...process.env, APP_EDITION: edition },
    }
  );
  return JSON.parse(output);
}

describe('Forge brand identity', () => {
  it('configures HeyBuddy package identity', () => {
    expect(loadForgeIdentity('heybuddy')).toEqual({
      name: 'HeyBuddy',
      executableName: 'HeyBuddy',
      appBundleId: 'com.electron.heybuddy',
      protocolName: 'GooseProtocol',
      protocol: 'goose',
      icon: 'src/images/icon.icns',
      windowsIcon: 'src/images/icon.ico',
    });
  });
});
