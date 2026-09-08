import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { parseDocument } from 'yaml';

import { transformSnapshot } from '../src/transform.mjs';

function entry(path, content, mode = '100644') {
  return {
    path,
    mode,
    content: Buffer.isBuffer(content) ? content : Buffer.from(content),
  };
}

function outputFor(result, path) {
  const output = result.entries.find((candidate) => candidate.path === path);
  assert.ok(output, `missing transformed entry ${path}`);
  return output;
}

function reportFor(result, path) {
  const report = result.report.entries.find((candidate) => candidate.inputPath === path);
  assert.ok(report, `missing report entry ${path}`);
  return report;
}

function text(result, path) {
  return outputFor(result, path).content.toString('utf8');
}

test('transforms Rust, TypeScript, TOML, JSON, and YAML through parser-backed adapters', async () => {
  const result = await transformSnapshot([
    entry(
      'crates/goose/src/lib.rs',
      [
        'use goose::Goose;',
        'macro_rules! GeeseFactory { ($value:expr) => { Goose::new($value) }; }',
        'pub fn example() {',
        '  let goose = Goose::new("Goose");',
        '  let GOOSE_NAME = "Goose";',
        '  let plural = "Geese";',
        '  let upstream = "https://github.com/aaif-goose/goose";',
        '}',
        '',
      ].join('\n'),
    ),
    entry(
      'ui/sdk/src/client.ts',
      [
        'import { GooseApp, GeeseIcon } from "@aaif/goose-sdk";',
        'export const goose = new GooseApp();',
        'export const plural = "Geese";',
        'export const upstream = "https://github.com/aaif-goose/goose";',
        'export const external = "goose-ai-agent";',
        'export const repositorySlug = "aaif-goose/goose";',
        'export const historicalRepository = "block/goose";',
        '',
      ].join('\n'),
    ),
    entry(
      'crates/goose/Cargo.toml',
      [
        '[package]',
        'name = "goose"',
        'description = "Goose core"',
        '[dependencies]',
        'goose-sdk = { path = "../goose-sdk" }',
        'repository = "https://github.com/aaif-goose/goose"',
        '',
      ].join('\n'),
    ),
    entry(
      'ui/sdk/package.json',
      `${JSON.stringify(
        {
          name: '@aaif/goose-sdk',
          description: 'Goose SDK',
          binary: 'goose',
          plural: 'Geese',
          repository: 'https://github.com/aaif-goose/goose',
        },
        null,
        2,
      )}\n`,
    ),
    entry(
      'ui/desktop/branding/brands.yaml',
      [
        'name: Goose',
        'plural: Geese',
        'package: "@aaif/goose-sdk"',
        'repository: https://github.com/aaif-goose/goose',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.equal(result.report.generationAllowed, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(text(result, 'crates/heybuddy/src/lib.rs').includes('use heybuddy::HeyBuddy;'), true);
  assert.equal(text(result, 'crates/heybuddy/src/lib.rs').includes('macro_rules! HeyBuddiesFactory'), true);
  assert.equal(text(result, 'crates/heybuddy/src/lib.rs').includes('HEYBUDDY_NAME'), true);
  assert.equal(text(result, 'crates/heybuddy/src/lib.rs').includes('"HeyBuddy"'), true);
  assert.equal(text(result, 'crates/heybuddy/src/lib.rs').includes('"HeyBuddies"'), true);
  assert.equal(text(result, 'crates/heybuddy/src/lib.rs').includes('https://github.com/aaif-goose/goose'), true);

  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('@heybuddy/heybuddy-sdk'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('new HeyBuddyApp()'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('const plural = "HeyBuddies"'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('goose-ai-agent'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('aaif-goose/goose'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('block/goose'), true);

  assert.equal(text(result, 'crates/heybuddy/Cargo.toml').includes('name = "heybuddy"'), true);
  assert.equal(text(result, 'crates/heybuddy/Cargo.toml').includes('heybuddy-sdk = { path = "../heybuddy-sdk" }'), true);
  assert.equal(text(result, 'crates/heybuddy/Cargo.toml').includes('https://github.com/aaif-goose/goose'), true);
  assert.equal(text(result, 'ui/sdk/package.json').includes('@heybuddy/heybuddy-sdk'), true);
  assert.equal(text(result, 'ui/desktop/branding/brands.yaml').includes('name: HeyBuddy'), true);
  assert.equal(text(result, 'ui/desktop/branding/brands.yaml').includes('plural: HeyBuddies'), true);
  assert.equal(text(result, 'ui/desktop/branding/brands.yaml').includes('https://github.com/aaif-goose/goose'), true);

  for (const reportEntry of result.report.entries) {
    assert.equal(reportEntry.disposition, 'transformed');
    assert.ok(reportEntry.adapter);
  }
});

test('preserves plural path and identifier distinctions without dropping coexistence', async () => {
  const result = await transformSnapshot([
    entry('ui/desktop/src/components/icons/Goose.tsx', 'export const Goose = "Goose";\n'),
    entry('ui/desktop/src/components/icons/Geese.tsx', 'export const Geese = "Geese";\n'),
    entry('ui/desktop/brand-legacy/goose/ui-components/Goose.tsx', 'export const Goose = "Goose";\n'),
    entry('ui/desktop/brand-legacy/goose/ui-components/Geese.tsx', 'export const Geese = "Geese";\n'),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(text(result, 'ui/desktop/src/components/icons/HeyBuddy.tsx'), 'export const HeyBuddy = "HeyBuddy";\n');
  assert.equal(text(result, 'ui/desktop/src/components/icons/HeyBuddies.tsx'), 'export const HeyBuddies = "HeyBuddies";\n');
  assert.equal(text(result, 'ui/desktop/brand-legacy/heybuddy/ui-components/HeyBuddy.tsx'), 'export const HeyBuddy = "HeyBuddy";\n');
  assert.equal(text(result, 'ui/desktop/brand-legacy/heybuddy/ui-components/HeyBuddies.tsx'), 'export const HeyBuddies = "HeyBuddies";\n');
  assert.equal(new Set(result.entries.map((candidate) => candidate.path)).size, 4);
});

test('reports explicit runtime identity preservation and legacy references', async () => {
  const result = await transformSnapshot([
    entry(
      'crates/goose/src/config/base.rs',
      [
        'fn config() {',
        '  let app_name = "goose";',
        '  let keyring_service = "goose";',
        '  let storage_service = "goose";',
        '  let config_dir = ".goose";',
        '  let api_key_env = "GOOSE_API_KEY";',
        '  let api_key_env_new = "HEYBUDDY_API_KEY";',
        '}',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(text(result, 'crates/heybuddy/src/config/base.rs').includes('app_name = "goose"'), true);
  assert.equal(text(result, 'crates/heybuddy/src/config/base.rs').includes('keyring_service = "goose"'), true);
  assert.equal(text(result, 'crates/heybuddy/src/config/base.rs').includes('storage_service = "goose"'), true);
  assert.equal(text(result, 'crates/heybuddy/src/config/base.rs').includes('config_dir = ".goose"'), true);
  assert.equal(text(result, 'crates/heybuddy/src/config/base.rs').includes('"GOOSE_API_KEY"'), true);
  assert.equal(text(result, 'crates/heybuddy/src/config/base.rs').includes('"HEYBUDDY_API_KEY"'), true);
  assert.ok(result.report.legacyReferences.some((reference) => reference.value === 'goose'));
  assert.ok(result.report.legacyReferences.some((reference) => reference.value === 'GOOSE_API_KEY'));
  assert.ok(result.report.preservedReferences.length >= 5);
});

test('preserves policy-controlled tooling and historical plan data exactly', async () => {
  const entries = [
    entry('tools/rebrand/fixture-goose.json', '{"name":"Goose"}\n'),
    entry('docs/superpowers/plans/2026-09-07-transformed-upstream-integration.md', '# Goose plan\n'),
    entry('docs/superpowers/specs/2026-09-07-heybuddy-branding-design.md', '# Goose spec\n'),
    entry('assets/goose.bin', Buffer.from([0, 1, 2, 3])),
  ];
  const result = await transformSnapshot(entries);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(text(result, 'tools/rebrand/fixture-goose.json'), '{"name":"Goose"}\n');
  assert.equal(text(result, 'docs/superpowers/plans/2026-09-07-transformed-upstream-integration.md'), '# Goose plan\n');
  assert.deepEqual(outputFor(result, 'assets/heybuddy.bin').content, Buffer.from([0, 1, 2, 3]));
  assert.equal(reportFor(result, 'assets/goose.bin').outputPath, 'assets/heybuddy.bin');
  assert.equal(reportFor(result, 'assets/goose.bin').disposition, 'transformed-binary');
});

test('fails closed for unsupported text and parser errors without lexical substitution', async () => {
  const unsupported = entry('notes/source.unknown', 'Goose documentation\n');
  const invalidTypeScript = entry('ui/desktop/src/bad.ts', 'import { Goose from "@aaif/goose-sdk";\n');
  const invalidRust = entry('crates/goose/src/bad.rs', 'fn main( { let goose = "Goose"; }\n');
  const invalidJson = entry('ui/desktop/package.json', '{"name":"@aaif/goose-desktop"\n');
  const result = await transformSnapshot([unsupported, invalidTypeScript, invalidRust, invalidJson]);

  assert.equal(result.report.complete, false);
  assert.equal(result.report.generationAllowed, false);
  assert.ok(result.report.unresolved.length >= 4);
  assert.equal(text(result, 'notes/source.unknown'), 'Goose documentation\n');
  assert.equal(text(result, 'ui/desktop/src/bad.ts'), invalidTypeScript.content.toString('utf8'));
  assert.equal(text(result, 'crates/goose/src/bad.rs'), invalidRust.content.toString('utf8'));
  assert.equal(text(result, 'ui/desktop/package.json'), invalidJson.content.toString('utf8'));
  assert.match(reportFor(result, 'notes/source.unknown').reason, /unsupported/i);
  assert.match(reportFor(result, 'ui/desktop/src/bad.ts').reason, /parse/i);
  assert.match(reportFor(result, 'crates/goose/src/bad.rs').reason, /parse/i);
  assert.match(reportFor(result, 'ui/desktop/package.json').reason, /parse/i);
});

test('reports transformed target collisions and refuses generation', async () => {
  const result = await transformSnapshot([
    entry('src/Goose.ts', 'export const Goose = "Goose";\n'),
    entry('src/HeyBuddy.ts', 'export const HeyBuddy = "HeyBuddy";\n'),
  ]);

  assert.equal(result.report.complete, false);
  assert.equal(result.report.generationAllowed, false);
  assert.ok(result.report.unresolved.some((item) => item.kind === 'path-collision'));
  assert.ok(result.report.collisions.some((collision) => collision.outputPath === 'src/HeyBuddy.ts'));
  assert.match(reportFor(result, 'src/Goose.ts').reason, /collision/i);
});

test('computes a transform identity from the policy, lockfile, and adapter sources', async () => {
  const result = await transformSnapshot([entry('README.txt', 'unchanged\n')]);

  assert.match(result.report.transformIdentity, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.report.transformIdentityInputs, [
    'package-lock.json',
    'production-policy.json',
    'text-policy.json',
    'src/adapters/json.mjs',
    'src/adapters/rust.mjs',
    'src/adapters/shared.mjs',
    'src/adapters/structured.mjs',
    'src/adapters/text.mjs',
    'src/adapters/toml.mjs',
    'src/adapters/typescript.mjs',
    'src/adapters/yaml.mjs',
  ]);
});

test('changes new protocol values but preserves legacy acceptance only in its explicit module context', async () => {
  const result = await transformSnapshot([
    entry('crates/goose/src/session/nostr_share.rs', 'fn legacy() { let link = "goose://sessions/nostr"; }\n'),
    entry('ui/install-link-generator/script.js', 'const link = "goose://extension";\n'),
  ]);

  assert.equal(result.report.complete, true);
  assert.equal(text(result, 'crates/heybuddy/src/session/nostr_share.rs').includes('goose://sessions/nostr'), true);
  assert.equal(text(result, 'ui/install-link-generator/script.js').includes('heybuddy://extension'), true);
  assert.equal(
    result.report.legacyReferences.some(
      (reference) => reference.path === 'crates/goose/src/session/nostr_share.rs',
    ),
    true,
  );
});

test('dispatches module extensions, Cargo.lock, and disabled YAML through structured adapters', async () => {
  const result = await transformSnapshot([
    entry('src/module.mts', 'export const Goose = "Goose";\n'),
    entry('src/loader.cts', 'export const Geese = "Geese";\n'),
    entry('Cargo.lock', '[[package]]\nname = "goose"\n'),
    entry('config.yaml.disabled', 'name: Goose\n'),
    entry('config.yml.disabled', 'name: Geese\n'),
  ]);

  assert.equal(result.report.complete, true);
  assert.equal(text(result, 'src/module.mts'), 'export const HeyBuddy = "HeyBuddy";\n');
  assert.equal(text(result, 'src/loader.cts'), 'export const HeyBuddies = "HeyBuddies";\n');
  assert.equal(text(result, 'Cargo.lock'), '[[package]]\nname = "heybuddy"\n');
  assert.equal(text(result, 'config.yaml.disabled'), 'name: HeyBuddy\n');
  assert.equal(text(result, 'config.yml.disabled'), 'name: HeyBuddies\n');
  assert.equal(reportFor(result, 'src/module.mts').adapter, 'typescript');
  assert.equal(reportFor(result, 'Cargo.lock').adapter, 'toml');
  assert.equal(reportFor(result, 'config.yaml.disabled').adapter, 'yaml');
});

test('preserves published v8 registry identities while renaming local Cargo packages', async () => {
  const result = await transformSnapshot([
    entry(
      'vendor/v8/Cargo.toml',
      [
        '[package]',
        'name = "v8"',
        'version = "145.0.0"',
        '[features]',
        'use_custom_libcxx = ["v8-goose/use_custom_libcxx"]',
        '[dependencies]',
        'v8-goose = { version = "145.0.2" }',
        '',
      ].join('\n'),
    ),
    entry('vendor/v8/src/lib.rs', 'pub use v8_goose::*;\n'),
    entry(
      'Cargo.lock',
      [
        '[[package]]',
        'name = "localgoose"',
        'version = "0.1.0"',
        'dependencies = ["v8-goose"]',
        '',
        '[[package]]',
        'name = "v8-goose"',
        'version = "145.0.2"',
        'source = "registry+https://github.com/rust-lang/crates.io-index"',
        'dependencies = ["localgoose"]',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(
    text(result, 'vendor/v8/Cargo.toml'),
    [
      '[package]',
      'name = "v8"',
      'version = "145.0.0"',
      '[features]',
      'use_custom_libcxx = ["v8-goose/use_custom_libcxx"]',
      '[dependencies]',
      'v8-goose = { version = "145.0.2" }',
      '',
    ].join('\n'),
  );
  assert.equal(text(result, 'vendor/v8/src/lib.rs'), 'pub use v8_goose::*;\n');
  assert.equal(
    text(result, 'Cargo.lock'),
    [
      '[[package]]',
      'name = "localheybuddy"',
      'version = "0.1.0"',
      'dependencies = ["v8-goose"]',
      '',
      '[[package]]',
      'name = "v8-goose"',
      'version = "145.0.2"',
      'source = "registry+https://github.com/rust-lang/crates.io-index"',
      'dependencies = ["localheybuddy"]',
      '',
    ].join('\n'),
  );
  assert.ok(
    result.report.preservedReferences.some(
      (reference) => reference.path === 'vendor/v8/Cargo.toml' && reference.value === 'v8-goose',
    ),
  );
  assert.ok(
    result.report.preservedReferences.some(
      (reference) => reference.path === 'Cargo.lock' && reference.value === 'v8-goose',
    ),
  );
  assert.ok(
    result.report.preservedReferences.some(
      (reference) => reference.path === 'vendor/v8/src/lib.rs' && reference.value === 'v8_goose',
    ),
  );
});

test('transforms YAML sequence scalars and block scalar payloads without damaging YAML framing', async () => {
  const source = [
    'items:',
    '  - Goose',
    '  - Geese',
    '  - name: Goose',
    '    url: https://github.com/aaif-goose/goose',
    'prompt: |',
    '  Run Goose via https://goose-docs.ai/',
    'literal: >-',
    '  Geese docs',
    '',
  ].join('\n');
  const result = await transformSnapshot([entry('config.yaml', source)]);
  const output = text(result, 'config.yaml');
  assert.equal(result.report.complete, true);
  assert.equal(
    output,
    [
      'items:',
      '  - HeyBuddy',
      '  - HeyBuddies',
      '  - name: HeyBuddy',
      '    url: https://github.com/aaif-goose/goose',
      'prompt: |',
      '  Run HeyBuddy via https://goose-docs.ai/',
      'literal: >-',
      '  HeyBuddies docs',
      '',
    ].join('\n'),
  );
  assert.deepEqual(parseDocument(output).errors, []);
});

test('transforms YAML comments without touching embedded external URLs', async () => {
  const source = [
    '# generated GOOSE_SERVER__SECRET_KEY',
    'name: Goose # See https://goose-docs.ai/ for Goose docs',
    '',
  ].join('\n');
  const result = await transformSnapshot([entry('config.yaml', source)]);
  assert.equal(result.report.complete, true);
  assert.equal(
    text(result, 'config.yaml'),
    [
      '# generated HEYBUDDY_SERVER__SECRET_KEY',
      'name: HeyBuddy # See https://goose-docs.ai/ for HeyBuddy docs',
      '',
    ].join('\n'),
  );
  assert.ok(result.report.preservedReferences.some((reference) => reference.value === 'https://goose-docs.ai/'));
});

test('preserves an external URL inside a template literal while renaming adjacent product text', async () => {
  const result = await transformSnapshot([
    entry('scripts/links.ts', 'const markdown = `See https://goose-docs.ai/ for Goose docs`;\n'),
  ]);

  assert.equal(result.report.complete, true);
  assert.equal(
    text(result, 'scripts/links.ts'),
    'const markdown = `See https://goose-docs.ai/ for HeyBuddy docs`;\n',
  );
  assert.equal(result.report.preservedReferences.length, 1);
});

test('keeps escaped newlines valid in transformed single-quoted JavaScript strings', async () => {
  const source = [
    "const PACKAGE_FIXTURE = '{\\n  \\\"name\\\": \\\"goose-app\\\",\\n  \\\"version\\\": \\\"1.45.0\\\"\\n}\\n';",
    'const label = "Goose";',
    'const template = `Goose`;',
    '',
  ].join('\n');
  const result = await transformSnapshot([entry('ui/desktop/scripts/bump-build-version.test.js', source)]);
  const output = text(result, 'ui/desktop/scripts/bump-build-version.test.js');
  const reparsed = ts.createSourceFile(
    'ui/desktop/scripts/bump-build-version.test.js',
    output,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  assert.equal(result.report.complete, true);
  assert.deepEqual(reparsed.parseDiagnostics, []);
  assert.equal(
    output,
    [
      "const PACKAGE_FIXTURE = '{\\n  \"name\": \"heybuddy-app\",\\n  \"version\": \"1.45.0\"\\n}\\n';",
      'const label = "HeyBuddy";',
      'const template = `HeyBuddy`;',
      '',
    ].join('\n'),
  );
});

test('preserves only targeted unsupported-edition fixtures while renaming product values', async () => {
  const result = await transformSnapshot([
    entry(
      'ui/desktop/scripts/brand.test.js',
      [
        "const brand = { protocol: 'goose' };",
        "expect(() => resolveBrand('goose')).toThrow(/goose.*heybuddy/);",
        '',
      ].join('\n'),
    ),
    entry(
      'ui/desktop/scripts/windows-package.test.js',
      "it.each(['', 'goose', 'HEYBUDDY'])('rejects %j', (edition) => edition);\n",
    ),
    entry(
      'ui/desktop/src/brand.test.ts',
      [
        "expect(getAppProtocol()).toBe('goose');",
        "vi.stubEnv('APP_EDITION', 'goose');",
        "it.each([undefined, '', 'goose', 'HEYBUDDY'])('rejects %o', (edition) => edition);",
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(
    text(result, 'ui/desktop/scripts/brand.test.js'),
    [
      "const brand = { protocol: 'heybuddy' };",
      "expect(() => resolveBrand('goose')).toThrow(/goose.*heybuddy/);",
      '',
    ].join('\n'),
  );
  assert.equal(
    text(result, 'ui/desktop/scripts/windows-package.test.js'),
    "it.each(['', 'goose', 'HEYBUDDY'])('rejects %j', (edition) => edition);\n",
  );
  assert.equal(
    text(result, 'ui/desktop/src/brand.test.ts'),
    [
      "expect(getAppProtocol()).toBe('heybuddy');",
      "vi.stubEnv('APP_EDITION', 'goose');",
      "it.each([undefined, '', 'goose', 'HEYBUDDY'])('rejects %o', (edition) => edition);",
      '',
    ].join('\n'),
  );
  assert.ok(
    result.report.preservedReferences.some(
      (reference) =>
        reference.path === 'ui/desktop/scripts/brand.test.js' &&
        reference.value === 'goose' &&
        /unsupported.?edition/i.test(reference.reason),
    ),
  );
});

test('keeps the exact sorted order expected by the environment-key assertion', async () => {
  const result = await transformSnapshot([
    entry(
      'ui/desktop/src/gooseServeEnv.test.ts',
      [
        "expect(buildHeyBuddyEnv({})).toEqual({ GOOSE_PROVIDER: 'goose' });",
        'expect(Object.keys(env).sort()).toEqual([',
        "  'GOOSE_PROVIDER',",
        "  'HEYBUDDY_API_KEY',",
        "  'HEYBUDDY_BASE_URL',",
        ']);',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(
    text(result, 'ui/desktop/src/heybuddyServeEnv.test.ts'),
    [
      "expect(buildHeyBuddyEnv({})).toEqual({ HEYBUDDY_PROVIDER: 'heybuddy' });",
      'expect(Object.keys(env).sort()).toEqual([',
      "  'HEYBUDDY_API_KEY',",
      "  'HEYBUDDY_BASE_URL',",
      "  'HEYBUDDY_PROVIDER',",
      ']);',
      '',
    ].join('\n'),
  );
});

test('preserves external ws and wss URLs while renaming adjacent product text', async () => {
  const result = await transformSnapshot([
    entry(
      'ui/desktop/src/acp/__tests__/url.test.ts',
      [
        "const wsUrl = 'ws://localhost/goose/acp';",
        "const wssUrl = 'wss://example.com/goose/acp';",
        "const httpUrl = 'https://example.com/goose/acp';",
        'const label = "Goose";',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(
    text(result, 'ui/desktop/src/acp/__tests__/url.test.ts'),
    [
      "const wsUrl = 'ws://localhost/goose/acp';",
      "const wssUrl = 'wss://example.com/goose/acp';",
      "const httpUrl = 'https://example.com/goose/acp';",
      'const label = "HeyBuddy";',
      '',
    ].join('\n'),
  );
  assert.equal(
    result.report.preservedReferences.filter((reference) => reference.value.includes('://')).length,
    3,
  );
});

test('preserves the CLI logging compatibility fixture without changing runtime path policy', async () => {
  const result = await transformSnapshot([
    entry(
      'crates/goose-cli/src/logging.rs',
      [
        'fn check() {',
        '  let log_dir = prepare_log_directory("cli", true).unwrap();',
        '  assert!(path_components.iter().any(|c| c.as_os_str() == "goose"));',
        '  let label = "Goose";',
        '}',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(
        text(result, 'crates/heybuddy-cli/src/logging.rs'),
    [
      'fn check() {',
      '  let log_dir = prepare_log_directory("cli", true).unwrap();',
      '  assert!(path_components.iter().any(|c| c.as_os_str() == "goose"));',
      '  let label = "HeyBuddy";',
      '}',
      '',
    ].join('\n'),
  );
  assert.ok(
    result.report.preservedReferences.some(
      (reference) =>
        reference.path === 'crates/goose-cli/src/logging.rs' && reference.value === 'goose',
    ),
  );
});

test('renames comments in empty JSX expressions through TypeScript comment ranges', async () => {
  const result = await transformSnapshot([
    entry(
      'ui/desktop/src/RecipeActivities.tsx',
      [
        "import GooseLogo from './GooseLogo';",
        'export function RecipeActivities() {',
        '  return <div>{/* Animated goose icon */}<GooseLogo /></div>;',
        '}',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.equal(result.report.generationAllowed, true);
  assert.equal(
    text(result, 'ui/desktop/src/RecipeActivities.tsx'),
    [
      "import HeyBuddyLogo from './HeyBuddyLogo';",
      'export function RecipeActivities() {',
      '  return <div>{/* Animated heybuddy icon */}<HeyBuddyLogo /></div>;',
      '}',
      '',
    ].join('\n'),
  );
  assert.ok(
    reportFor(result, 'ui/desktop/src/RecipeActivities.tsx').mappings.some(
      (mapping) =>
        mapping.kind === 'typescript-comment' &&
        mapping.original === '/* Animated goose icon */' &&
        mapping.replacement === '/* Animated heybuddy icon */',
    ),
  );
});

test('reports reproducible UTF-16 mappings and parser-token symbol occurrences', async () => {
  const source = 'const emoji = "😀"; const Goose = "Goose";\n';
  const result = await transformSnapshot([entry('src/example.ts', source)]);
  const file = reportFor(result, 'src/example.ts');
  const contentMappings = file.mappings.filter((mapping) => mapping.scope === 'content');
  assert.ok(contentMappings.length >= 2);
  for (const mapping of contentMappings) {
    assert.equal(mapping.offsetEncoding, 'utf-16');
    assert.equal(source.slice(mapping.start, mapping.end), mapping.original);
    assert.equal(typeof mapping.kind, 'string');
    assert.equal(typeof mapping.replacement, 'string');
  }
  assert.ok(
    file.symbols.some(
      (symbol) =>
        symbol.kind === 'symbol-occurrence' &&
        symbol.resolution === 'parser-token' &&
        symbol.original === 'Goose' &&
        symbol.replacement === 'HeyBuddy',
    ),
  );
  assert.deepEqual(result.report.mappingSchema, {
    version: 1,
    offsetEncoding: 'utf-16',
    fields: ['kind', 'original', 'replacement', 'start', 'end', 'offsetEncoding'],
  });
  assert.equal(result.report.provenance.transformIdentity, result.report.transformIdentity);
});

test('transforms parser-backed regex literals and fails closed on parser errors', async () => {
  const source = 'const matcher = /Goose/; // Goose remains parser-visible\n';
  const result = await transformSnapshot([entry('src/regex.ts', source)]);
  assert.equal(result.report.complete, true);
  assert.equal(result.report.generationAllowed, true);
  assert.equal(text(result, 'src/regex.ts'), 'const matcher = /HeyBuddy/; // HeyBuddy remains parser-visible\n');

  const invalid = 'const matcher = /Goose\n';
  const invalidResult = await transformSnapshot([entry('src/invalid-regex.ts', invalid)]);
  assert.equal(invalidResult.report.complete, false);
  assert.equal(invalidResult.report.generationAllowed, false);
  assert.equal(text(invalidResult, 'src/invalid-regex.ts'), invalid);
  assert.match(reportFor(invalidResult, 'src/invalid-regex.ts').reason, /parse/i);
});

test('retains executable modes and snapshot bytes', async () => {
  const result = await transformSnapshot([
    entry('scripts/goose.sh', '#!/bin/sh\necho Goose\n', '100755'),
    entry('assets/goose.dat', Buffer.from([0, 255, 1]), '100644'),
  ]);

  assert.equal(outputFor(result, 'scripts/goose.sh').mode, '100755');
  assert.deepEqual(outputFor(result, 'assets/heybuddy.dat').content, Buffer.from([0, 255, 1]));
  assert.ok(result.report.unresolved.length >= 1);
  assert.equal(reportFor(result, 'assets/goose.dat').outputPath, 'assets/heybuddy.dat');
  assert.ok(
    reportFor(result, 'assets/goose.dat').mappings.some(
      (mapping) => mapping.kind === 'path-component' && mapping.original === 'goose.dat',
    ),
  );
  assert.equal(reportFor(result, 'scripts/goose.sh').disposition, 'unresolved');
});

test('rejects invalid transform options', async () => {
  await assert.rejects(
    () => transformSnapshot([], { input: 'generated' }),
    /input.*upstream.*product/i,
  );
});

test('the checked-in production policy participates in the transform identity', () => {
  const policy = JSON.parse(readFileSync(new URL('../production-policy.json', import.meta.url), 'utf8'));
  assert.equal(policy.version, 1);
});
