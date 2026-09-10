# Independent upstream synchronization

The user selected snapshot/delta synchronization so new upstream updates do not
add community commits to AIBuddy's ancestry. PR #38 is already merged; this change
preserves published main history and introduces the new policy in a separate PR.

Use verified previous/next AIBuddy-transformed upstream snapshots. Materialize
Git trees and blobs only, generate a binary-capable patch, and apply it with
`git apply --3way --index` on a clean sync branch. A normal single-parent product
commit records the reviewed result. Neither raw upstream nor mirror commits are
parents. Local mirror helpers remain historical utilities, not publication steps.

A small tracked `.aibuddy-upstream.json` records source repository/ref, source
commit/tree, transformed tree, output digest and transformer identity. The previous
snapshot must match this baseline. Source advancement must be forward or use the
same source for an explicit mapping update. Snapshot provenance remains the source
of truth for conversion, while product-owned tflow/desktop changes remain local.

Preparation writes an external review plan and patch. Apply checks the recorded
product HEAD and clean branch, records a pending operation in the worktree Git
directory, then applies the patch. Conflicts remain available for normal review;
the baseline advances only after conflict resolution and staged changes. The
helper never commits, merges, resets, or pushes.

A dependency-free history check rejects root/merge commits added by synchronization
PRs relative to their product base. CI checks the PR head rather than GitHub's
synthetic merge commit. This blocks importing an upstream root/history by merging.

Tests exercise independent source/product roots, consecutive deltas, preserved
customization, conflicts, binary/mode/rename changes, stale/tampered plans, baseline
mismatch, branch/dirty-worktree guards and CI history rejection. Copyright,
license files and source attribution remain intact. Existing Contributors entries
may remain because no published history is rewritten.
