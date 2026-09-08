# Transformed Upstream Mirror

The transformed upstream mirror is an append-only Git history used as the
three-way merge baseline for the renamed product. It is not a product branch,
does not receive product edits, and never replaces the product tree.

The implementation is exported from
`tools/rebrand/src/mirror.mjs`. It does not run `git init`, change the working
tree, push, or merge into `main`. A caller that performs the real bootstrap owns
the surrounding review, commit, and publication steps.

## Prepare M0

Generate an untouched upstream snapshot first:

```sh
node tools/rebrand/cli.mjs generate \
  --source-ref <upstream-commit> \
  --output <new-snapshot-directory> \
  --input upstream
```

Then call:

```js
import { prepareMirror } from './tools/rebrand/src/mirror.mjs';

const result = await prepareMirror({
  cwd: repository,
  snapshotDir,
  branch: 'upstream/aibuddy-mirror',
  dryRun: true,
});
```

`prepareMirror` performs these checks and operations:

- runs `verifySnapshot` and requires `provenance.report.input` to be
  `upstream` with no unresolved entries;
- verifies that the recorded source commit exists and that its exact tree is
  the recorded source tree;
- computes dry-run blob IDs in-process from the Git blob header and content, so
  dry-run does not fork Git once per snapshot entry;
- writes non-dry-run blobs through temporary files outside the source worktree
  and `.git`, passing literal paths to `git hash-object -w`; an isolated
  temporary Git index is still used for the tree, never the repository index;
- omits only `.aibuddy-rebrand.json` from the mirror tree and rejects tracked
  `.git` paths;
- records source commit/tree, transformed tree, output digest, and transform
  identity in commit trailers; and
- refuses an existing mirror branch. A non-dry run creates it with
  `update-ref` using an all-zero expected old object ID.

The root mirror commit has no raw upstream parent. `dryRun: true` leaves the
branch and Git object database unchanged. It computes blob and tree IDs without
writing objects or invoking a per-entry Git hash process and returns
`mirrorCommit: null` plus the planned tree ID.

## Append M1

Use `appendMirror` for every later upstream snapshot:

```js
import { appendMirror } from './tools/rebrand/src/mirror.mjs';

const result = await appendMirror({
  cwd: repository,
  snapshotDir: nextSnapshotDir,
  branch: 'upstream/aibuddy-mirror',
  parentMirror: previousMirrorCommit,
  expectedRef: previousMirrorCommit,
  dryRun: true,
});
```

The branch must exist and its current tip must equal both `parentMirror` and
`expectedRef`. The new snapshot's upstream source commit must be a descendant
of the parent's recorded upstream source commit. Reusing the same upstream
commit is rejected unless `sameVersionRuleUpdate: true` is explicit for a
conversion-rule update.

The new mirror commit has exactly one parent: the previous transformed mirror
commit. The raw upstream commit is provenance only and is never added as a
parent. A non-dry run advances the branch with compare-and-swap, so a moved
branch fails instead of overwriting another worker's result.

## Bootstrap Bridge

`establishBridge` is deliberately review-first:

```js
import { establishBridge } from './tools/rebrand/src/mirror.mjs';

const review = await establishBridge({
  cwd: repository,
  mirrorCommit: m0,
  expectedProductCommit: p0,
  dryRun: true,
});
```

The default result describes the proposed bridge and its product parent tree;
it does not create an `ours` bridge or update a ref. The helper requires the
current branch to be exactly `feat/aibuddy-branding`, `HEAD` to equal
`expectedProductCommit`, a clean tracked worktree and index, and no untracked
files. Rejecting untracked tooling or documentation is intentional because
those files can hide an incomplete migration review.

The caller must provide `migrationProofPath` as an absolute path to a regular,
non-symlink file outside the repository worktree. The file is a review artifact,
not a tracked product file, so it cannot self-reference P0. Its JSON schema is:

```json
{
  "schemaVersion": 1,
  "expectedProductCommit": "<P0>",
  "expectedProductTree": "<P0 tree>",
  "initialRename": true,
  "knownProductPatches": ["<reviewed patch id>"],
  "mirrorInput": {
    "upstreamCommit": "<U0>",
    "productInputCommit": "<H0>"
  }
}
```

The proof must match P0 and its tree, identify the initial rename and known
product patches, and prove that U0 is an ancestor of H0. U0 must also match the
source commit recorded by M0. Unknown JSON fields are rejected so the artifact
cannot carry unreviewed or secret-bearing data. The bridge commit records the
proof SHA-256 and the reviewed U0, H0, P0, and tree values in trailers; it does
not copy proof contents into Git.

Creating the bridge requires all of the following additional, explicit inputs:

```js
await establishBridge({
  cwd: repository,
  mirrorCommit: m0,
  expectedProductCommit: p0,
  migrationProofPath: '/absolute/path/to/review/migration-proof.json',
  approve: true,
  expectedTree: p0Tree,
  dryRun: false,
});
```

The created commit has first parent P0, second parent M0, and exactly P0's
tree. The branch update is also compare-and-swap against P0. The parent
workflow should still review the returned plan and the M0..P0 delta before
performing this operation.

## Safety Invariants

- Git is invoked with argument arrays, never through a shell.
- The caller's working-tree index is not used to build mirror trees.
- Existing mirror refs are never overwritten.
- Mirror updates use expected-old-object compare-and-swap.
- Snapshot provenance is checked against the exact source commit and tree.
- Unresolved conversion output is rejected before Git publication.
- No `.git` entry, raw upstream parent, push, or main update is produced by the
  tooling. Legitimate upstream files named `thirdpartydata` are preserved.

Focused tests use disposable repositories and the real converter fixture:

```sh
node --test tools/rebrand/tests/mirror.test.mjs
```
