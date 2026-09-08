import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cli from '../cli.mjs';

test('summarizes verified output without dumping source entries or reports', () => {
  assert.equal(typeof cli.snapshotSummary, 'function');
  assert.deepEqual(cli.snapshotSummary({
    outputDir: '/tmp/out', valid: true,
    provenance: { source: { commit: 'abc' }, inputDigest: 'in', outputDigest: 'out', entries: [{ path: 'a' }], report: { large: 'details' } },
  }), {
    outputDir: '/tmp/out', valid: true, source: { commit: 'abc' }, inputDigest: 'in', outputDigest: 'out',
    entryCount: 1, provenanceFile: '/tmp/out/.heybuddy-rebrand.json',
  });
});

test('runs when the command entry point is a symbolic link', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'rebrand-cli-link-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const entry = join(root, 'rebrand.mjs');
  symlinkSync(fileURLToPath(new URL('../cli.mjs', import.meta.url)), entry);
  const output = execFileSync(process.execPath, [entry, '--help'], { encoding: 'utf8' });
  assert.match(output, /generate --source-ref/);
});

test('parses each rebrand command without performing filesystem operations', () => {
  assert.equal(typeof cli.parseCommand, 'function');
  assert.deepEqual(cli.parseCommand([]), { command: 'help' });
  assert.deepEqual(cli.parseCommand(['--help']), { command: 'help' });
  assert.deepEqual(cli.parseCommand(['generate', '--help']), { command: 'help' });
  assert.deepEqual(cli.parseCommand(['inventory', '--source-ref', 'HEAD', '--report-dir', '/tmp/report']), {
    command: 'inventory', sourceRef: 'HEAD', reportDir: '/tmp/report',
  });
  assert.deepEqual(cli.parseCommand(['generate', '--source-ref', 'abc123', '--output', '/tmp/generated', '--input', 'upstream']), {
    command: 'generate', sourceRef: 'abc123', outputDir: '/tmp/generated', input: 'upstream',
  });
  assert.deepEqual(cli.parseCommand(['generate', '--source-ref', 'HEAD', '--output', '/tmp/product']), {
    command: 'generate', sourceRef: 'HEAD', outputDir: '/tmp/product', input: 'product',
  });
  assert.deepEqual(cli.parseCommand(['verify', '--output', '/tmp/generated']), {
    command: 'verify', outputDir: '/tmp/generated',
  });
});

test('can be imported by an eval script with a non-file argument', () => {
  const source = `await import(${JSON.stringify(new URL('../cli.mjs', import.meta.url).href)})`;
  assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', source, 'not-a-script-path'], { encoding: 'utf8' }), '');
});

test('rejects unknown, repeated, missing and ambiguous command arguments', () => {
  assert.equal(typeof cli.parseCommand, 'function');
  for (const args of [
    ['rename'], ['inventory'], ['generate'], ['verify'],
    ['verify', '--source-ref', 'HEAD'], ['verify', '--output'],
    ['verify', '--output', '--help'], ['verify', '--output', ''],
    ['verify', '--output', '/tmp/a', '--output', '/tmp/b'],
    ['verify', '--output', '/tmp/a', 'constructor', 'value'],
    ['verify', '--output', '/tmp/a', '__proto__', 'value'],
    ['generate', '--source-ref', 'HEAD', '--output', '/tmp/a', '--input', 'other'],
    ['generate', '--source-ref', '--help', '--output', '/tmp/a'],
    ['inventory', '--help', 'trailing'],
  ]) {
    assert.throws(() => cli.parseCommand(args), Error, JSON.stringify(args));
  }
});
