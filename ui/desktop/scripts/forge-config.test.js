const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');
const forgeConfigPath = path.join(desktopRoot, 'forge.config.ts');
const forgeEnvKeys = [
  'GITHUB_OWNER',
  'GITHUB_REPO',
  'WINDOWS_CERTIFICATE_FILE',
  'WINDOW_SIGNING_ROLE',
];

function loadForgeIdentity(env = process.env) {
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `const config = require('./forge.config.ts');
        process.stdout.write(JSON.stringify({
          name: config.packagerConfig.name,
          executableName: config.packagerConfig.executableName,
          appBundleId: config.packagerConfig.appBundleId,
          protocols: config.packagerConfig.protocols,
          extraResource: config.packagerConfig.extraResource,
          icon: config.packagerConfig.icon,
  windowsIcon: config.packagerConfig.win32.icon,
  publisherRepo: config.publishers[0].config.repository.name
}));`,
    ],
    { cwd: desktopRoot, encoding: 'utf8', env }
  );

  return JSON.parse(output);
}

function loadForgeConfigInProcess(env) {
  const previousEnv = Object.fromEntries(forgeEnvKeys.map((key) => [key, process.env[key]]));

  try {
    for (const key of forgeEnvKeys) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }

    delete require.cache[require.resolve(forgeConfigPath)];
    return require(forgeConfigPath);
  } finally {
    delete require.cache[require.resolve(forgeConfigPath)];
    for (const key of forgeEnvKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

describe('Forge brand identity', () => {
  it('configures the fixed AIBuddy package identity', () => {
    const { publisherRepo: _publisherRepo, ...identity } = loadForgeIdentity();

    expect(identity).toEqual({
      name: 'AIBuddy',
      executableName: 'AIBuddy',
      appBundleId: 'com.electron.aibuddy',
      protocols: [
        { name: 'AIBuddyProtocol', schemes: ['aibuddy'] },
        { name: 'GooseNostrProtocol', schemes: ['goose'] },
      ],
      extraResource: ['src/bin', 'src/images/aibuddy'],
      icon: 'src/images/aibuddy/icon.icns',
      windowsIcon: 'src/images/aibuddy/icon.ico',
    });
  });

  it('uses the AIBuddy repository fallback when no override is configured', () => {
    const env = { ...process.env };
    delete env.GITHUB_REPO;

    expect(loadForgeIdentity(env).publisherRepo).toBe('AIBuddy');
  });

  it('loads fallback publisher configuration in the current process', () => {
    const env = { ...process.env };
    delete env.GITHUB_REPO;

    const config = loadForgeConfigInProcess(env);

    expect(config.publishers[0].config.repository.name).toBe('AIBuddy');
  });

  it('uses explicit publishing and Windows signing environment values', () => {
    const config = loadForgeConfigInProcess({
      ...process.env,
      GITHUB_OWNER: 'aaif-goose',
      GITHUB_REPO: 'desktop-release',
      WINDOWS_CERTIFICATE_FILE: '/tmp/aibuddy.pfx',
      WINDOW_SIGNING_ROLE: 'release-role',
    });

    expect(config.publishers[0].config).toMatchObject({
      repository: { name: 'desktop-release', owner: 'aaif-goose' },
    });
    expect(config.packagerConfig.win32).toMatchObject({
      certificateFile: '/tmp/aibuddy.pfx',
      signingRole: 'release-role',
    });
  });

  it('uses AIBuddy as the desktop document title', () => {
    const html = fs.readFileSync(path.join(desktopRoot, 'index.html'), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.title).toBe('AIBuddy');
  });
});
