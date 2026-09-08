import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const FIXTURE_DATE = '2026-01-01T00:00:00Z';

const RULES_V1 = {
  renames: {
    'src/goose-core.txt': 'src/heybuddy-core.txt',
    'docs/goose-note.txt': 'docs/heybuddy-note.txt',
  },
};

const RULES_V2 = {
  renames: {
    'src/goose-core.txt': 'src/heybuddy-core.txt',
    'docs/goose-note.txt': 'docs/heybuddy-reference.txt',
  },
};

const U0_SOURCE = {
  'src/goose-core.txt': file('Goose core v0\n'),
  'desktop/theme.txt': file('Goose desktop baseline\n'),
  'desktop/legacy-panel.txt': file('Goose legacy panel\n'),
  'docs/goose-note.txt': file('Goose note\n'),
};

const H0_SOURCE = without(
  {
    ...U0_SOURCE,
    'desktop/theme.txt': file(
      'Goose desktop baseline\nHeyBuddy desktop customization\n',
    ),
    'product-only.txt': file('HeyBuddy product-only behavior\n'),
  },
  'desktop/legacy-panel.txt',
);

const U1_SOURCE = {
  ...U0_SOURCE,
  'src/goose-core.txt': file('Goose core v1 upstream increment\n'),
  'src/upstream-feature.txt': file('Goose upstream feature v1\n'),
};

function file(content, mode = '100644') {
  return { content, mode };
}

function without(snapshot, ...paths) {
  const result = { ...snapshot };
  for (const filePath of paths) {
    delete result[filePath];
  }
  return result;
}

/**
 * This is intentionally a tiny fixture-only transform, not production
 * conversion logic. It only applies the explicit paths and literal used by
 * this Git ancestry prototype.
 */
function fixtureOnlyDeterministicRename(snapshot, rules) {
  const result = {};
  for (const [sourcePath, sourceFile] of Object.entries(snapshot)) {
    const targetPath = rules.renames[sourcePath] ?? sourcePath;
    assert.equal(result[targetPath], undefined, `duplicate fixture path: ${targetPath}`);
    result[targetPath] = {
      ...sourceFile,
      content: sourceFile.content.replaceAll('Goose', 'HeyBuddy'),
    };
  }
  return result;
}

async function createFixtureRepo({ ambientEnv = process.env } = {}) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'heybuddy-sync-fixture-'));
  const globalConfigPath = `${repo}.global.gitconfig`;
  const systemConfigPath = `${repo}.system.gitconfig`;
  const hooksPath = `${repo}.hooks`;
  await writeFile(globalConfigPath, '');
  await writeFile(systemConfigPath, '');
  await mkdir(hooksPath);

  const fixture = {
    globalConfigPath,
    hooksPath,
    repo,
    snapshotIndexCounter: 0,
    systemConfigPath,
    indexPath: `${repo}.index`,
    env: {
      ...Object.fromEntries(
        Object.entries(ambientEnv).filter(([name]) => !name.startsWith('GIT_')),
      ),
      GIT_CONFIG_GLOBAL: globalConfigPath,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: systemConfigPath,
      GIT_AUTHOR_DATE: FIXTURE_DATE,
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_NAME: 'Git Fixture',
      GIT_COMMITTER_DATE: FIXTURE_DATE,
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Git Fixture',
    },
  };

  git(fixture, ['init', '--quiet', '--initial-branch=fixture']);
  git(fixture, ['config', '--local', 'core.hooksPath', fixture.hooksPath]);
  return fixture;
}

async function removeFixtureRepo(fixture) {
  await rm(fixture.repo, { force: true, recursive: true });
  await rm(fixture.indexPath, { force: true });
  await rm(fixture.globalConfigPath, { force: true });
  await rm(fixture.systemConfigPath, { force: true });
  await rm(fixture.hooksPath, { force: true, recursive: true });
}

function git(
  fixture,
  args,
  { allowFailure = false, indexPath = fixture.indexPath, input, preserveOutput = false } = {},
) {
  const result = spawnSync('git', ['-C', fixture.repo, ...args], {
    encoding: 'utf8',
    env: { ...fixture.env, GIT_INDEX_FILE: indexPath },
    input,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      [
        `git ${args.join(' ')} exited with ${result.status}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return {
    status: result.status,
    stderr: result.stderr.trimEnd(),
    stdout: preserveOutput ? result.stdout : result.stdout.trimEnd(),
  };
}

function gitOutput(fixture, args, options) {
  return git(fixture, args, options).stdout;
}

function commitSnapshot(fixture, snapshot, { message, parents = [], ref } = {}) {
  const snapshotIndexPath = `${fixture.repo}.snapshot-${fixture.snapshotIndexCounter++}.index`;
  try {
    const indexOptions = { indexPath: snapshotIndexPath };
    git(fixture, ['read-tree', '--empty'], indexOptions);

    for (const [filePath, snapshotFile] of Object.entries(snapshot)) {
      const blob = gitOutput(fixture, ['hash-object', '-w', '--stdin'], {
        ...indexOptions,
        input: snapshotFile.content,
      });
      git(fixture, [
        'update-index',
        '--add',
        '--cacheinfo',
        `${snapshotFile.mode},${blob},${filePath}`,
      ], indexOptions);
    }

    const tree = gitOutput(fixture, ['write-tree'], indexOptions);
    const commit = gitOutput(fixture, [
      'commit-tree',
      tree,
      ...parents.flatMap((parent) => ['-p', parent]),
      '-m',
      message,
    ], indexOptions);

    if (ref) {
      git(fixture, ['update-ref', ref, commit]);
    }

    return commit;
  } finally {
    rmSync(snapshotIndexPath, { force: true });
  }
}

function commitParents(fixture, commit) {
  return gitOutput(fixture, ['rev-list', '--parents', '-n', '1', commit])
    .split(/\s+/)
    .slice(1);
}

function commitTree(fixture, commit) {
  return gitOutput(fixture, ['show', '-s', '--format=%T', commit]);
}

function commitFile(fixture, commit, filePath) {
  return git(fixture, ['show', `${commit}:${filePath}`], { preserveOutput: true }).stdout;
}

function commitPaths(fixture, commit) {
  const output = gitOutput(fixture, ['ls-tree', '-r', '--name-only', commit]);
  return output ? output.split('\n') : [];
}

async function buildBootstrapFixture(options) {
  const fixture = await createFixtureRepo(options);
  const u0 = commitSnapshot(fixture, U0_SOURCE, {
    message: 'fixture raw upstream U0',
    ref: 'refs/heads/raw-u0',
  });
  const h0 = commitSnapshot(fixture, H0_SOURCE, {
    message: 'fixture customized product H0',
    parents: [u0],
    ref: 'refs/heads/raw-product',
  });
  const u1 = commitSnapshot(fixture, U1_SOURCE, {
    message: 'fixture raw upstream U1',
    parents: [u0],
    ref: 'refs/heads/raw-u1',
  });
  const m0 = commitSnapshot(fixture, fixtureOnlyDeterministicRename(U0_SOURCE, RULES_V1), {
    message: 'fixture transformed mirror M0',
    ref: 'refs/heads/mirror-m0',
  });
  const p0 = commitSnapshot(fixture, fixtureOnlyDeterministicRename(H0_SOURCE, RULES_V1), {
    message: 'fixture transformed product P0',
    parents: [h0],
    ref: 'refs/heads/product-p0',
  });
  const bridge = commitSnapshot(fixture, fixtureOnlyDeterministicRename(H0_SOURCE, RULES_V1), {
    message: 'fixture reviewed bootstrap bridge',
    parents: [p0, m0],
    ref: 'refs/heads/product',
  });
  const m1 = commitSnapshot(fixture, fixtureOnlyDeterministicRename(U1_SOURCE, RULES_V1), {
    message: 'fixture transformed mirror M1',
    parents: [m0],
    ref: 'refs/heads/mirror',
  });

  return { bridge, fixture, h0, m0, m1, p0, u0, u1 };
}

async function buildNonoverlappingDesktopFixture() {
  const fixture = await createFixtureRepo();
  const u0Source = {
    ...U0_SOURCE,
    'desktop/theme.txt': file(
      'Goose desktop baseline\nGoose desktop stable option\nGoose desktop stable detail\nGoose desktop stable footer\nGoose desktop stable end\n',
    ),
  };
  const h0Source = {
    ...u0Source,
    'desktop/theme.txt': file(
      'Goose desktop baseline\nGoose desktop stable option\nGoose desktop stable detail\nGoose desktop stable footer\nHeyBuddy desktop customization\n',
    ),
  };
  const u1Source = {
    ...u0Source,
    'desktop/theme.txt': file(
      'Goose desktop baseline refreshed upstream\nGoose desktop stable option\nGoose desktop stable detail\nGoose desktop stable footer\nGoose desktop stable end\n',
    ),
  };
  const u0 = commitSnapshot(fixture, u0Source, { message: 'fixture same-file raw upstream U0' });
  const h0 = commitSnapshot(fixture, h0Source, {
    message: 'fixture same-file customized product H0',
    parents: [u0],
  });
  const m0 = commitSnapshot(fixture, fixtureOnlyDeterministicRename(u0Source, RULES_V1), {
    message: 'fixture same-file transformed mirror M0',
  });
  const p0 = commitSnapshot(fixture, fixtureOnlyDeterministicRename(h0Source, RULES_V1), {
    message: 'fixture same-file transformed product P0',
    parents: [h0],
  });
  const bridge = commitSnapshot(fixture, fixtureOnlyDeterministicRename(h0Source, RULES_V1), {
    message: 'fixture same-file reviewed bootstrap bridge',
    parents: [p0, m0],
  });
  const m1 = commitSnapshot(fixture, fixtureOnlyDeterministicRename(u1Source, RULES_V1), {
    message: 'fixture same-file transformed mirror M1',
    parents: [m0],
  });

  return { bridge, fixture, m0, m1 };
}

test('keeps transformed mirror snapshots as an independent M0 to M1 linear graph', async () => {
  const state = await buildBootstrapFixture();
  try {
    assert.deepEqual(commitParents(state.fixture, state.m0), []);
    assert.deepEqual(commitParents(state.fixture, state.m1), [state.m0]);
    assert.equal(commitFile(state.fixture, state.m0, 'src/heybuddy-core.txt'), 'HeyBuddy core v0\n');
    assert.equal(commitFile(state.fixture, state.m1, 'desktop/theme.txt'), 'HeyBuddy desktop baseline\n');
    assert.equal(commitFile(state.fixture, state.m1, 'docs/heybuddy-note.txt'), 'HeyBuddy note\n');
    assert.deepEqual(commitPaths(state.fixture, state.m1), [
      'desktop/legacy-panel.txt',
      'desktop/theme.txt',
      'docs/heybuddy-note.txt',
      'src/heybuddy-core.txt',
      'src/upstream-feature.txt',
    ]);
    assert.equal(commitPaths(state.fixture, state.m1).includes('product-only.txt'), false);
    assert.equal(
      git(state.fixture, ['merge-base', '--is-ancestor', state.u0, state.m0], {
        allowFailure: true,
      }).status,
      1,
    );
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('creates a P0/M0 bridge without changing the product tree and selects M0 as merge-base', async () => {
  const state = await buildBootstrapFixture();
  try {
    assert.deepEqual(commitParents(state.fixture, state.p0), [state.h0]);
    assert.deepEqual(commitParents(state.fixture, state.bridge), [state.p0, state.m0]);
    assert.equal(commitTree(state.fixture, state.bridge), commitTree(state.fixture, state.p0));
    assert.equal(
      commitFile(state.fixture, state.bridge, 'desktop/theme.txt'),
      'HeyBuddy desktop baseline\nHeyBuddy desktop customization\n',
    );
    assert.equal(
      commitFile(state.fixture, state.bridge, 'product-only.txt'),
      'HeyBuddy product-only behavior\n',
    );
    assert.equal(gitOutput(state.fixture, ['merge-base', state.bridge, state.m1]), state.m0);
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('preserves an ordinary product feature commit when M1 is merged afterward', async () => {
  const state = await buildBootstrapFixture();
  try {
    const productFeature = commitSnapshot(
      state.fixture,
      {
        ...fixtureOnlyDeterministicRename(H0_SOURCE, RULES_V1),
        'product-feature.txt': file('HeyBuddy product feature\n'),
      },
      {
        message: 'fixture ordinary product feature after bootstrap',
        parents: [state.bridge],
        ref: 'refs/heads/product-feature',
      },
    );

    git(state.fixture, ['checkout', '--detach', '--force', productFeature]);
    git(state.fixture, ['merge', '--no-ff', '--no-edit', state.m1]);
    const integrated = gitOutput(state.fixture, ['rev-parse', 'HEAD']);

    assert.deepEqual(commitParents(state.fixture, integrated), [productFeature, state.m1]);
    assert.equal(
      commitFile(state.fixture, integrated, 'product-feature.txt'),
      'HeyBuddy product feature\n',
    );
    assert.equal(
      commitFile(state.fixture, integrated, 'src/heybuddy-core.txt'),
      'HeyBuddy core v1 upstream increment\n',
    );
    assert.equal(
      commitFile(state.fixture, integrated, 'desktop/theme.txt'),
      'HeyBuddy desktop baseline\nHeyBuddy desktop customization\n',
    );
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('merges a same-file nonoverlapping desktop update without losing customization', async () => {
  const state = await buildNonoverlappingDesktopFixture();
  try {
    git(state.fixture, ['checkout', '--detach', '--force', state.bridge]);
    git(state.fixture, ['merge', '--no-ff', '--no-edit', state.m1]);
    const integrated = gitOutput(state.fixture, ['rev-parse', 'HEAD']);

    assert.deepEqual(commitParents(state.fixture, integrated), [state.bridge, state.m1]);
    assert.equal(
      commitFile(state.fixture, integrated, 'desktop/theme.txt'),
      'HeyBuddy desktop baseline refreshed upstream\nHeyBuddy desktop stable option\nHeyBuddy desktop stable detail\nHeyBuddy desktop stable footer\nHeyBuddy desktop customization\n',
    );
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('merges a nonconflicting upstream increment while preserving desktop customization', async () => {
  const state = await buildBootstrapFixture();
  try {
    git(state.fixture, ['checkout', '--detach', '--force', state.bridge]);
    git(state.fixture, ['merge', '--no-ff', '--no-edit', state.m1]);
    const integrated = gitOutput(state.fixture, ['rev-parse', 'HEAD']);

    assert.deepEqual(commitParents(state.fixture, integrated), [state.bridge, state.m1]);
    assert.equal(
      commitFile(state.fixture, integrated, 'src/heybuddy-core.txt'),
      'HeyBuddy core v1 upstream increment\n',
    );
    assert.equal(
      commitFile(state.fixture, integrated, 'src/upstream-feature.txt'),
      'HeyBuddy upstream feature v1\n',
    );
    assert.equal(
      commitFile(state.fixture, integrated, 'desktop/theme.txt'),
      'HeyBuddy desktop baseline\nHeyBuddy desktop customization\n',
    );
    assert.equal(commitPaths(state.fixture, integrated).includes('desktop/legacy-panel.txt'), false);
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('stops on an overlapping semantic desktop conflict without choosing a side', async () => {
  const state = await buildBootstrapFixture();
  try {
    const productSemanticChange = commitSnapshot(
      state.fixture,
      {
        ...fixtureOnlyDeterministicRename(H0_SOURCE, RULES_V1),
        'desktop/theme.txt': file('HeyBuddy desktop product behavior\n'),
      },
      {
        message: 'fixture product semantic desktop change',
        parents: [state.bridge],
        ref: 'refs/heads/product-semantic-change',
      },
    );
    const semanticUpstream = {
      ...U0_SOURCE,
      'desktop/theme.txt': file('Goose desktop upstream behavior\n'),
    };
    const semanticMirror = commitSnapshot(
      state.fixture,
      fixtureOnlyDeterministicRename(semanticUpstream, RULES_V1),
      {
        message: 'fixture transformed mirror semantic desktop conflict',
        parents: [state.m0],
        ref: 'refs/heads/mirror-semantic-conflict',
      },
    );

    git(state.fixture, ['checkout', '--detach', '--force', productSemanticChange]);
    const merge = git(
      state.fixture,
      ['merge', '--no-commit', '--no-ff', semanticMirror],
      { allowFailure: true },
    );
    const status = gitOutput(state.fixture, ['status', '--short']);

    assert.notEqual(merge.status, 0);
    assert.match(`${merge.stdout}\n${merge.stderr}`, /CONFLICT \(content\)/);
    assert.equal(gitOutput(state.fixture, ['rev-parse', 'HEAD']), productSemanticChange);
    assert.deepEqual(
      gitOutput(state.fixture, ['diff', '--name-only', '--diff-filter=U']).split('\n'),
      ['desktop/theme.txt'],
    );
    assert.match(status, /^UU desktop\/theme\.txt$/m);
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('stops on an intentional product deletion versus upstream modification conflict', async () => {
  const state = await buildBootstrapFixture();
  try {
    const conflictingU1 = {
      ...U0_SOURCE,
      'desktop/legacy-panel.txt': file('Goose legacy panel updated upstream\n'),
    };
    const conflictMirror = commitSnapshot(
      state.fixture,
      fixtureOnlyDeterministicRename(conflictingU1, RULES_V1),
      {
        message: 'fixture transformed mirror deletion conflict',
        parents: [state.m0],
        ref: 'refs/heads/mirror-conflict',
      },
    );

    git(state.fixture, ['checkout', '--detach', '--force', state.bridge]);
    const merge = git(
      state.fixture,
      ['merge', '--no-commit', '--no-ff', conflictMirror],
      { allowFailure: true },
    );
    const status = gitOutput(state.fixture, ['status', '--short']);

    assert.notEqual(merge.status, 0);
    assert.match(`${merge.stdout}\n${merge.stderr}`, /CONFLICT \(modify\/delete\)/);
    assert.equal(gitOutput(state.fixture, ['rev-parse', 'HEAD']), state.bridge);
    assert.deepEqual(
      gitOutput(state.fixture, ['diff', '--name-only', '--diff-filter=U']).split('\n'),
      ['desktop/legacy-panel.txt'],
    );
    assert.match(status, /^DU desktop\/legacy-panel\.txt$/m);
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('integrates a rule migration before merging the next upstream snapshot', async () => {
  const state = await buildBootstrapFixture();
  try {
    const ruleMigration = commitSnapshot(
      state.fixture,
      fixtureOnlyDeterministicRename(U0_SOURCE, RULES_V2),
      {
        message: 'fixture transformed rule migration mirror',
        parents: [state.m0],
        ref: 'refs/heads/rule-migration-integrated',
      },
    );

    git(state.fixture, ['checkout', '--detach', '--force', state.bridge]);
    git(state.fixture, ['merge', '--no-ff', '--no-edit', ruleMigration]);
    const ruleIntegrated = gitOutput(state.fixture, ['rev-parse', 'HEAD']);

    assert.deepEqual(commitParents(state.fixture, ruleIntegrated), [state.bridge, ruleMigration]);
    assert.equal(commitPaths(state.fixture, ruleIntegrated).includes('docs/heybuddy-note.txt'), false);
    assert.equal(
      commitFile(state.fixture, ruleIntegrated, 'docs/heybuddy-reference.txt'),
      'HeyBuddy note\n',
    );
    assert.equal(
      commitFile(state.fixture, ruleIntegrated, 'desktop/theme.txt'),
      'HeyBuddy desktop baseline\nHeyBuddy desktop customization\n',
    );

    const nextUpstream = commitSnapshot(
      state.fixture,
      fixtureOnlyDeterministicRename(U1_SOURCE, RULES_V2),
      {
        message: 'fixture transformed next upstream after rule migration',
        parents: [ruleMigration],
        ref: 'refs/heads/mirror-after-rule-migration',
      },
    );

    git(state.fixture, ['merge', '--no-ff', '--no-edit', nextUpstream]);
    const integratedNext = gitOutput(state.fixture, ['rev-parse', 'HEAD']);

    assert.deepEqual(commitParents(state.fixture, integratedNext), [ruleIntegrated, nextUpstream]);
    assert.equal(commitPaths(state.fixture, integratedNext).includes('docs/heybuddy-note.txt'), false);
    assert.equal(
      commitFile(state.fixture, integratedNext, 'docs/heybuddy-reference.txt'),
      'HeyBuddy note\n',
    );
    assert.equal(
      commitFile(state.fixture, integratedNext, 'src/heybuddy-core.txt'),
      'HeyBuddy core v1 upstream increment\n',
    );
    assert.equal(
      commitFile(state.fixture, integratedNext, 'src/upstream-feature.txt'),
      'HeyBuddy upstream feature v1\n',
    );
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('keeps a rule migration as a separate mirror candidate from an upstream increment', async () => {
  const state = await buildBootstrapFixture();
  try {
    const ruleMigration = commitSnapshot(
      state.fixture,
      fixtureOnlyDeterministicRename(U0_SOURCE, RULES_V2),
      {
        message: 'fixture rule migration only',
        parents: [state.m0],
        ref: 'refs/heads/rule-migration',
      },
    );

    assert.deepEqual(commitParents(state.fixture, ruleMigration), [state.m0]);
    assert.deepEqual(commitParents(state.fixture, state.m1), [state.m0]);
    assert.equal(
      commitFile(state.fixture, ruleMigration, 'docs/heybuddy-reference.txt'),
      'HeyBuddy note\n',
    );
    assert.equal(commitPaths(state.fixture, ruleMigration).includes('src/upstream-feature.txt'), false);
    assert.equal(commitPaths(state.fixture, state.m1).includes('docs/heybuddy-reference.txt'), false);
    assert.equal(
      commitFile(state.fixture, ruleMigration, 'src/heybuddy-core.txt'),
      commitFile(state.fixture, state.m0, 'src/heybuddy-core.txt'),
    );
    assert.notEqual(ruleMigration, state.m1);
  } finally {
    await removeFixtureRepo(state.fixture);
  }
});

test('isolates fixture Git commands from ambient config, environment, and hooks', async () => {
  const ambientRoot = await mkdtemp(path.join(os.tmpdir(), 'heybuddy-sync-ambient-'));
  const ambientTemplateHooks = path.join(ambientRoot, 'template', 'hooks');
  const ambientConfig = path.join(ambientRoot, 'global.gitconfig');
  await mkdir(ambientTemplateHooks, { recursive: true });
  await writeFile(
    path.join(ambientTemplateHooks, 'pre-merge-commit'),
    '#!/bin/sh\nprintf unsafe > "$GIT_DIR/ambient-hook-ran"\n',
  );
  await chmod(path.join(ambientTemplateHooks, 'pre-merge-commit'), 0o755);
  await writeFile(
    ambientConfig,
    [
      '[user]',
      'name = Ambient Git User',
      'email = ambient@example.invalid',
      '[core]',
      `hooksPath = ${ambientTemplateHooks}`,
      '',
    ].join('\n'),
  );

  let fixture;
  try {
    fixture = await createFixtureRepo({
      ambientEnv: {
        ...process.env,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_GLOBAL: ambientConfig,
        GIT_CONFIG_KEY_0: 'core.hooksPath',
        GIT_CONFIG_SYSTEM: ambientConfig,
        GIT_CONFIG_VALUE_0: ambientTemplateHooks,
        GIT_DIR: path.join(ambientRoot, 'not-a-repo'),
        GIT_INDEX_FILE: path.join(ambientRoot, 'wrong.index'),
        GIT_TEMPLATE_DIR: path.join(ambientRoot, 'template'),
      },
    });
    const base = commitSnapshot(
      fixture,
      { 'base.txt': file('base\n') },
      { message: 'fixture ambient isolation base', ref: 'refs/heads/base' },
    );
    const product = commitSnapshot(
      fixture,
      {
        'base.txt': file('base\n'),
        'product.txt': file('product\n'),
      },
      { message: 'fixture ambient isolation product', parents: [base] },
    );
    const upstream = commitSnapshot(
      fixture,
      {
        'base.txt': file('base\n'),
        'upstream.txt': file('upstream\n'),
      },
      { message: 'fixture ambient isolation upstream', parents: [base] },
    );

    git(fixture, ['checkout', '--detach', '--force', product]);
    git(fixture, ['merge', '--no-ff', '--no-edit', upstream]);

    assert.equal(gitOutput(fixture, ['config', '--get', 'core.hooksPath']), fixture.hooksPath);
    assert.equal(gitOutput(fixture, ['log', '-1', '--format=%an']), 'Git Fixture');
    await assert.rejects(stat(path.join(fixture.repo, '.git', 'ambient-hook-ran')), {
      code: 'ENOENT',
    });
  } finally {
    if (fixture) {
      await removeFixtureRepo(fixture);
    }
    await rm(ambientRoot, { force: true, recursive: true });
  }
});
