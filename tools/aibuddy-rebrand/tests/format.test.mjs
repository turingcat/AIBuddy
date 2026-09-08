import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { formatSnapshot } from '../src/format.mjs';

function entry(path, content, mode = '100644') {
  return { path, mode, content: Buffer.from(content) };
}

function contentFor(result, path) {
  return result.entries.find((candidate) => candidate.path === path).content;
}

test('formats selected Rust through rustfmt and reports precise change metadata', () => {
  const source = Buffer.from([
    'fn calculate_value(value: usize, other: usize) -> usize {',
    '    value + other',
    '}',
    '',
    'fn example(aibuddy_extremely_long_identifier_that_exceeds_the_default_formatting_width: usize) {',
    '    let _value = calculate_value(aibuddy_extremely_long_identifier_that_exceeds_the_default_formatting_width, 123);',
    '}',
    '',
  ].join('\n'));

  const result = formatSnapshot(
    [entry('src/example.rs', source), entry('README.md', 'unchanged\n', '100755')],
    { edition: '2021', paths: ['src/example.rs'] },
  );

  const formatted = contentFor(result, 'src/example.rs');
  assert.notDeepEqual(formatted, source);
  assert.match(formatted.toString('utf8'), /aibuddy_extremely_long_identifier_that_exceeds_the_default_formatting_width/u);
  assert.deepEqual(contentFor(result, 'README.md'), Buffer.from('unchanged\n'));
  assert.equal(result.entries.find((candidate) => candidate.path === 'README.md').mode, '100755');

  assert.equal(result.report.formatter, 'rustfmt');
  assert.match(result.report.rustfmtVersion, /^rustfmt /u);
  assert.deepEqual(result.report.command, [
    'rustfmt',
    '--emit',
    'stdout',
    '--edition',
    '2021',
    '--config',
    'skip_children=true',
  ]);
  assert.equal(result.report.offsetBasis, 'pre-format');
  assert.equal(result.report.formattingChangeCount, 1);
  assert.equal(result.report.files.length, 1);
  assert.equal(result.report.files[0].path, 'src/example.rs');
  assert.match(result.report.files[0].beforeDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.report.files[0].afterDigest, /^[0-9a-f]{64}$/u);
  assert.notEqual(result.report.files[0].beforeDigest, result.report.files[0].afterDigest);
  assert.equal(result.report.files[0].formattingChangeCount, 1);
});

test('formats stdin with skip_children and is idempotent', () => {
  const source = [
    'mod child;',
    '',
    'fn main(){let value=1;let _=value;}',
    '',
  ].join('\n');
  const initial = { entries: [entry('src/main.rs', source)], paths: new Set(['src/main.rs']) };

  const once = formatSnapshot(initial.entries, initial);
  const twice = formatSnapshot(once.entries, initial);

  assert.match(contentFor(once, 'src/main.rs').toString('utf8'), /mod child;/u);
  assert.notEqual(contentFor(once, 'src/main.rs').toString('utf8'), source);
  assert.deepEqual(contentFor(twice, 'src/main.rs'), contentFor(once, 'src/main.rs'));
  assert.equal(twice.report.formattingChangeCount, 0);
  assert.equal(twice.report.files[0].beforeDigest, twice.report.files[0].afterDigest);
  assert.equal(twice.report.files[0].formattingChangeCount, 0);
});

test('preserves nonselected bytes and modes, including a symlink entry', () => {
  const readme = Buffer.from([0, 1, 2, 3, 255]);
  const linkTarget = Buffer.from('src/example.rs');
  const result = formatSnapshot(
    [
      entry('src/example.rs', 'fn main(){let _=1;}\n'),
      { path: 'assets/data.bin', mode: '100755', content: readme },
      { path: 'links/example', mode: '120000', content: linkTarget },
    ],
    { paths: ['src/example.rs'] },
  );

  assert.deepEqual(contentFor(result, 'assets/data.bin'), readme);
  assert.equal(result.entries.find((candidate) => candidate.path === 'assets/data.bin').mode, '100755');
  assert.deepEqual(contentFor(result, 'links/example'), linkTarget);
  assert.equal(result.entries.find((candidate) => candidate.path === 'links/example').mode, '120000');
});

test('keeps Unicode, raw strings, and comments intact while formatting Rust', () => {
  const comment = '// Keep this comment and its Unicode: 你好';
  const raw = 'r###"raw text: 中文 and \\"quotes\\""###';
  const source = [
    'fn main(){',
    `let raw=${raw};`,
    `let normal="こんにちは";${comment}`,
    'let _=(raw,normal);',
    '}',
    '',
  ].join('\n');

  const result = formatSnapshot([entry('src/unicode.rs', source)], { paths: ['src/unicode.rs'] });
  const formatted = contentFor(result, 'src/unicode.rs').toString('utf8');

  assert.match(formatted, new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(formatted, /"こんにちは"/u);
  assert.match(formatted, new RegExp(comment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('does not use the caller directory rustfmt configuration or write there', () => {
  const callerDirectory = mkdtempSync(join(tmpdir(), 'aibuddy-format-caller-'));
  const originalCwd = process.cwd();
  writeFileSync(join(callerDirectory, 'rustfmt.toml'), 'disable_all_formatting = true\n');
  const before = readdirSync(callerDirectory).sort();

  try {
    process.chdir(callerDirectory);
    const result = formatSnapshot([entry('src/config.rs', 'fn main(){let _=1;}\n')], {
      paths: ['src/config.rs'],
    });

    assert.notEqual(contentFor(result, 'src/config.rs').toString('utf8'), 'fn main(){let _=1;}\n');
    assert.deepEqual(readdirSync(callerDirectory).sort(), before);
  } finally {
    process.chdir(originalCwd);
    rmSync(callerDirectory, { recursive: true, force: true });
  }
});

test('rejects missing paths, non-Rust selections, collisions, invalid editions, and symlinks', () => {
  const rust = entry('src/main.rs', 'fn main() {}\n');

  assert.throws(() => formatSnapshot([rust]), /paths.*required/u);
  assert.throws(() => formatSnapshot([rust], { paths: ['missing.rs'] }), /unknown.*path/u);
  assert.throws(() => formatSnapshot([rust], { paths: ['README.md'] }), /\.rs/u);
  assert.throws(() => formatSnapshot([rust], { paths: ['src/main.rs', 'src/main.rs'] }), /collision|duplicate/u);
  assert.throws(
    () => formatSnapshot([rust, entry('SRC/MAIN.RS', 'fn main() {}\n')], { paths: ['src/main.rs'] }),
    /collision/u,
  );
  assert.throws(() => formatSnapshot([rust], { edition: '2030', paths: ['src/main.rs'] }), /edition/u);
  assert.throws(() => formatSnapshot([rust], { edition: null, paths: ['src/main.rs'] }), /edition/u);
  assert.throws(
    () => formatSnapshot([{ path: 'src/main.rs', mode: '120000', content: Buffer.from('target') }], {
      paths: ['src/main.rs'],
    }),
    /symlink/u,
  );
});

test('fails closed when rustfmt rejects invalid Rust', () => {
  const source = Buffer.from('fn main( { let value = 1; }\n');

  assert.throws(
    () => formatSnapshot([entry('src/bad.rs', source)], { paths: ['src/bad.rs'] }),
    /rustfmt.*src\/bad\.rs|src\/bad\.rs.*rustfmt/isu,
  );
});

test('rejects malformed entries before invoking rustfmt', () => {
  assert.throws(
    () => formatSnapshot([{ path: '../main.rs', mode: '100644', content: Buffer.from('fn main() {}') }], {
      paths: ['../main.rs'],
    }),
    /safe relative path/u,
  );
  assert.throws(
    () => formatSnapshot([{ path: 'src/main.rs', mode: '100644', content: 'fn main() {}' }], {
      paths: ['src/main.rs'],
    }),
    /Buffer/u,
  );
  assert.equal(existsSync(join(process.cwd(), 'rustfmt.toml')), false);
});
