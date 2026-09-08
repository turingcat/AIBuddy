import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { applyEdits } from '../src/adapters/shared.mjs';
import { supportsText, transformText } from '../src/adapters/text.mjs';

const policy = JSON.parse(
  readFileSync(new URL('../production-policy.json', import.meta.url), 'utf8'),
);
const BASELINE_COMMIT = 'e8da4298445d851dc7f07cdc10eda636246c5f01';

function readBaselineFile(path) {
  return execFileSync('git', ['show', `${BASELINE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function output(result, source) {
  return applyEdits(source, result.edits);
}

test('supports only reviewed documentation, literal, script, structured, or preserved paths', () => {
  assert.equal(supportsText('README.md'), true);
  assert.equal(supportsText('documentation/docs/guides/quickstart.md'), true);
  assert.equal(supportsText('scripts/pre-release.sh'), true);
  assert.equal(supportsText('ui/desktop/src/bin/jbang'), true);
  assert.equal(supportsText('Dockerfile'), true);
  assert.equal(supportsText('crates/goose/src/agents/snapshots/goose__agents__prompt_manager__tests__basic.snap'), true);
  assert.equal(supportsText('crates/goose/tests/mcp_replays/github-mcp-serverstdio'), true);
  assert.equal(supportsText('scripts/unreviewed.sh'), false);
  assert.equal(supportsText('vendor/third-party.md'), false);
});

test('supports the five reviewed U0 text paths without widening text scopes', () => {
  const paths = [
    'crates/goose/src/agents/snapshots/goose__agents__prompt_manager__tests__all_platform_extensions.snap',
    'crates/goose/src/prompts/system.md',
    'documentation/.goosehints',
    'ui/desktop/index.html',
    'ui/desktop/src/images/icon.svg',
  ];
  for (const path of paths) assert.equal(supportsText(path), true, path);
  assert.equal(supportsText('ui/desktop/brand-legacy/heybuddy/images/icon.svg'), true);
  assert.equal(supportsText('ui/desktop/src/images/other.svg'), false);
  assert.equal(supportsText('documentation/other.goosehints'), false);
});

test('supports the desktop production environment file', () => {
  const path = 'ui/desktop/.env.production';
  const source = 'HEYBUDDY_AUTH_API_BASE_URL=https://ai.linyeyun.cn\n';
  const result = transformText({ path, text: source, policy });

  assert.equal(supportsText(path), true);
  assert.equal(result.unresolved, undefined);
  assert.equal(
    output(result, source),
    'AIBUDDY_AUTH_API_BASE_URL=https://ai.linyeyun.cn\n',
  );
});

test('transforms the five reviewed U0 snippets in their native text formats', () => {
  const cases = [
    {
      path: 'crates/goose/src/agents/snapshots/goose__agents__prompt_manager__tests__all_platform_extensions.snap',
      source: [
        '---',
        'source: crates/goose/src/agents/prompt_manager.rs',
        'expression: system_prompt',
        '---',
        'You are a general-purpose AI agent called goose.',
        '',
      ].join('\n'),
      expected: [
        '---',
        'source: crates/goose/src/agents/prompt_manager.rs',
        'expression: system_prompt',
        '---',
        'You are a general-purpose AI agent called aibuddy.',
        '',
      ].join('\n'),
    },
    {
      path: 'crates/goose/src/prompts/system.md',
      source: 'You are a general-purpose AI agent called goose, created by AAIF.\n',
      expected: 'You are a general-purpose AI agent called aibuddy, created by AAIF.\n',
    },
    {
      path: 'documentation/.goosehints',
      source: '# Documentation Style Guide\nProduct name "goose"; use Goose only when quoting.\n',
      expected: '# Documentation Style Guide\nProduct name "aibuddy"; use AIBuddy only when quoting.\n',
    },
    {
      path: 'ui/desktop/index.html',
      source: '<!doctype html><html><head><title>Goose</title></head></html>\n',
      expected: '<!doctype html><html><head><title>AIBuddy</title></head></html>\n',
    },
    {
      path: 'ui/desktop/src/images/icon.svg',
      source: [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        '<svg viewBox="0 0 2048 2048">',
        '  <!-- Goose icon in black - adjust transform to resize/move -->',
        '  <path d="M455.145 485.687" fill="black"/>',
        '</svg>',
        '',
      ].join('\n'),
      expected: [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        '<svg viewBox="0 0 2048 2048">',
        '  <!-- AIBuddy icon in black - adjust transform to resize/move -->',
        '  <path d="M455.145 485.687" fill="black"/>',
        '</svg>',
        '',
      ].join('\n'),
    },
  ];

  for (const { path, source, expected } of cases) {
    const result = transformText({ path, text: source, policy });
    assert.equal(result.unresolved, undefined, path);
    assert.equal(output(result, source), expected, path);
  }
});

test('applies scoped literal substitutions without reserializing surrounding text', () => {
  const source = [
    'Goose and Geese are product names; GOOSE_PATH_ROOT remains a first-party env segment.',
    'URL: https://github.com/aaif-goose/goose, and slug aaif-goose/goose stay exact.',
    'External identity: goose-ai-agent stays exact.',
    'Copyright 2026 Goose contributors',
    'SPDX-License-Identifier: MIT; Goose',
    'const message = "Goose\\nGeese"; // keep this quote and escape exact',
    '',
  ].join('\n');
  const result = transformText({ path: 'README.md', text: source, policy });

  assert.equal(result.adapter, 'text');
  assert.equal(result.unresolved, undefined);
  assert.equal(output(result, source), [
    'AIBuddy and AIBuddies are product names; AIBUDDY_PATH_ROOT remains a first-party env segment.',
    'URL: https://github.com/aaif-goose/goose, and slug aaif-goose/goose stay exact.',
    'External identity: goose-ai-agent stays exact.',
    'Copyright 2026 Goose contributors',
    'SPDX-License-Identifier: MIT; Goose',
    'const message = "AIBuddy\\nAIBuddies"; // keep this quote and escape exact',
    '',
  ].join('\n'));
  assert.ok(result.edits.length >= 3);
  for (const edit of result.edits) {
    assert.equal(edit.path, 'README.md');
    assert.equal(source.slice(edit.start, edit.end), edit.original);
    assert.equal(typeof edit.replacement, 'string');
    assert.equal(edit.start < edit.end, true);
  }
  assert.ok(result.preserved.some((item) => item.reason.includes('URL')));
  assert.ok(result.preserved.some((item) => item.reason.includes('legal')));
  for (const preserved of result.preserved) {
    assert.equal(preserved.path, 'README.md');
    assert.equal(source.slice(preserved.start, preserved.end), preserved.value);
    assert.equal(preserved.start < preserved.end, true);
    assert.equal(typeof preserved.reason, 'string');
  }
  assert.ok(result.preserved.some((item) => item.value === 'https://github.com/aaif-goose/goose'));
  assert.ok(result.preserved.some((item) => item.value === 'aaif-goose/goose'));
  assert.ok(result.preserved.some((item) => item.value === 'goose-ai-agent'));
  assert.ok(result.preserved.some((item) => item.value === 'Copyright 2026 Goose contributors'));
  assert.ok(result.preserved.some((item) => item.value === 'SPDX-License-Identifier: MIT; Goose'));
});

test('rewrites the owned repository URL while preserving historical research URLs', () => {
  const installer = '# curl -fsSL https://github.com/turingcat/HeyBuddy/releases/download/stable/download_cli.sh | bash\n';
  const installerResult = transformText({ path: 'download_cli.sh', text: installer, policy });
  assert.equal(
    output(installerResult, installer),
    '# curl -fsSL https://github.com/turingcat/AIBuddy/releases/download/stable/download_cli.sh | bash\n',
  );

  const research = '[run](https://github.com/turingcat/HeyBuddy/actions/runs/32649684112)\n';
  const researchResult = transformText({
    path: 'docs/research/2026-09-02-github-actions-build-time.md',
    text: research,
    policy,
  });
  assert.equal(output(researchResult, research), research);
});

test('uses the shared segment renamer for singular, plural, and compound names in scripts', () => {
  const source = [
    '#!/bin/sh',
    'echo Goose Geese goose-cli GOOSE_PATH_ROOT',
    'printf "%s" "$GOOSE_CONFIG_DIR"',
    '',
  ].join('\n');
  const result = transformText({ path: 'scripts/pre-release.sh', text: source, policy });

  assert.equal(output(result, source), [
    '#!/bin/sh',
    'echo AIBuddy AIBuddies aibuddy-cli AIBUDDY_PATH_ROOT',
    'printf "%s" "$AIBUDDY_CONFIG_DIR"',
    '',
  ].join('\n'));
  assert.equal(result.edits.every((edit) => edit.path === 'scripts/pre-release.sh'), true);
});

test('transforms a pinned Markdown-like raw excerpt as scoped documentation', () => {
  const path = 'documentation/static/files/thoughts/plans/2025-12-23-remove-tool-selection-strategy.raw';
  const fixture = readBaselineFile(path);
  const source = fixture.slice(0, fixture.indexOf('GOOSE') + 'GOOSE'.length);
  const result = transformText({ path, text: source, policy });

  assert.equal(result.unresolved, undefined);
  assert.match(output(result, source), /AIBUDDY/u);
  assert.ok(result.edits.some((edit) => edit.original === 'GOOSE'));
});

test('transforms a pinned Insta snapshot excerpt without reserializing its YAML frontmatter', () => {
  const path = 'crates/goose/src/agents/snapshots/goose__agents__prompt_manager__tests__basic.snap';
  const fixture = readBaselineFile(path);
  const frontmatterEnd = fixture.indexOf('\n---\n', 4) + '\n---\n'.length;
  const brandOffset = fixture.indexOf('goose', frontmatterEnd);
  const bodyLineStart = fixture.lastIndexOf('\n', brandOffset) + 1;
  const bodyLineEnd = fixture.indexOf('\n', brandOffset) + 1;
  const source = fixture.slice(0, frontmatterEnd) + fixture.slice(bodyLineStart, bodyLineEnd);
  const result = transformText({ path, text: source, policy });

  assert.equal(result.unresolved, undefined);
  const expected = source.slice(0, frontmatterEnd) + source.slice(frontmatterEnd).replace('goose', 'aibuddy');
  assert.equal(output(result, source), expected);
  assert.equal(source.slice(0, frontmatterEnd), output(result, source).slice(0, frontmatterEnd));
  assert.ok(result.edits.some((edit) => edit.original === 'goose'));
  for (const edit of result.edits) {
    assert.equal(edit.path, path);
    assert.equal(source.slice(edit.start, edit.end), edit.original);
  }
});

test('transforms a pinned YAML-frontmatter raw excerpt and preserves its metadata framing', () => {
  const path = 'documentation/static/files/thoughts/research/2025-12-22-llm-tool-selection-strategy.raw';
  const fixture = readBaselineFile(path);
  const frontmatterEnd = fixture.indexOf('\n---\n', 4) + '\n---\n'.length;
  const brandOffset = fixture.indexOf('goose', frontmatterEnd);
  const bodyLineStart = fixture.lastIndexOf('\n', brandOffset) + 1;
  const bodyLineEnd = fixture.indexOf('\n', brandOffset) + 1;
  const source = fixture.slice(0, frontmatterEnd) + fixture.slice(bodyLineStart, bodyLineEnd);
  const result = transformText({ path, text: source, policy });

  assert.equal(result.unresolved, undefined);
  assert.equal(source.slice(0, frontmatterEnd), output(result, source).slice(0, frontmatterEnd));
  assert.notEqual(output(result, source), source);
  assert.ok(result.preserved.some((item) => item.reason.includes('frontmatter')));
  assert.ok(result.edits.length > 0);
});

test('preserves only actual legal lines instead of arbitrary license text', () => {
  const source = [
    'Run the MIT license command for the Goose integration.',
    'MIT license command Goose',
    'Copyright-like Goose',
    'SPDX-License-Identifier: MIT; Goose contributors',
    'Copyright 2026 Goose contributors',
    'Licensed under the Apache License, Version 2.0; Goose contributors',
    'All rights reserved; Goose contributors',
  ].join('\n');
  const result = transformText({ path: 'README.md', text: source, policy });

  assert.equal(output(result, source), [
    'Run the MIT license command for the AIBuddy integration.',
    'MIT license command AIBuddy',
    'Copyright-like AIBuddy',
    'SPDX-License-Identifier: MIT; Goose contributors',
    'Copyright 2026 Goose contributors',
    'Licensed under the Apache License, Version 2.0; Goose contributors',
    'All rights reserved; Goose contributors',
  ].join('\n'));
  assert.equal(result.preserved.filter((item) => item.reason.includes('legal')).length, 4);
});

test('fails closed for invalid YAML-frontmatter raw files and leaves bytes unchanged', () => {
  const path = 'documentation/static/files/thoughts/research/2025-12-22-llm-tool-selection-strategy.raw';
  const source = '---\nrepository: [\nbody Goose\n';
  const result = transformText({ path, text: source, policy });

  assert.deepEqual(result.edits, []);
  assert.deepEqual(result.preserved, []);
  assert.equal(result.unresolved.length, 1);
  assert.match(result.unresolved[0].reason, /YAML|frontmatter/i);
});

test('records explicit preservation for external vendored launchers and replay data', () => {
  const path = 'crates/goose-sdk/maven/gradlew';
  const source = '#!/usr/bin/env bash\necho goose-sdk\n';
  const result = transformText({ path, text: source, policy });

  assert.deepEqual(result.edits, []);
  assert.equal(result.unresolved, undefined);
  assert.equal(result.preserved.length, 1);
  assert.equal(result.preserved[0].path, path);
  assert.equal(result.preserved[0].disposition, 'preserved-external');
});

test('preserves external ws and wss URLs while renaming adjacent reviewed text', () => {
  const source = [
    'ws://localhost/goose/acp',
    'wss://example.com/goose/acp',
    'Goose documentation',
    '',
  ].join('\n');
  const result = transformText({ path: 'README.md', text: source, policy });

  assert.equal(result.unresolved, undefined);
  assert.equal(
    output(result, source),
    [
      'ws://localhost/goose/acp',
      'wss://example.com/goose/acp',
      'AIBuddy documentation',
      '',
    ].join('\n'),
  );
  assert.equal(result.preserved.filter((item) => item.value.includes('://')).length, 2);
});

test('fails closed for an unsupported path instead of applying extension fallback', () => {
  const path = 'scripts/unreviewed.sh';
  const source = 'echo Goose\n';
  const result = transformText({ path, text: source, policy });

  assert.deepEqual(result.edits, []);
  assert.deepEqual(result.preserved, []);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].kind, 'unsupported-path');
  assert.equal(output(result, source), source);
});

test('supports newly synchronized release helper scripts with scoped literal conversion', () => {
  for (const path of [
    '.github/scripts/test_upload_windows_installers_to_cos.py',
    '.github/scripts/upload-windows-installers-to-cos.sh',
    'scripts/test-release-workflows.rb',
  ]) {
    assert.equal(supportsText(path), true, path);
    const source = 'HeyBuddy heybuddy GOOSE_RELEASE\n';
    const result = transformText({ path, text: source, policy });
    assert.equal(result.unresolved, undefined, path);
    assert.equal(output(result, source), 'AIBuddy aibuddy AIBUDDY_RELEASE\n', path);
  }
});

test('transforms product names inside percent-encoded deep-link arguments', () => {
  const path = 'documentation/docs/mcp/heybuddy-docs-mcp.md';
  const source = '[Launch](goose://extension?arg=https%3A%2F%2Fexample%2Fheybuddy%2F&id=heybuddy-docs)\n';
  const result = transformText({ path, text: source, policy });
  assert.equal(result.unresolved, undefined);
  assert.equal(
    output(result, source),
    '[Launch](goose://extension?arg=https%3A%2F%2Fexample%2Faibuddy%2F&id=aibuddy-docs)\n',
  );
});
