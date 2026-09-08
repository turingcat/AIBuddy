import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { readSnapshot } from '../src/generate.mjs';
import { applyEdits } from '../src/adapters/shared.mjs';
import { transformRust } from '../src/adapters/rust.mjs';
import { transformSnapshot } from '../src/transform.mjs';

const policy = JSON.parse(readFileSync(new URL('../production-policy.json', import.meta.url), 'utf8'));

function transform(text, path = 'crates/goose/src/lib.rs') {
  const result = transformRust({ path, text, policy });
  assert.deepEqual(result.errors ?? result.unresolved ?? [], []);
  assert.deepEqual(result.unresolved ?? [], []);
  return {
    result,
    text: applyEdits(text, result.edits),
  };
}

test('accepts valid let-else Rust and edits tokens without changing formatting', () => {
  const source = [
    'pub fn run(value: Option<&str>) -> Option<&str> {',
    '    let Some(goose) = value else {',
    '        // Goose stays in this comment.',
    '        return None;',
    '    };',
    '    Some(goose)',
    '}',
    '',
  ].join('\n');

  const { result, text } = transform(source);

  assert.equal(text, [
    'pub fn run(value: Option<&str>) -> Option<&str> {',
    '    let Some(heybuddy) = value else {',
    '        // HeyBuddy stays in this comment.',
    '        return None;',
    '    };',
    '    Some(heybuddy)',
    '}',
    '',
  ].join('\n'));
  assert.ok(result.edits.some((edit) => edit.original === 'goose'));
  assert.ok(result.edits.some((edit) => edit.kind === 'rust-comment'));
});

test('renames macro definitions, macro inputs, and raw or byte string literals', () => {
  const source = [
    'macro_rules! GeeseFactory {',
    '    ($value:expr) => { Goose::new($value) };',
    '}',
    '',
    'fn example() {',
    '    let _ = GeeseFactory!(r###"Goose"###);',
    '    let _bytes = br###"Geese"###;',
    '}',
    '',
  ].join('\n');

  const { text } = transform(source);

  assert.equal(text, [
    'macro_rules! HeyBuddiesFactory {',
    '    ($value:expr) => { HeyBuddy::new($value) };',
    '}',
    '',
    'fn example() {',
    '    let _ = HeyBuddiesFactory!(r###"HeyBuddy"###);',
    '    let _bytes = br###"HeyBuddies"###;',
    '}',
    '',
  ].join('\n'));
});

test('maps Rust UTF-8 byte spans to JavaScript UTF-16 offsets', () => {
  const source = 'fn main() { let greeting = "中文"; let goose = "Goose"; }\n';
  const { result, text } = transform(source);

  assert.equal(text, 'fn main() { let greeting = "中文"; let heybuddy = "HeyBuddy"; }\n');
  assert.ok(result.edits.some((edit) => edit.start === source.indexOf('goose')));
  assert.ok(result.edits.some((edit) => edit.start === source.indexOf('"Goose"')));
  assert.equal(source.slice(result.edits.at(-2).start, result.edits.at(-2).end), 'goose');
});

test('renames comments and preserves URL/runtime identity references', () => {
  const source = [
    '// Goose comment',
    '/* Geese block comment */',
    '// URL https://github.com/aaif-goose/goose stays exact.',
    'fn choose() {',
    '    let args = choose_app_strategy(AppStrategyArgs {',
    '        app_name: "goose".to_string(),',
    '        display_name: "goose".to_string(),',
    '    });',
    '    let name = "goose";',
    '    const KEYRING_SERVICE: &str = "goose";',
    '    let _ = (args, name, KEYRING_SERVICE);',
    '}',
    '',
  ].join('\n');

  const { result, text } = transform(source, 'crates/goose/src/config/paths.rs');

  assert.equal(text, [
    '// HeyBuddy comment',
    '/* HeyBuddies block comment */',
    '// URL https://github.com/aaif-goose/goose stays exact.',
    'fn choose() {',
    '    let args = choose_app_strategy(AppStrategyArgs {',
    '        app_name: "goose".to_string(),',
    '        display_name: "heybuddy".to_string(),',
    '    });',
    '    let name = "heybuddy";',
    '    const KEYRING_SERVICE: &str = "goose";',
    '    let _ = (args, name, KEYRING_SERVICE);',
    '}',
    '',
  ].join('\n'));
  assert.ok(result.preserved.some((reference) => reference.value === 'goose'));
  const urlComment = '// URL https://github.com/aaif-goose/goose stays exact.';
  const preservedUrl = result.preserved.find((reference) => reference.value === urlComment);
  assert.ok(preservedUrl);
  assert.equal(source.slice(preservedUrl.start, preservedUrl.end), urlComment);
});

test('preserves URL spans while renaming adjacent brands in normal, raw, and byte strings', () => {
  const source = [
    'fn example() {',
    '    let normal = "https://github.com/aaif-goose/goose Goose";',
    '    let raw = r###"https://github.com/aaif-goose/goose Geese"###;',
    '    let bytes = br###"https://github.com/aaif-goose/goose goose"###;',
    '    let _ = (normal, raw, bytes);',
    '}',
    '',
  ].join('\n');

  const { result, text } = transform(source);

  assert.equal(text, [
    'fn example() {',
    '    let normal = "https://github.com/aaif-goose/goose HeyBuddy";',
    '    let raw = r###"https://github.com/aaif-goose/goose HeyBuddies"###;',
    '    let bytes = br###"https://github.com/aaif-goose/goose heybuddy"###;',
    '    let _ = (normal, raw, bytes);',
    '}',
    '',
  ].join('\n'));

  const preservedUrls = result.preserved.filter((reference) => reference.value.includes('https://'));
  assert.equal(preservedUrls.length, 3);
  for (const reference of preservedUrls) {
    assert.equal(source.slice(reference.start, reference.end), reference.value);
    assert.match(reference.value, /^https:\/\/github\.com\/aaif-goose\/goose$/u);
  }
});

test('infers runtime keys across multiline fields, locals, and constants', () => {
  const source = [
    'const KEYRING_SERVICE: &str =',
    '    "goose";',
    '',
    'fn choose() {',
    '    let args = choose_app_strategy(AppStrategyArgs {',
    '        app_name:',
    '            "goose".to_string(),',
    '        display_name:',
    '            "goose".to_string(),',
    '    });',
    '    let app_name =',
    '        "goose".to_string();',
    '    let name =',
    '        "goose".to_string();',
    '    let _ = (args, app_name, name, KEYRING_SERVICE);',
    '}',
    '',
  ].join('\n');

  const { text } = transform(source, 'crates/goose/src/config/paths.rs');

  assert.equal(text, [
    'const KEYRING_SERVICE: &str =',
    '    "goose";',
    '',
    'fn choose() {',
    '    let args = choose_app_strategy(AppStrategyArgs {',
    '        app_name:',
    '            "goose".to_string(),',
    '        display_name:',
    '            "heybuddy".to_string(),',
    '    });',
    '    let app_name =',
    '        "goose".to_string();',
    '    let name =',
    '        "heybuddy".to_string();',
    '    let _ = (args, app_name, name, KEYRING_SERVICE);',
    '}',
    '',
  ].join('\n'));
});

test('preserves exact external Rust aliases while renaming local goose identifiers', () => {
  const source = [
    'pub use v8_goose::*;',
    '',
    'fn local() {',
    '    let goose = "Goose";',
    '    let _ = goose;',
    '}',
    '',
  ].join('\n');
  const aliasPolicy = structuredClone(policy);
  aliasPolicy.preserve.externalIdentifiers = [
    ...aliasPolicy.preserve.externalIdentifiers,
    'v8-goose',
    'v8_goose',
  ];

  const result = transformRust({
    path: 'vendor/v8/src/lib.rs',
    text: source,
    policy: aliasPolicy,
  });

  assert.deepEqual(result.errors ?? result.unresolved ?? [], []);
  assert.deepEqual(result.unresolved ?? [], []);
  assert.equal(result.text, [
    'pub use v8_goose::*;',
    '',
    'fn local() {',
    '    let heybuddy = "HeyBuddy";',
    '    let _ = heybuddy;',
    '}',
    '',
  ].join('\n'));
  const aliasStart = source.indexOf('v8_goose');
  const preservedAlias = result.preserved.find((reference) => reference.value === 'v8_goose');
  assert.ok(preservedAlias);
  assert.equal(preservedAlias.start, aliasStart);
  assert.equal(preservedAlias.end, aliasStart + 'v8_goose'.length);
  assert.ok(result.edits.some((edit) => edit.original === 'goose'));
});

test('preserves the exact CLI logging fixture literal while renaming other Rust strings', () => {
  const source = [
    'fn check() {',
    '    let log_dir = prepare_log_directory("cli", true).unwrap();',
    '    assert!(path_components.iter().any(|c| c.as_os_str() == "goose"));',
    '    let label = "Goose";',
    '}',
    '',
  ].join('\n');

  const result = transformRust({
    path: 'crates/goose-cli/src/logging.rs',
    text: source,
    policy,
  });

  assert.deepEqual(result.errors ?? result.unresolved ?? [], []);
  assert.deepEqual(result.unresolved ?? [], []);
  assert.equal(result.text, [
    'fn check() {',
    '    let log_dir = prepare_log_directory("cli", true).unwrap();',
    '    assert!(path_components.iter().any(|c| c.as_os_str() == "goose"));',
    '    let label = "HeyBuddy";',
    '}',
    '',
  ].join('\n'));
  const literalStart = source.lastIndexOf('"goose"') + 1;
  const preservedLiteral = result.preserved.find(
    (reference) => reference.value === 'goose' && reference.start === literalStart,
  );
  assert.ok(preservedLiteral);
  assert.equal(preservedLiteral.end, literalStart + 'goose'.length);
  assert.ok(result.edits.some((edit) => edit.original === '"Goose"'));
});

test('fails closed on syn parse errors without applying lexical edits', () => {
  const source = 'fn main( { let goose = "Goose"; }\n';
  const result = transformRust({ path: 'crates/goose/src/bad.rs', text: source, policy });

  assert.ok((result.errors ?? result.unresolved ?? []).length > 0);
  assert.deepEqual(result.edits, []);
  assert.equal(result.text, source);
});

test('parses every Rust file in the current H0 snapshot', async () => {
  const snapshot = readSnapshot({ cwd: process.cwd(), sourceRef: 'HEAD' });
  const rustEntries = snapshot.entries.filter((entry) => entry.path.endsWith('.rs'));
  const result = await transformSnapshot(rustEntries);
  const parserErrors = result.report.unresolved.filter((item) => item.kind === 'parser-error');

  assert.equal(rustEntries.length, 550);
  assert.deepEqual(parserErrors, []);
});
