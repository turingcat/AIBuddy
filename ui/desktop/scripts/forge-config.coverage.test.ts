import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadForgeConfig() {
  vi.resetModules();
  const module = await import('../forge.config.ts');
  return module.default;
}

describe('Forge environment configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses repository and signing overrides when configured', async () => {
    vi.stubEnv('GITHUB_OWNER', 'configured-owner');
    vi.stubEnv('GITHUB_REPO', 'configured-repo');
    vi.stubEnv('WINDOWS_CERTIFICATE_FILE', 'certificate.pfx');
    vi.stubEnv('WINDOW_SIGNING_ROLE', 'configured-role');

    const config = await loadForgeConfig();

    expect(config.publishers[0].config.repository).toEqual({
      owner: 'configured-owner',
      name: 'configured-repo',
    });
    expect(config.packagerConfig.win32).toMatchObject({
      certificateFile: 'certificate.pfx',
      signingRole: 'configured-role',
    });
  });

  it('uses AIBuddy repository defaults', async () => {
    vi.stubEnv('GITHUB_OWNER', '');
    vi.stubEnv('GITHUB_REPO', '');

    const config = await loadForgeConfig();

    expect(config.publishers[0].config.repository).toEqual({
      owner: 'turingcat',
      name: 'AIBuddy',
    });
  });
});
