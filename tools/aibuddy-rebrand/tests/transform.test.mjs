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



test('transforms mixed Goose and HeyBuddy source names to one AIBuddy identity', async () => {
  const result = await transformSnapshot([
    entry('src/GooseAndHeyBuddy.ts', [
      'export const GooseName = "Goose";',
      'export const HeyBuddyName = "HeyBuddy";',
      'export const geese = "Geese";',
      'export const heybuddies = "HeyBuddies";',
      '',
    ].join('\n')),
  ]);

  assert.equal(result.report.complete, true);
  assert.equal(text(result, 'src/AIBuddyAndAIBuddy.ts'), [
    'export const AIBuddyName = "AIBuddy";',
    'export const AIBuddyName = "AIBuddy";',
    'export const aibuddies = "AIBuddies";',
    'export const aibuddies = "AIBuddies";',
    '',
  ].join('\n'));
});

test('restores external provider model aliases while converting product identifiers', async () => {
  const result = await transformSnapshot([
    entry(
      'crates/heybuddy-provider-types/src/canonical/name_builder.rs',
      [
        'const PRODUCT: &str = "HeyBuddy";',
        'const MODELS: &[&str] = &[',
        '  "heybuddy-claude-sonnet-4-5-bedrock",',
        '  "kheybuddy-gpt-4o",',
        '  "heybuddy-o1",',
        '  "kheybuddy-o3",',
        '  "headless-heybuddy-o3-mini",',
        '  "kheybuddy-grok-4.3",',
        '  "heybuddy-command-r-08-2024",',
        '  "heybuddy-claude-sonnet",',
        '  "heybuddy-o3-mini",',
        '  "heybuddy-o4-mini",',
        '  "heybuddy-gpt-5.4-high",',
        '  "heybuddy-gpt-5-high",',
        '  "heybuddy-gpt-5",',
        '  "heybuddy-claude-sonnet-4",',
        '];',
        '',
      ].join('\n'),
    ),
  ], { input: 'upstream' });

  assert.equal(result.report.complete, true);
  assert.equal(
    text(result, 'crates/aibuddy-provider-types/src/canonical/name_builder.rs'),
    [
      'const PRODUCT: &str = "AIBuddy";',
      'const MODELS: &[&str] = &[',
      '  "goose-claude-sonnet-4-5-bedrock",',
      '  "kgoose-gpt-4o",',
      '  "goose-o1",',
      '  "kgoose-o3",',
      '  "headless-goose-o3-mini",',
      '  "kgoose-grok-4.3",',
      '  "goose-command-r-08-2024",',
      '  "goose-claude-sonnet",',
      '  "goose-o3-mini",',
      '  "goose-o4-mini",',
      '  "goose-gpt-5.4-high",',
      '  "goose-gpt-5-high",',
      '  "goose-gpt-5",',
      '  "goose-claude-sonnet-4",',
      '];',
      '',
    ].join('\n'),
  );
});

test('omits upstream rebrand implementation and provenance from transformed snapshots', async () => {
  const result = await transformSnapshot([
    entry('.heybuddy-rebrand.json', '{"source":"HeyBuddy"}\n'),
    entry('tools/rebrand/README.md', '# HeyBuddy rebrand\n'),
    entry('tools/rebrand/src/transform.mjs', 'export const name = "HeyBuddy";\n'),
    entry('branding/README.md', '# HeyBuddy branding\n'),
    entry('branding/heybuddy-icon.svg', '<svg><!-- HeyBuddy icon --></svg>\n'),
    entry('README.md', '# HeyBuddy\n'),
  ], { input: 'upstream' });

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.entries.map((candidate) => candidate.path), ['README.md']);
  assert.equal(text(result, 'README.md'), '# AIBuddy\n');
  assert.equal(
    result.report.entries.filter((candidate) => candidate.disposition === 'omitted-upstream-tooling').length,
    5,
  );
});

test('converts product-owned MCP replay input while preserving recorded server output', async () => {
  const transcript = [
    'STDIN: {"clientInfo":{"name":"heybuddy-desktop"}}',
    'STDIN: {"result":{"roots":[{"uri":"file:///tmp/heybuddy_test"}]}}',
    'STDOUT: {"result":{"text":"HeyBuddy and goose are external response data"}}',
    '',
  ].join('\n');
  const results = '[{"text":"HeyBuddy and goose are external result data"}]\n';
  const errors = 'expected HeyBuddy server output\n';
  const result = await transformSnapshot([
    entry('crates/heybuddy/tests/mcp_replays/example', transcript),
    entry('crates/heybuddy/tests/mcp_replays/example.results.json', results),
    entry('crates/heybuddy/tests/mcp_replays/example.errors.txt', errors),
  ], { input: 'upstream' });

  assert.equal(result.report.complete, true);
  assert.equal(
    text(result, 'crates/aibuddy/tests/mcp_replays/example'),
    [
      'STDIN: {"clientInfo":{"name":"aibuddy-desktop"}}',
      'STDIN: {"result":{"roots":[{"uri":"file:///tmp/aibuddy_test"}]}}',
      'STDOUT: {"result":{"text":"HeyBuddy and goose are external response data"}}',
      '',
    ].join('\n'),
  );
  assert.equal(text(result, 'crates/aibuddy/tests/mcp_replays/example.results.json'), results);
  assert.equal(text(result, 'crates/aibuddy/tests/mcp_replays/example.errors.txt'), errors);
});

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
  assert.equal(text(result, 'crates/aibuddy/src/lib.rs').includes('use aibuddy::AIBuddy;'), true);
  assert.equal(text(result, 'crates/aibuddy/src/lib.rs').includes('macro_rules! AIBuddiesFactory'), true);
  assert.equal(text(result, 'crates/aibuddy/src/lib.rs').includes('AIBUDDY_NAME'), true);
  assert.equal(text(result, 'crates/aibuddy/src/lib.rs').includes('"AIBuddy"'), true);
  assert.equal(text(result, 'crates/aibuddy/src/lib.rs').includes('"AIBuddies"'), true);
  assert.equal(text(result, 'crates/aibuddy/src/lib.rs').includes('https://github.com/aaif-goose/goose'), true);

  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('@aibuddy/aibuddy-sdk'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('new AIBuddyApp()'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('const plural = "AIBuddies"'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('goose-ai-agent'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('aaif-goose/goose'), true);
  assert.equal(text(result, 'ui/sdk/src/client.ts').includes('block/goose'), true);

  assert.equal(text(result, 'crates/aibuddy/Cargo.toml').includes('name = "aibuddy"'), true);
  assert.equal(text(result, 'crates/aibuddy/Cargo.toml').includes('aibuddy-sdk = { path = "../aibuddy-sdk" }'), true);
  assert.equal(text(result, 'crates/aibuddy/Cargo.toml').includes('https://github.com/aaif-goose/goose'), true);
  assert.equal(text(result, 'ui/sdk/package.json').includes('@aibuddy/aibuddy-sdk'), true);
  assert.equal(text(result, 'ui/desktop/branding/brands.yaml').includes('name: AIBuddy'), true);
  assert.equal(text(result, 'ui/desktop/branding/brands.yaml').includes('plural: AIBuddies'), true);
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
  assert.equal(text(result, 'ui/desktop/src/components/icons/AIBuddy.tsx'), 'export const AIBuddy = "AIBuddy";\n');
  assert.equal(text(result, 'ui/desktop/src/components/icons/AIBuddies.tsx'), 'export const AIBuddies = "AIBuddies";\n');
  assert.equal(text(result, 'ui/desktop/brand-legacy/aibuddy/ui-components/AIBuddy.tsx'), 'export const AIBuddy = "AIBuddy";\n');
  assert.equal(text(result, 'ui/desktop/brand-legacy/aibuddy/ui-components/AIBuddies.tsx'), 'export const AIBuddies = "AIBuddies";\n');
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
        '  let api_key_env_new = "AIBUDDY_API_KEY";',
        '}',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(text(result, 'crates/aibuddy/src/config/base.rs').includes('app_name = "goose"'), true);
  assert.equal(text(result, 'crates/aibuddy/src/config/base.rs').includes('keyring_service = "goose"'), true);
  assert.equal(text(result, 'crates/aibuddy/src/config/base.rs').includes('storage_service = "goose"'), true);
  assert.equal(text(result, 'crates/aibuddy/src/config/base.rs').includes('config_dir = ".goose"'), true);
  assert.equal(text(result, 'crates/aibuddy/src/config/base.rs').includes('"GOOSE_API_KEY"'), true);
  assert.equal(text(result, 'crates/aibuddy/src/config/base.rs').includes('"AIBUDDY_API_KEY"'), true);
  assert.ok(result.report.legacyReferences.some((reference) => reference.value === 'goose'));
  assert.ok(result.report.legacyReferences.some((reference) => reference.value === 'GOOSE_API_KEY'));
  assert.ok(result.report.preservedReferences.length >= 5);
});

test('preserves policy-controlled tooling and historical plan data exactly', async () => {
  const entries = [
    entry('tools/rebrand/fixture-goose.json', '{"name":"Goose"}\n'),
    entry('docs/superpowers/plans/2026-09-07-transformed-upstream-integration.md', '# Goose plan\n'),
    entry('docs/superpowers/specs/2026-09-07-aibuddy-branding-design.md', '# Goose spec\n'),
    entry('assets/goose.bin', Buffer.from([0, 1, 2, 3])),
  ];
  const result = await transformSnapshot(entries);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(text(result, 'tools/rebrand/fixture-goose.json'), '{"name":"Goose"}\n');
  assert.equal(text(result, 'docs/superpowers/plans/2026-09-07-transformed-upstream-integration.md'), '# Goose plan\n');
  assert.deepEqual(outputFor(result, 'assets/aibuddy.bin').content, Buffer.from([0, 1, 2, 3]));
  assert.equal(reportFor(result, 'assets/goose.bin').outputPath, 'assets/aibuddy.bin');
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
    entry('src/AIBuddy.ts', 'export const AIBuddy = "AIBuddy";\n'),
  ]);

  assert.equal(result.report.complete, false);
  assert.equal(result.report.generationAllowed, false);
  assert.ok(result.report.unresolved.some((item) => item.kind === 'path-collision'));
  assert.ok(result.report.collisions.some((collision) => collision.outputPath === 'src/AIBuddy.ts'));
  assert.match(reportFor(result, 'src/Goose.ts').reason, /collision/i);
});

test('computes a transform identity from the policy, lockfile, and adapter sources', async () => {
  const result = await transformSnapshot([entry('README.txt', 'unchanged\n')]);

  assert.match(result.report.transformIdentity, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.report.transformIdentityInputs, [
    'brand-map.json',
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
  assert.equal(text(result, 'crates/aibuddy/src/session/nostr_share.rs').includes('goose://sessions/nostr'), true);
  assert.equal(text(result, 'ui/install-link-generator/script.js').includes('aibuddy://extension'), true);
  assert.equal(
    result.report.legacyReferences.some(
      (reference) => reference.path === 'crates/goose/src/session/nostr_share.rs',
    ),
    true,
  );
});

test('preserves reviewed AIBuddy compatibility boundaries in product input', async () => {
  const result = await transformSnapshot([
    entry(
      'ui/desktop/src/nostrProtocol.ts',
      [
        "export const GOOSE_NOSTR_PROTOCOL_PREFIX = 'goose://sessions/nostr';",
        "export const scheme = 'goose:';",
        'export const product = "HeyBuddy";',
        '',
      ].join('\n'),
    ),
    entry(
      'ui/desktop/forge.config.ts',
      [
        "const productProtocol = { name: 'HeyBuddyProtocol', schemes: ['heybuddy'] };",
        "const compatibilityProtocol = { name: 'GooseNostrProtocol', schemes: ['goose'] };",
        '',
      ].join('\n'),
    ),
    entry(
      'ui/desktop/src/components/ChatBrand.test.tsx',
      [
        "expect(screen.getByText('HeyBuddy')).toBeInTheDocument();",
        "expect(screen.queryByText('HeyBuddy')).not.toBeInTheDocument();",
        '',
      ].join('\n'),
    ),
    entry(
      'ui/desktop/src/components/Hub.test.tsx',
      [
        'expect(screen.queryByText(/HeyBuddy|/)).not.toBeInTheDocument();',
        'const currentBrand = /HeyBuddy/;',
        '',
      ].join('\n'),
    ),
    entry(
      'ui/desktop/src/aibuddyServeLeaseRegistry.test.ts',
      [
        "expect(message).not.toContain('Goose');",
        'const product = "HeyBuddy";',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.equal(
    text(result, 'ui/desktop/src/nostrProtocol.ts'),
    [
      "export const GOOSE_NOSTR_PROTOCOL_PREFIX = 'goose://sessions/nostr';",
      "export const scheme = 'goose:';",
      'export const product = "AIBuddy";',
      '',
    ].join('\n'),
  );
  assert.equal(
    text(result, 'ui/desktop/forge.config.ts'),
    [
      "const productProtocol = { name: 'AIBuddyProtocol', schemes: ['aibuddy'] };",
      "const compatibilityProtocol = { name: 'GooseNostrProtocol', schemes: ['goose'] };",
      '',
    ].join('\n'),
  );
  assert.equal(
    text(result, 'ui/desktop/src/components/ChatBrand.test.tsx'),
    [
      "expect(screen.getByText('AIBuddy')).toBeInTheDocument();",
      "expect(screen.queryByText('HeyBuddy')).not.toBeInTheDocument();",
      '',
    ].join('\n'),
  );
  assert.equal(
    text(result, 'ui/desktop/src/components/Hub.test.tsx'),
    [
      'expect(screen.queryByText(/HeyBuddy|/)).not.toBeInTheDocument();',
      'const currentBrand = /AIBuddy/;',
      '',
    ].join('\n'),
  );
  assert.equal(
    text(result, 'ui/desktop/src/aibuddyServeLeaseRegistry.test.ts'),
    [
      "expect(message).not.toContain('Goose');",
      'const product = "AIBuddy";',
      '',
    ].join('\n'),
  );
});

test('preserves Goose ACP and Nostr compatibility while converting HeyBuddy Rust', async () => {
  const result = await transformSnapshot([
    entry(
      'crates/heybuddy/src/acp/server.rs',
      [
        'struct ClientCapabilitiesMeta {',
        '  heybuddy: Option<HeyBuddyClientCapabilities>,',
        '  goose: Option<HeyBuddyClientCapabilities>,',
        '}',
        'enum CustomMethodNamespace { HeyBuddy, Goose }',
        'fn test_legacy_goose_capabilities_negotiate_legacy_custom_methods() {',
        '  let goose_meta = "goose";',
        '}',
        'const CANONICAL_META: &str = "heybuddy";',
        'const LEGACY_META: &str = "goose";',
        'const LEGACY_METHOD: &str = "_goose/unstable/session/update";',
        '',
      ].join('\n'),
    ),
    entry(
      'crates/heybuddy/src/session/nostr_share.rs',
      [
        'const LINK: &str = "heybuddy://sessions/nostr";',
        'fn accepts(scheme: &str) -> bool { matches!(scheme, "heybuddy" | "goose") }',
        '',
      ].join('\n'),
    ),
    entry(
      'crates/heybuddy/tests/acp_fixtures/server.rs',
      [
        'const CANONICAL_META: &str = "heybuddy";',
        'const LEGACY_META: &str = "goose";',
        'fn check(method: &str) {',
        '  assert_ne!(method, "_heybuddy/unstable/session/update");',
        '  if method == "_goose/unstable/session/update" {}',
        '}',
        '',
      ].join('\n'),
    ),
  ], { input: 'upstream' });

  assert.equal(result.report.complete, true);
  assert.equal(
    text(result, 'crates/aibuddy/src/acp/server.rs'),
    [
      'struct ClientCapabilitiesMeta {',
      '  aibuddy: Option<AIBuddyClientCapabilities>,',
      '  goose: Option<AIBuddyClientCapabilities>,',
      '}',
      'enum CustomMethodNamespace { AIBuddy, Goose }',
      'fn test_legacy_goose_capabilities_negotiate_legacy_custom_methods() {',
      '  let goose_meta = "goose";',
      '}',
      'const CANONICAL_META: &str = "aibuddy";',
      'const LEGACY_META: &str = "goose";',
      'const LEGACY_METHOD: &str = "_goose/unstable/session/update";',
      '',
    ].join('\n'),
  );
  assert.equal(
    text(result, 'crates/aibuddy/src/session/nostr_share.rs'),
    [
      'const LINK: &str = "aibuddy://sessions/nostr";',
      'fn accepts(scheme: &str) -> bool { matches!(scheme, "aibuddy" | "goose") }',
      '',
    ].join('\n'),
  );
  assert.equal(
    text(result, 'crates/aibuddy/tests/acp_fixtures/server.rs'),
    [
      'const CANONICAL_META: &str = "aibuddy";',
      'const LEGACY_META: &str = "goose";',
      'fn check(method: &str) {',
      '  assert_ne!(method, "_aibuddy/unstable/session/update");',
      '  if method == "_goose/unstable/session/update" {}',
      '}',
      '',
    ].join('\n'),
  );
});

test('preserves legacy HeyBuddy rejection fixtures in AIBuddy Rust identity tests', async () => {
  const paths = [
    'crates/heybuddy/src/agents/agent.rs',
    'crates/heybuddy/src/agents/prompt_manager.rs',
    'crates/heybuddy/src/agents/state_machine/tests/provider_lifecycle.rs',
  ];
  const result = await transformSnapshot(
    paths.map((path) =>
      entry(
        path,
        [
          'assert!(prompt.contains("HeyBuddy"));',
          'assert!(!prompt.contains("HeyBuddy"));',
          '',
        ].join('\n'),
      ),
    ),
    { input: 'upstream' },
  );

  assert.equal(result.report.complete, true);
  for (const path of paths) {
    const outputPath = path.replace('crates/heybuddy/', 'crates/aibuddy/');
    assert.equal(
      text(result, outputPath),
      [
        'assert!(prompt.contains("AIBuddy"));',
        'assert!(!prompt.contains("HeyBuddy"));',
        '',
      ].join('\n'),
    );
  }
});

test('preserves the Goose session column while converting the current HeyBuddy column', async () => {
  const result = await transformSnapshot([
    entry(
      'crates/heybuddy/src/session/session_manager.rs',
      [
        'const COLUMNS: &str = "WHERE name IN (\'goose_mode\', \'heybuddy_mode\')";',
        'const ERROR: &str = "sessions contains both goose_mode and heybuddy_mode";',
        'const ALTER: &str = "ALTER TABLE sessions RENAME COLUMN goose_mode TO heybuddy_mode";',
        '',
      ].join('\n'),
    ),
  ], { input: 'upstream' });

  assert.equal(result.report.complete, true);
  assert.equal(
    text(result, 'crates/aibuddy/src/session/session_manager.rs'),
    [
      'const COLUMNS: &str = "WHERE name IN (\'goose_mode\', \'aibuddy_mode\')";',
      'const ERROR: &str = "sessions contains both goose_mode and aibuddy_mode";',
      'const ALTER: &str = "ALTER TABLE sessions RENAME COLUMN goose_mode TO aibuddy_mode";',
      '',
    ].join('\n'),
  );
});

test('preserves explicitly keyed HeyBuddy database compatibility values in product input', async () => {
  const result = await transformSnapshot([
    entry(
      'crates/aibuddy/src/session/session_manager.rs',
      [
        'struct Session {',
        '#[serde(default, alias = "goose_mode", alias = "heybuddy_mode")]',
        'pub aibuddy_mode: AIBuddyMode,',
        '}',
        'const LEGACY_HEYBUDDY_MODE_COLUMN: &str = "heybuddy_mode";',
        'const CURRENT_HEYBUDDY_MODE_COLUMN: &str = "heybuddy_mode";',
        '',
      ].join('\n'),
    ),
  ], { input: 'product' });

  assert.equal(result.report.complete, true);
  assert.equal(
    text(result, 'crates/aibuddy/src/session/session_manager.rs'),
    [
      'struct Session {',
      '#[serde(default, alias = "goose_mode", alias = "heybuddy_mode")]',
      'pub aibuddy_mode: AIBuddyMode,',
      '}',
      'const LEGACY_HEYBUDDY_MODE_COLUMN: &str = "heybuddy_mode";',
      'const CURRENT_AIBUDDY_MODE_COLUMN: &str = "aibuddy_mode";',
      '',
    ].join('\n'),
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
  assert.equal(text(result, 'src/module.mts'), 'export const AIBuddy = "AIBuddy";\n');
  assert.equal(text(result, 'src/loader.cts'), 'export const AIBuddies = "AIBuddies";\n');
  assert.equal(text(result, 'Cargo.lock'), '[[package]]\nname = "aibuddy"\n');
  assert.equal(text(result, 'config.yaml.disabled'), 'name: AIBuddy\n');
  assert.equal(text(result, 'config.yml.disabled'), 'name: AIBuddies\n');
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
      'name = "localaibuddy"',
      'version = "0.1.0"',
      'dependencies = ["v8-goose"]',
      '',
      '[[package]]',
      'name = "v8-goose"',
      'version = "145.0.2"',
      'source = "registry+https://github.com/rust-lang/crates.io-index"',
      'dependencies = ["localaibuddy"]',
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
      '  - AIBuddy',
      '  - AIBuddies',
      '  - name: AIBuddy',
      '    url: https://github.com/aaif-goose/goose',
      'prompt: |',
      '  Run AIBuddy via https://goose-docs.ai/',
      'literal: >-',
      '  AIBuddies docs',
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
      '# generated AIBUDDY_SERVER__SECRET_KEY',
      'name: AIBuddy # See https://goose-docs.ai/ for AIBuddy docs',
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
    'const markdown = `See https://goose-docs.ai/ for AIBuddy docs`;\n',
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
      "const PACKAGE_FIXTURE = '{\\n  \"name\": \"aibuddy-app\",\\n  \"version\": \"1.45.0\"\\n}\\n';",
      'const label = "AIBuddy";',
      'const template = `AIBuddy`;',
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
        "expect(() => resolveBrand('goose')).toThrow(/goose.*aibuddy/);",
        '',
      ].join('\n'),
    ),
    entry(
      'ui/desktop/scripts/windows-package.test.js',
      "it.each(['', 'goose', 'AIBUDDY'])('rejects %j', (edition) => edition);\n",
    ),
    entry(
      'ui/desktop/src/brand.test.ts',
      [
        "expect(getAppProtocol()).toBe('goose');",
        "vi.stubEnv('APP_EDITION', 'goose');",
        "it.each([undefined, '', 'goose', 'AIBUDDY'])('rejects %o', (edition) => edition);",
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(
    text(result, 'ui/desktop/scripts/brand.test.js'),
    [
      "const brand = { protocol: 'aibuddy' };",
      "expect(() => resolveBrand('goose')).toThrow(/goose.*aibuddy/);",
      '',
    ].join('\n'),
  );
  assert.equal(
    text(result, 'ui/desktop/scripts/windows-package.test.js'),
    "it.each(['', 'goose', 'AIBUDDY'])('rejects %j', (edition) => edition);\n",
  );
  assert.equal(
    text(result, 'ui/desktop/src/brand.test.ts'),
    [
      "expect(getAppProtocol()).toBe('aibuddy');",
      "vi.stubEnv('APP_EDITION', 'goose');",
      "it.each([undefined, '', 'goose', 'AIBUDDY'])('rejects %o', (edition) => edition);",
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
        "expect(buildAIBuddyEnv({})).toEqual({ GOOSE_PROVIDER: 'goose' });",
        'expect(Object.keys(env).sort()).toEqual([',
        "  'GOOSE_PROVIDER',",
        "  'AIBUDDY_API_KEY',",
        "  'AIBUDDY_BASE_URL',",
        ']);',
        '',
      ].join('\n'),
    ),
  ]);

  assert.equal(result.report.complete, true);
  assert.deepEqual(result.report.unresolved, []);
  assert.equal(
    text(result, 'ui/desktop/src/aibuddyServeEnv.test.ts'),
    [
      "expect(buildAIBuddyEnv({})).toEqual({ AIBUDDY_PROVIDER: 'aibuddy' });",
      'expect(Object.keys(env).sort()).toEqual([',
      "  'AIBUDDY_API_KEY',",
      "  'AIBUDDY_BASE_URL',",
      "  'AIBUDDY_PROVIDER',",
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
      'const label = "AIBuddy";',
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
        text(result, 'crates/aibuddy-cli/src/logging.rs'),
    [
      'fn check() {',
      '  let log_dir = prepare_log_directory("cli", true).unwrap();',
      '  assert!(path_components.iter().any(|c| c.as_os_str() == "goose"));',
      '  let label = "AIBuddy";',
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
      "import AIBuddyLogo from './AIBuddyLogo';",
      'export function RecipeActivities() {',
      '  return <div>{/* Animated aibuddy icon */}<AIBuddyLogo /></div>;',
      '}',
      '',
    ].join('\n'),
  );
  assert.ok(
    reportFor(result, 'ui/desktop/src/RecipeActivities.tsx').mappings.some(
      (mapping) =>
        mapping.kind === 'typescript-comment' &&
        mapping.original === '/* Animated goose icon */' &&
        mapping.replacement === '/* Animated aibuddy icon */',
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
        symbol.replacement === 'AIBuddy',
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
  assert.equal(text(result, 'src/regex.ts'), 'const matcher = /AIBuddy/; // AIBuddy remains parser-visible\n');

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
  assert.deepEqual(outputFor(result, 'assets/aibuddy.dat').content, Buffer.from([0, 255, 1]));
  assert.ok(result.report.unresolved.length >= 1);
  assert.equal(reportFor(result, 'assets/goose.dat').outputPath, 'assets/aibuddy.dat');
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
