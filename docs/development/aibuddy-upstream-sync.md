# Independent AIBuddy upstream synchronization

AIBuddy imports transformed source differences, not upstream Git history.
Each update is committed on a `sync/*` branch as ordinary single-parent AIBuddy
commits. Fetching upstream objects locally does not add them to product ancestry.
Do not merge upstream/mirror branches, cherry-pick upstream author history, or
push the local mirror branch.

`.aibuddy-upstream.json` records the last reviewed source repository/ref, source
commit/tree, transformed tree, output digest and transformer identity. The current
baseline is HeyBuddy `389b6a5b0` (Goose v1.50.0), already integrated by PR #38.
Changing this workflow does not remove authors from already published history.
Rewriting published `main` would require a separate, explicitly approved migration.

## Mapping and product ownership

`tools/aibuddy-rebrand/brand-map.json` defines the HeyBuddy/Goose → AIBuddy mapping.
`production-policy.json` and `text-policy.json` preserve external identifiers,
licenses, copyright notices, compatibility inputs and tokenizer vocabulary.
Keep those source attributions when committing a transformed update.

Preserve tflow/sub2api authentication, service configuration, credentials and
entitlements, desktop UI/branding/assets, data migration and AIBuddy release
configuration. Generic engine and desktop changes can be integrated. Resolve each
conflict according to product ownership; do not replace the entire product with
the new upstream snapshot. Keep legacy/state-machine agent behavior in parity.

## Prepare a reviewable delta

Start from current product main with a clean, dedicated worktree and `sync/*`
branch. Fetch the repository/ref recorded in `.aibuddy-upstream.json`; the existing
`upstream` remote points to HeyBuddy. Fetching is allowed; merging is not.

```sh
git fetch origin main
git fetch upstream main
git worktree add .worktrees/upstream-next -b sync/upstream-next origin/main
cd .worktrees/upstream-next

source bin/activate-hermit
npm --prefix tools/aibuddy-rebrand ci
PREVIOUS_SOURCE=$(node -p 'require("./.aibuddy-upstream.json").sourceCommit')
NEXT_SOURCE=$(git rev-parse upstream/main^{commit})
SNAPSHOT_ROOT=$(mktemp -d)
node tools/aibuddy-rebrand/cli.mjs generate --source-ref "$PREVIOUS_SOURCE" --input upstream --output "$SNAPSHOT_ROOT/previous"
node tools/aibuddy-rebrand/cli.mjs generate --source-ref "$NEXT_SOURCE" --input upstream --output "$SNAPSHOT_ROOT/next"
node tools/aibuddy-rebrand/cli.mjs verify --output "$SNAPSHOT_ROOT/previous"
node tools/aibuddy-rebrand/cli.mjs verify --output "$SNAPSHOT_ROOT/next"
node tools/aibuddy-rebrand/sync.mjs prepare --previous "$SNAPSHOT_ROOT/previous" --next "$SNAPSHOT_ROOT/next" --output "$SNAPSHOT_ROOT/review"
```

Preparation checks the previous snapshot against the committed baseline and
requires forward source ancestry (or the same source for a mapping-only update).
It writes only Git tree/blob cache objects and the external review directory; it
creates no commits, refs or product parents and leaves the worktree/index unchanged.
The review contains `upstream.patch` and `plan.json`, with source hashes, changed
paths, the expected product HEAD and a patch digest. Review them before applying.

If the previous snapshot digest differs, stop. Mapping changes may have altered
historical output. Use the converter from the product revision that last recorded
the baseline (`git log -1 --format=%H -- .aibuddy-upstream.json`) to reproduce the
previous snapshot, while generating the next snapshot with the reviewed current
converter. Keep both snapshots until the synchronization is complete. Do not edit
the recorded digest just to bypass the mismatch.

## Apply and resolve

```sh
node tools/aibuddy-rebrand/sync.mjs apply --plan "$SNAPSHOT_ROOT/review"
git diff --cached
git status --short
```

The helper uses `git apply --3way --index`, with binary data and file modes retained.
It never merges or creates a commit. On a clean application it stages the updated
source record along with the code changes. No `MERGE_HEAD` is created.

When conflicts occur, the command exits nonzero and reports the affected files.
The source record remains at the previous baseline. Resolve and stage the files,
then record the reviewed source:

```sh
git diff --name-only --diff-filter=U
# Resolve the listed files, preserving AIBuddy-owned behavior, then stage them.
node tools/aibuddy-rebrand/sync.mjs record --plan "$SNAPSHOT_ROOT/review"
```

The pending operation is stored at the worktree-specific Git path returned by
`git rev-parse --git-path aibuddy-snapshot-sync.json`. Recording refuses unresolved
conflicts, unstaged resolutions, changed plans, or a changed product HEAD. Finish
recording before committing. An application failure without resolvable conflicts
also leaves the baseline unchanged; inspect the reported error and index before
retrying. To abandon an operation, first restore its changes using your normal
reviewed recovery procedure, then remove only that pending marker. The tool never
automatically resets or discards local files.

## Verify and publish ordinary product commits

```sh
npm --prefix tools/aibuddy-rebrand test
pnpm --dir ui/desktop run check:product-boundary
cargo fmt --all
# Run the applicable Rust/desktop checks and product-boundary review.
git diff --cached --check
git commit -m "sync: import reviewed HeyBuddy snapshot changes"
node tools/aibuddy-rebrand/sync.mjs check-history --base origin/main
git push -u origin HEAD
```

The history check requires the current product base to be an ancestor and rejects
new root/merge commits in the synchronization range. If product main advanced,
rebase your own product commits onto it, resolve/test those changes, and rerun the
check. Never rebase or cherry-pick the upstream community commits into the product.
The `Upstream Snapshot History` workflow checks `sync/*` PR heads directly rather
than GitHub's synthetic merge commits. Repository branch protection can require
its `Check independent synchronization history` status.

PR descriptions identify the source range, mapping changes, preserved product
boundaries and verification results. Keep licenses and upstream attribution in
the source even though the synchronization commit is authored by its integrator.

## Historical mirror workflow

PR #38 used a transformed-mirror merge. Those commits are historical and need no
rewriting for future delta synchronization. The old mirror helpers remain for
inspection/tests; they are not the product publication workflow. Future updates
need the two verified snapshots and the tracked source record, not a mirror branch.
