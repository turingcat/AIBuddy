const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const workflow = JSON.parse(execFileSync('ruby', [
  '-rjson', '-ryaml', '-e',
  'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))',
  path.join(root, '.github/workflows/bundle-windows.yml'),
], { encoding: 'utf8' }));
// Ruby's YAML 1.1 parser interprets the unquoted Actions key `on` as true.
const triggers = workflow.on || workflow.true;
const jobs = workflow.jobs;
const packaging = jobs['package-desktop-windows'];
const { resolveWindowsPackage } = require('../../ui/desktop/scripts/windows-package');

for (const [architecture, enabled] of [['x32', '0'], ['x64', '1']]) {
  test(`${architecture} installer compares command-line macros as strings`, () => {
    const pkg = resolveWindowsPackage(architecture, '1.0.6', 'dist', 'out');
    assert.ok(pkg.isccArgs.includes(`/DMyInstallIn64BitMode=${enabled}`));
    const installer = fs.readFileSync(path.join(root, 'ui/desktop/desktop-setup.iss'), 'utf8');
    assert.match(installer, /^#if MyInstallIn64BitMode == "1"\r?$/m);
  });
}

test('both entry points default to a normal full build', () => {
  for (const event of ['workflow_dispatch', 'workflow_call']) {
    assert.deepEqual(triggers[event].inputs.reuse_run_id, {
      description: 'Reuse unsigned distributions from this run ID; version must match the source build',
      required: false,
      type: 'string',
      default: '',
    });
  }
});

test('reuse skips both expensive build jobs', () => {
  for (const job of ['build-aibuddy-windows', 'build-desktop-windows']) {
    assert.equal(jobs[job].if, "${{ inputs.reuse_run_id == '' }}");
  }
});

test('packaging accepts skipped builds only when a source run was supplied', () => {
  assert.equal(packaging.needs, 'build-desktop-windows');
  assert.equal(packaging.if,
    "${{ !cancelled() && (inputs.reuse_run_id != '' || needs.build-desktop-windows.result == 'success') }}");
});

test('downloads are authenticated, same-repository and default to the current run', () => {
  assert.deepEqual(packaging.permissions, { contents: 'read', actions: 'read' });
  const download = packaging.steps.find(step => step.name === 'Download unsigned distribution');
  assert.equal(download.with['run-id'], '${{ inputs.reuse_run_id || github.run_id }}');
  assert.equal(download.with['github-token'], '${{ github.token }}');
  assert.equal(download.with.repository, undefined);
  assert.equal(download.with.name, 'internal-windows-unsigned-${{ matrix.artifact_arch }}');
});

test('both architectures still publish installer and portable artifacts', () => {
  assert.deepEqual(packaging.strategy.matrix.include.map(row => row.artifact_arch), ['x32', 'x64']);
  const upload = packaging.steps.find(step => step.name === 'Upload Windows build');
  assert.deepEqual(upload.with.path.trim().split(/\r?\n/), [
    '${{ steps.package-windows-zip.outputs.portable_file_name }}',
    '${{ steps.package-windows-installer.outputs.setup_file_name }}',
  ]);
  assert.equal(upload.with['if-no-files-found'], 'error');
});

for (const file of ['release.yml', 'release-branches.yml', 'canary.yml']) {
  test(`${file} grants the reusable workflow artifact read permission`, () => {
    const caller = JSON.parse(execFileSync('ruby', [
      '-rjson', '-ryaml', '-e',
      'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))',
      path.join(root, '.github/workflows', file),
    ], { encoding: 'utf8' }));
    assert.equal(caller.jobs['bundle-windows'].permissions.actions, 'read');
  });
}
