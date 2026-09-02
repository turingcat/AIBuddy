const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findProductBoundaryViolations } = require('./check-product-boundary');

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

afterEach(() => {
  fixtureRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe('findProductBoundaryViolations', () => {
  it('reports legacy product markers in active product sources', () => {
    const root = createFixture();
    writeFixture(root, 'ui/desktop/src/runtime.ts', 'const host = "https://ai.linyeyun.cn";');
    writeFixture(root, 'ui/desktop/scripts/auth.js', 'process.env.HEYBUDDY_AUTH_API_BASE_URL;');
    writeFixture(root, 'ui/desktop/forge.config.ts', 'if (process.env.APP_EDITION === "heybuddy") {}');
    writeFixture(root, 'crates/goose-providers/src/declarative/definitions/heybuddy.json', '{"name":"heybuddy"}');

    expect(findProductBoundaryViolations(root)).toEqual([
      { file: 'crates/goose-providers/src/declarative/definitions/heybuddy.json', pattern: 'bundled heybuddy provider definition' },
      { file: 'ui/desktop/forge.config.ts', pattern: 'APP_EDITION conditional' },
      { file: 'ui/desktop/scripts/auth.js', pattern: 'HEYBUDDY_AUTH_API_BASE_URL' },
      { file: 'ui/desktop/src/runtime.ts', pattern: 'ai.linyeyun.cn' },
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
    writeFixture(root, 'ui/desktop/out/main.js', legacyContent);
    writeFixture(root, 'ui/desktop/node_modules/example/index.js', legacyContent);
    writeFixture(root, 'ui/desktop/src/__snapshots__/runtime.snap', legacyContent);
    writeFixture(root, 'ui/desktop/src/test/setup.ts', legacyContent);
    writeFixture(root, 'ui/desktop/scripts/check-product-boundary.js', legacyContent);

    expect(findProductBoundaryViolations(root)).toEqual([]);
  });
});
