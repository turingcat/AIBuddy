# AIBuddy source rebranding and independent synchronization

Generate AIBuddy-named source snapshots from pinned HeyBuddy or Goose commits.
`brand-map.json` is the authoritative mapping; `production-policy.json` and
`text-policy.json` define reviewed preservation exceptions. Unsupported occurrences
fail closed. Each snapshot includes `.aibuddy-rebrand.json` with conversion and
source provenance. Licenses, copyright and external identities remain preserved.

## Generate and verify

```sh
node tools/aibuddy-rebrand/cli.mjs inventory --source-ref <commit> --report-dir <new-directory>
node tools/aibuddy-rebrand/cli.mjs generate --source-ref <commit> --output <new-directory> --input upstream
node tools/aibuddy-rebrand/cli.mjs verify --output <snapshot-directory>
```

Outputs must be new directories outside source worktrees. Generation reads
committed Git blobs, checks paths/collisions/residuals and formats changed Rust.

## Synchronize without upstream commit ancestry

The product's `.aibuddy-upstream.json` records the last applied snapshot. On a clean
`sync/*` branch, generate the verified previous and next snapshots, then:

```sh
node tools/aibuddy-rebrand/sync.mjs prepare --previous <old-snapshot> --next <new-snapshot> --output <new-review-directory>
node tools/aibuddy-rebrand/sync.mjs apply --plan <review-directory>
# If conflicts occur, resolve and stage them before recording:
node tools/aibuddy-rebrand/sync.mjs record --plan <review-directory>
# After review/testing, create an ordinary product commit and check its history:
node tools/aibuddy-rebrand/sync.mjs check-history --base origin/main
```

`prepare` creates trees/blobs and a reviewable binary patch, never commits or refs.
`apply` uses Git's three-way patch application to preserve product customizations.
It records the new baseline only on a successful application. `record` finishes a
previously conflicted application and is unnecessary after a clean one. The helper
never commits, merges, resets or pushes. The history check is dependency-free.

Do not merge raw upstream or transformed mirror branches, or replay their author
history. Use [the full workflow](../../docs/development/aibuddy-upstream-sync.md)
for preparation, conflicts, verification and publication. Existing historical
mirror APIs and `applySnapshot` (full-tree branding migration) remain available for
legacy tooling, but neither is the default upstream synchronization mode.

## Tests

```sh
npm --prefix tools/aibuddy-rebrand ci
npm --prefix tools/aibuddy-rebrand test
cargo test --locked --manifest-path tools/aibuddy-rebrand/rust-parser/Cargo.toml
```

Snapshot-sync tests use independent product/source Git roots and two consecutive
updates. They check ancestry, authors, product preservation, binary/mode/rename
changes, conflicts and rejected stale inputs. The existing coverage inventory is
bounded decision-path coverage, not whole-repository path coverage.
