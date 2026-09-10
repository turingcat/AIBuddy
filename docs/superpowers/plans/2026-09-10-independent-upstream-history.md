# Independent upstream history implementation plan

**Goal:** Future synchronizations import transformed code differences without upstream commit ancestry.
**Architecture:** Verified snapshot trees → reviewable binary patch → three-way application → ordinary product commit, with a tracked source baseline and a PR history check.
**Tech stack:** Node.js built-ins, existing rebrand verifier, Git, GitHub Actions.

## Constraints

Keep tflow and desktop customizations, source/license attribution, and published
main history. Work on a new sync branch. Do not merge or push mirror branches.

## Tasks

- [x] Add real Git fixture tests for delta preparation, two consecutive independent syncs, customizations, binary/mode/rename changes, conflicts and recovery, stale baseline/HEAD, tampering, and ancestry checks. Confirm failures before implementation.
- [x] Expose verified tree-only snapshot materialization from `src/mirror.mjs` and implement `src/snapshot-sync.mjs` plus a dependency-free `sync.mjs` CLI. Baseline advances only after applied/resolved changes; all mutations require a clean, unchanged product HEAD.
- [x] Add `.aibuddy-upstream.json` from the last verified snapshot and update AGENTS.md, README, synchronization/rebranding docs; archive the old merge workflow. Add a synchronization PR history guard.
- [x] Run focused and full converter tests, declared path checks, product-boundary/history checks and formatting. Review implementation before publishing a new PR.

## Verification results

- Full rebrand suite: 198 tests passed; revised standalone CLI check passed.
- New synchronization contract: 15 tests covering continuous source deltas,
  ancestry, preserved product overrides, conflict completion and rejection paths.
- Supplemental Node coverage of `snapshot-sync.mjs`: 93.40% lines, 82.98% branches,
  100% functions. This is not whole-repository path coverage.
- CI contracts: 48 tests / 1381 assertions; architecture contracts: 9 passed.
- Product-boundary and Rust formatting checks passed; runtime Rust/desktop code
  was not changed by this task.
- The tracked baseline matches the real verified HeyBuddy 389b6a5b0 snapshot,
  including source/tree/output digest and transformer identity.
- Independent review found no blocker. The history guard verifies ancestry;
  it does not identify upstream cherry-picks whose ancestry has been rewritten.
