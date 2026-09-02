const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');

function loadForgeIdentity(env = process.env) {
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
  windowsIcon: config.packagerConfig.win32.icon,
  publisherRepo: config.publishers[0].config.repository.name
}));`,
    ],
    { cwd: desktopRoot, encoding: 'utf8', env }
  );

  return JSON.parse(output);
}

describe('Forge brand identity', () => {
  it('configures the fixed AIBuddy package identity', () => {
    const { publisherRepo: _publisherRepo, ...identity } = loadForgeIdentity();

    expect(identity).toEqual({
      name: 'AIBuddy',
      executableName: 'AIBuddy',
      appBundleId: 'com.electron.aibuddy',
      protocolName: 'AIBuddyProtocol',
      protocol: 'aibuddy',
      icon: 'src/images/aibuddy/icon.icns',
      windowsIcon: 'src/images/aibuddy/icon.ico',
    });
  });

  it('uses the AIBuddy repository fallback when no override is configured', () => {
    const env = { ...process.env };
    delete env.GITHUB_REPO;

    expect(loadForgeIdentity(env).publisherRepo).toBe('AIBuddy');
  });

  it('uses AIBuddy as the desktop document title', () => {
    const html = fs.readFileSync(path.join(desktopRoot, 'index.html'), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.title).toBe('AIBuddy');
  });
});
