import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  inventoryGitTree,
  serializeInventory,
  writeInventoryReport,
} from '../src/inventory.mjs';
import { createInventoryFixture } from './fixtures/git-fixture.mjs';

function entryFor(report, path) {
  const entry = report.entries.find((candidate) => candidate.path === path);
  assert.ok(entry, `missing inventory entry for ${path}`);
  return entry;
}

test('inventories the pinned Git tree instead of the dirty working directory', (t) => {
  const fixture = createInventoryFixture();
  t.after(fixture.cleanup);

  writeFileSync(join(fixture.root, 'README.md'), 'The working tree no longer contains the old name\n');
  writeFileSync(join(fixture.root, 'untracked-goose.txt'), 'untracked content\n');

  const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
  const readme = entryFor(report, 'README.md');

  assert.deepEqual(report.source, {
    ref: fixture.commit,
    commit: fixture.commit,
    tree: fixture.tree,
  });
  assert.deepEqual(readme.candidate.contentTerms, ['goose']);
  assert.equal(report.entries.some((entry) => entry.path === 'untracked-goose.txt'), false);
  assert.equal(report.analysis.semanticSymbolsResolved, false);
});

test('classifies modes, binaries, symlinks, plurals, and case-insensitive lexical candidates', (t) => {
  const fixture = createInventoryFixture();
  t.after(fixture.cleanup);

  const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });

  const hidden = entryFor(report, '.hidden/GeEsE.md');
  assert.deepEqual(hidden.candidate.pathTerms, ['geese']);
  assert.deepEqual(hidden.candidate.contentTerms, ['geese']);
  assert.equal(hidden.classification, 'text');

  const binary = entryFor(report, 'assets/logo.GOOSE.bin');
  assert.equal(binary.classification, 'binary');
  assert.deepEqual(binary.candidate.pathTerms, ['goose']);
  assert.deepEqual(binary.candidate.contentTerms, ['goose']);

  const executable = entryFor(report, 'bin/runner');
  assert.equal(executable.mode, '100755');
  assert.equal(executable.executable, true);
  assert.equal(executable.classification, 'text');

  const symlink = entryFor(report, 'links/goose-link');
  assert.equal(symlink.mode, '120000');
  assert.equal(symlink.classification, 'symlink');
  assert.equal(symlink.symlinkTarget, '../README.md');
  assert.equal(symlink.symlinkSafety, 'safe');
  assert.deepEqual(symlink.candidate.pathTerms, ['goose']);
  assert.deepEqual(symlink.candidate.contentTerms, []);

  const escapingSymlink = entryFor(report, 'links/escape-goose-link');
  assert.equal(escapingSymlink.classification, 'symlink');
  assert.equal(escapingSymlink.symlinkSafety, 'unsafe');

  assert.equal(report.candidates.some((candidate) => candidate.path === 'docs/CaseVariant.txt'), true);
  assert.deepEqual(entryFor(report, 'docs/CaseVariant.txt').candidate.contentTerms, ['geese']);
  assert.equal(report.candidates.every((candidate) => candidate.semanticSymbolsResolved === false), true);
});

test('retains tracked source under build, dist, vendor, and nested dependency paths', (t) => {
  const fixture = createInventoryFixture();
  t.after(fixture.cleanup);

  const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });

  for (const path of [
    'build/generated/goose-input.txt',
    'dist/generated/geese-input.txt',
    'src/build/goose-source.rs',
    'src/dependencies/geese-source.txt',
    'vendor/v8/goose-source.cc',
    'vendor/geese/vendor.txt',
  ]) {
    const entry = entryFor(report, path);
    assert.equal(entry.classification, 'text');
    assert.equal(entry.candidate.pathTerms.length > 0 || entry.candidate.contentTerms.length > 0, true);
    assert.equal(report.excluded.some((excluded) => excluded.path === path), false);
  }
});

test('preserves Git filenames containing tabs and spaces', (t) => {
  const fixture = createInventoryFixture();
  t.after(fixture.cleanup);

  const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
  const entry = entryFor(report, 'docs/goose note\twith spaces.md');

  assert.deepEqual(entry.candidate.pathTerms, ['goose']);
  assert.deepEqual(entry.candidate.contentTerms, ['goose']);
});

test('excludes tracked worktree, cache, dependency, and build paths without reading them as inventory entries', (t) => {
  const fixture = createInventoryFixture();
  t.after(fixture.cleanup);

  const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
  const excludedPaths = report.excluded.map((entry) => entry.path);

  assert.deepEqual(excludedPaths, [
    '.worktrees/nested/goose.txt',
    'cache/goose-cache.bin',
    'deps/geese-dependency.txt',
    'node_modules/goose/index.js',
    'target/goose/debug.bin',
  ]);
  assert.equal(report.entries.some((entry) => entry.path.startsWith('cache/')), false);
  assert.equal(report.entries.some((entry) => entry.path.startsWith('deps/')), false);
  assert.equal(report.counts.excluded, excludedPaths.length);
  assert.equal(report.counts.tracked, report.counts.included + report.counts.excluded);
  assert.equal(report.excluded.every((entry) => entry.exclusion.category), true);
});

test('serializes the same pinned inventory deterministically and writes only the requested report', (t) => {
  const fixture = createInventoryFixture();
  t.after(fixture.cleanup);

  const first = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
  const second = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
  const firstJson = serializeInventory(first);
  const secondJson = serializeInventory(second);

  assert.equal(firstJson, secondJson);
  assert.equal(firstJson.endsWith('\n'), true);
  assert.equal(firstJson.includes('generatedAt'), false);
  assert.equal(firstJson.includes('resolved semantic symbols'), false);

  const reportDir = mkdtempSync(join(fixture.root, '..', 'aibuddy-inventory-report-'));
  t.after(() => rmSync(reportDir, { recursive: true, force: true }));
  const reportPath = writeInventoryReport(reportDir, first);
  assert.equal(reportPath, join(reportDir, 'inventory.json'));
});

test('records the Git mode and object identity for every included entry', (t) => {
  const fixture = createInventoryFixture();
  t.after(fixture.cleanup);

  const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
  for (const entry of report.entries) {
    assert.match(entry.objectId, /^[0-9a-f]{40}$/);
    assert.match(entry.mode, /^(100644|100755|120000)$/);
    assert.equal(typeof entry.gitType, 'string');
  }
});

test('CLI writes a deterministic report outside the source tree', (t) => {
  const fixture = createInventoryFixture();
  const reportDir = mkdtempSync(join(fixture.root, '..', 'aibuddy-inventory-report-'));
  t.after(() => {
    fixture.cleanup();
    rmSync(reportDir, { recursive: true, force: true });
  });

  const cliPath = resolve(fileURLToPath(new URL('../cli.mjs', import.meta.url)));
  const stdout = execFileSync(
    process.execPath,
    [cliPath, 'inventory', '--source-ref', fixture.commit, '--report-dir', reportDir],
    { cwd: fixture.root, encoding: 'utf8', env: fixture.environment },
  );
  const reportPath = stdout.trim();
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));

  assert.equal(reportPath, join(reportDir, 'inventory.json'));
  assert.equal(report.source.commit, fixture.commit);
  assert.equal(report.analysis.semanticSymbolsResolved, false);
});

test('CLI rejects report placement inside the source tree', (t) => {
  const fixture = createInventoryFixture();
  const reportDir = join(fixture.root, 'inventory-report');
  t.after(fixture.cleanup);

  const cliPath = resolve(fileURLToPath(new URL('../cli.mjs', import.meta.url)));
  assert.throws(
    () => execFileSync(
      process.execPath,
      [cliPath, 'inventory', '--source-ref', fixture.commit, '--report-dir', reportDir],
      {
        cwd: fixture.root,
        encoding: 'utf8',
        env: fixture.environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ),
    (error) => {
      assert.match(error.stderr.toString(), /report directory must be outside the source tree/);
      return true;
    },
  );
  assert.equal(existsSync(reportDir), false);
});

test('isolates fixture and CLI Git operations from hostile Git environment', (t) => {
  const hostileEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(tmpdir(), 'missing-hostile-global-config'),
    GIT_DIR: join(tmpdir(), 'missing-hostile-git-dir'),
    GIT_TEMPLATE_DIR: join(tmpdir(), 'missing-hostile-template'),
    GIT_WORK_TREE: join(tmpdir(), 'missing-hostile-work-tree'),
  };
  const fixture = createInventoryFixture({ environment: hostileEnv });
  const reportDir = mkdtempSync(join(fixture.root, '..', 'aibuddy-hostile-report-'));
  t.after(() => {
    fixture.cleanup();
    rmSync(reportDir, { recursive: true, force: true });
  });

  const cliPath = resolve(fileURLToPath(new URL('../cli.mjs', import.meta.url)));
  const stdout = execFileSync(
    process.execPath,
    [cliPath, 'inventory', '--source-ref', fixture.commit, '--report-dir', reportDir],
    { cwd: fixture.root, encoding: 'utf8', env: hostileEnv },
  );
  const report = JSON.parse(readFileSync(stdout.trim(), 'utf8'));

  assert.equal(report.source.commit, fixture.commit);
});

test('reports case-insensitive and file-directory prefix collisions from Git paths', (t) => {
  const fixture = createInventoryFixture({
    syntheticEntries: [
      { content: 'upper case path\n', path: 'collision/Goose.txt' },
      { content: 'lower case path\n', path: 'collision/goose.txt' },
      { content: 'file path\n', path: 'collision/Source' },
      { content: 'descendant path\n', path: 'collision/source/child.txt' },
    ],
  });
  t.after(fixture.cleanup);

  const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });

  assert.deepEqual(report.collisions.caseInsensitivePaths, [
    {
      normalizedPath: 'collision/goose.txt',
      paths: ['collision/Goose.txt', 'collision/goose.txt'],
    },
  ]);
  assert.deepEqual(report.collisions.fileDirectoryPrefixes, [
    {
      descendantPath: 'collision/source/child.txt',
      filePath: 'collision/Source',
      normalizedPrefix: 'collision/source',
    },
  ]);
});

test('does not overwrite or follow preexisting report paths', (t) => {
  const fixture = createInventoryFixture();
  const reportRoot = mkdtempSync(join(fixture.root, '..', 'aibuddy-report-safety-'));
  t.after(() => {
    fixture.cleanup();
    rmSync(reportRoot, { recursive: true, force: true });
  });

  const report = inventoryGitTree({ cwd: fixture.root, sourceRef: fixture.commit });
  const existingFileDir = join(reportRoot, 'existing-file');
  mkdirSync(existingFileDir);
  const existingFile = join(existingFileDir, 'inventory.json');
  writeFileSync(existingFile, 'sentinel\n');
  assert.throws(
    () => writeInventoryReport(existingFileDir, report, { sourceRoot: fixture.root }),
    /inventory report already exists/,
  );
  assert.equal(readFileSync(existingFile, 'utf8'), 'sentinel\n');

  const symlinkFileDir = join(reportRoot, 'symlink-file');
  mkdirSync(symlinkFileDir);
  symlinkSync(join(fixture.root, 'README.md'), join(symlinkFileDir, 'inventory.json'));
  assert.throws(
    () => writeInventoryReport(symlinkFileDir, report, { sourceRoot: fixture.root }),
    /inventory report must not be a symlink/,
  );

  const directoryFileDir = join(reportRoot, 'directory-file');
  mkdirSync(join(directoryFileDir, 'inventory.json'), { recursive: true });
  assert.throws(
    () => writeInventoryReport(directoryFileDir, report, { sourceRoot: fixture.root }),
    /inventory report must be a regular file path/,
  );

  const realDirectory = join(reportRoot, 'real-directory');
  const symlinkDirectory = join(reportRoot, 'symlink-directory');
  mkdirSync(realDirectory);
  symlinkSync(realDirectory, symlinkDirectory, 'dir');
  assert.throws(
    () => writeInventoryReport(symlinkDirectory, report, { sourceRoot: fixture.root }),
    /report directory path must not contain a symlink/,
  );
  assert.equal(existsSync(join(realDirectory, 'inventory.json')), false);
});
