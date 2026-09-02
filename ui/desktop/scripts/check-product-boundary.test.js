const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  findProductBoundaryViolations,
  isDesktopConfigurationFile,
} = require('./check-product-boundary');

const fixtureRoots = [];

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-boundary-'));
  fixtureRoots.push(root);
  return root;
}

function writeFixture(root, relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyChecker(root) {
  const destination = path.join(root, 'ui/desktop/scripts/check-product-boundary.js');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'check-product-boundary.js'), destination);
  return destination;
}

afterEach(() => {
  fixtureRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});
describe('findProductBoundaryViolations', () => {
  it('reports legacy product markers in active product sources', () => {
    const root = createFixture();
    writeFixture(root, 'ui/desktop/src/runtime.ts', 'const host = "https://ai.linyeyun.cn";');
    writeFixture(root, 'ui/desktop/scripts/auth.js', 'process.env.HEYBUDDY_AUTH_API_BASE_URL;');
    writeFixture(
      root,
      'ui/desktop/forge.config.ts',
      'if (process.env.APP_EDITION === "heybuddy") {}'
    );
    writeFixture(root, 'ui/desktop/src/preload.ts', 'export const login = loginViaOA;');
    writeFixture(root, 'ui/desktop/src/migration.ts', 'migrateLegacyAIBuddyData();');
    writeFixture(
      root,
      'crates/goose-providers/src/declarative/definitions/heybuddy.json',
      '{"name":"heybuddy","api_key_env":"HEYBUDDY_API_KEY"}'
    );

    expect(findProductBoundaryViolations(root)).toEqual([
      {
        file: 'crates/goose-providers/src/declarative/definitions/heybuddy.json',
        pattern: 'bundled heybuddy provider definition',
      },
      {
        file: 'crates/goose-providers/src/declarative/definitions/heybuddy.json',
        pattern: 'HeyBuddy provider credential variable',
      },
      { file: 'ui/desktop/forge.config.ts', pattern: 'APP_EDITION active usage' },
      { file: 'ui/desktop/scripts/auth.js', pattern: 'HEYBUDDY_AUTH_API_BASE_URL' },
      { file: 'ui/desktop/src/migration.ts', pattern: 'AIBuddy legacy migration identifier' },
      { file: 'ui/desktop/src/preload.ts', pattern: 'OA login implementation or IPC identifier' },
      { file: 'ui/desktop/src/runtime.ts', pattern: 'ai.linyeyun.cn' },
    ]);
  });

  it('reports active edition selection without reporting comments or documentation', () => {
    const root = createFixture();
    writeFixture(
      root,
      'ui/desktop/src/runtime.ts',
      [
        '// APP_EDITION is no longer supported.',
        'const edition = process.env.APP_EDITION;',
        'const label = "APP_EDITION";',
      ].join('\n')
    );
    writeFixture(root, 'ui/desktop/src/edition-guide.md', 'APP_EDITION was a legacy setting.');

    expect(findProductBoundaryViolations(root)).toEqual([
      { file: 'ui/desktop/src/runtime.ts', pattern: 'APP_EDITION active usage' },
    ]);
  });

  it('rejects a HeyBuddy provider selection without rejecting Goose compatibility configuration', () => {
    const root = createFixture();
    writeFixture(
      root,
      'ui/desktop/src/gooseServeEnv.ts',
      "const env = { GOOSE_PROVIDER: 'aibuddy', GOOSE_PATH_ROOT: '/aibuddy/goose' };"
    );
    writeFixture(root, 'ui/desktop/scripts/start.sh', 'GOOSE_PROVIDER=heybuddy goose serve');

    expect(findProductBoundaryViolations(root)).toEqual([
      { file: 'ui/desktop/scripts/start.sh', pattern: 'HeyBuddy provider selection' },
    ]);
  });

  it('rejects HeyBuddy provider values in shell, object, JSON, and YAML configuration', () => {
    const root = createFixture();
    writeFixture(root, 'ui/desktop/scripts/start.sh', 'export GOOSE_PROVIDER = heybuddy');
    writeFixture(
      root,
      'ui/desktop/src/gooseServeEnv.ts',
      "const env = { 'GOOSE_PROVIDER': 'heybuddy' };"
    );
    writeFixture(root, 'ui/desktop/src/provider.json', '{"GOOSE_PROVIDER": "heybuddy"}');
    writeFixture(root, 'ui/desktop/src/provider.yaml', 'GOOSE_PROVIDER : "heybuddy"');

    expect(findProductBoundaryViolations(root)).toEqual([
      { file: 'ui/desktop/scripts/start.sh', pattern: 'HeyBuddy provider selection' },
      { file: 'ui/desktop/src/gooseServeEnv.ts', pattern: 'HeyBuddy provider selection' },
      { file: 'ui/desktop/src/provider.json', pattern: 'HeyBuddy provider selection' },
      { file: 'ui/desktop/src/provider.yaml', pattern: 'HeyBuddy provider selection' },
    ]);
  });

  it('rejects HeyBuddy process environment provider assignments without rejecting AIBuddy or Goose paths', () => {
    const root = createFixture();
    writeFixture(
      root,
      'ui/desktop/src/provider-dot.ts',
      'process.env.GOOSE_PROVIDER = "heybuddy";'
    );
    writeFixture(
      root,
      'ui/desktop/src/provider-bracket.ts',
      "process.env['GOOSE_PROVIDER'] = 'heybuddy';"
    );
    writeFixture(
      root,
      'ui/desktop/src/provider-aibuddy.ts',
      "process.env.GOOSE_PROVIDER = 'aibuddy'; process.env.GOOSE_PATH_ROOT = '/aibuddy/goose';"
    );

    expect(findProductBoundaryViolations(root)).toEqual([
      { file: 'ui/desktop/src/provider-bracket.ts', pattern: 'HeyBuddy provider selection' },
      { file: 'ui/desktop/src/provider-dot.ts', pattern: 'HeyBuddy provider selection' },
    ]);
  });

  it('rejects HeyBuddy login, OA, and product identity copy without rejecting generic Goose names', () => {
    const root = createFixture();
    writeFixture(root, 'ui/desktop/src/LoginView.tsx', '登录 HeyBuddy; 公司OA;');
    writeFixture(root, 'ui/desktop/src/Welcome.tsx', 'Welcome to HeyBuddy');
    writeFixture(root, 'ui/desktop/forge.config.ts', 'const app = { productName: "HeyBuddy" };');
    writeFixture(
      root,
      'ui/desktop/src/gooseServeEnv.ts',
      "const env = { GOOSE_PROVIDER: 'aibuddy', GOOSE_PATH_ROOT: '/aibuddy/goose' };"
    );

    expect(findProductBoundaryViolations(root)).toEqual([
      { file: 'ui/desktop/forge.config.ts', pattern: 'HeyBuddy product identity' },
      { file: 'ui/desktop/src/LoginView.tsx', pattern: 'Company OA copy' },
      { file: 'ui/desktop/src/LoginView.tsx', pattern: 'HeyBuddy login copy' },
      { file: 'ui/desktop/src/Welcome.tsx', pattern: 'HeyBuddy welcome copy' },
    ]);
  });

  it('allows only checker fixture literals while reporting forbidden markers in unrelated test files', () => {
    const root = createFixture();
    writeFixture(
      root,
      'ui/desktop/scripts/check-product-boundary.test.js',
      ['GOOSE_PROVIDER=heybuddy', '登录 HeyBuddy', '公司OA'].join('\n')
    );
    writeFixture(root, 'ui/desktop/src/unrelated.test.ts', 'const legacy = "登录 HeyBuddy";');

    expect(findProductBoundaryViolations(root)).toEqual([
      { file: 'ui/desktop/src/unrelated.test.ts', pattern: 'HeyBuddy login copy' },
    ]);
  });

  it('scans prompt, HTML, and announcement product surfaces', () => {
    const root = createFixture();
    writeFixture(root, 'crates/goose/src/prompts/system.md', '<h1>HeyBuddy</h1>');
    writeFixture(
      root,
      'ui/desktop/index.html',
      "<script>const assistantName = 'HeyBuddy';</script>"
    );
    writeFixture(root, 'ui/desktop/announcements/release.md', 'HeyBuddyLoginForm login-via-oa');

    expect(findProductBoundaryViolations(root)).toEqual([
      { file: 'crates/goose/src/prompts/system.md', pattern: 'HeyBuddy visible identity' },
      { file: 'ui/desktop/announcements/release.md', pattern: 'HeyBuddy login component' },
      { file: 'ui/desktop/announcements/release.md', pattern: 'OA login route' },
      { file: 'ui/desktop/index.html', pattern: 'HeyBuddy visible identity' },
    ]);
  });

  it('ignores historical design documents and generated output', () => {
    const root = createFixture();
    const legacyContent = [
      'https://ai.linyeyun.cn',
      'HEYBUDDY_AUTH_API_BASE_URL',
      'APP_EDITION === "heybuddy"',
    ].join('\n');
    writeFixture(root, 'docs/superpowers/plans/legacy.md', legacyContent);
    writeFixture(root, 'docs/superpowers/plans/identity.md', '<h1>HeyBuddy</h1> login-via-oa');
    writeFixture(root, 'ui/desktop/out/main.js', legacyContent);
    writeFixture(root, 'ui/desktop/node_modules/example/index.js', legacyContent);
    writeFixture(root, 'ui/desktop/src/__snapshots__/runtime.snap', legacyContent);
    writeFixture(root, 'ui/desktop/scripts/check-product-boundary.js', legacyContent);

    expect(findProductBoundaryViolations(root)).toEqual([]);
  });

  it('recognizes desktop root configuration files with Windows separators', () => {
    expect(isDesktopConfigurationFile('ui\\desktop\\package.json')).toBe(true);
    expect(isDesktopConfigurationFile('ui\\desktop\\vite.main.config.mts')).toBe(true);
    expect(isDesktopConfigurationFile('ui\\desktop\\.env.production')).toBe(true);
    expect(isDesktopConfigurationFile('ui\\desktop\\src\\runtime.ts')).toBe(false);
  });
});

describe('check-product-boundary CLI', () => {
  it('reports a forbidden identity in the root Justfile', () => {
    const root = createFixture();
    const checker = copyChecker(root);
    writeFixture(root, 'Justfile', "assistantName = 'HeyBuddy'");

    const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Justfile: HeyBuddy visible identity\n');
  });

  it('reports a forbidden marker in a root PowerShell build script', () => {
    const root = createFixture();
    const checker = copyChecker(root);
    writeFixture(
      root,
      'build-windows.ps1',
      '$env:HEYBUDDY_AUTH_API_BASE_URL = "https://legacy.example";'
    );

    const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('build-windows.ps1: HEYBUDDY_AUTH_API_BASE_URL\n');
  });

  it('prints path and pattern to stderr then exits one for a violation', () => {
    const root = createFixture();
    const checker = copyChecker(root);
    writeFixture(root, 'ui/desktop/src/runtime.ts', 'const host = "https://ai.linyeyun.cn";');

    const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('ui/desktop/src/runtime.ts: ai.linyeyun.cn\n');
  });

  it('exits zero without output for a clean product tree', () => {
    const root = createFixture();
    const checker = copyChecker(root);

    const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('is exposed through the desktop package script', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
    );

    expect(packageJson.scripts['check:product-boundary']).toBe(
      'node scripts/check-product-boundary.js'
    );
  });
});
