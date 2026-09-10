# AIBuddy source rebranding

This tool transforms pinned Goose or HeyBuddy Git snapshots into AIBuddy-named
source trees. `brand-map.json` is the authoritative exact-case mapping table used
for both source families. The generated `.aibuddy-rebrand.json` file records every
per-file conversion, exception, source commit, tool identity, and output digest.

The intended upstream workflow is:

1. Fetch and pin a HeyBuddy upstream commit.
2. Generate and verify an AIBuddy snapshot from that exact commit.
3. Commit the transformed snapshot to `upstream/aibuddy-mirror`.
4. Merge the mirror into an AIBuddy synchronization branch and resolve only
   AIBuddy-owned product boundaries.

## Requirements

Use the Node versions declared in `package.json`, Git, Cargo, rustc, and rustfmt.
Install this tool's pinned dependencies with `npm ci`. The Rust parser has its own
locked workspace in `rust-parser`; generated sources never depend on that helper.

## Commands

Run from the product repository root:

```sh
node tools/aibuddy-rebrand/cli.mjs inventory --source-ref <commit> --report-dir <new-directory>
node tools/aibuddy-rebrand/cli.mjs generate --source-ref <commit> --output <new-directory> --input product
node tools/aibuddy-rebrand/cli.mjs generate --source-ref <upstream-commit> --output <new-directory> --input upstream
node tools/aibuddy-rebrand/cli.mjs verify --output <generated-directory>
```

Outputs must be outside source worktrees and must not already exist. Generation
reads committed Git blobs only, rejects unresolved references and unsafe paths,
formats changed Rust files, and publishes without replacing existing destinations.

`brand-map.json` defines canonical name replacements. `production-policy.json`
and `text-policy.json` define explicit preservation and full-text conversion rules.
`map.json` contains bounded validation examples; it is not the complete repository
map. Symbol records are parser-token occurrences, not unique cross-module declarations.

## Application

`src/apply-snapshot.mjs` exports `applySnapshot`. Its default is a dry run; a real
application requires an explicitly selected `feat/*` or `sync/*` branch and a
quiescent dedicated worktree. It verifies baseline files, snapshot bytes, target
paths, and ancestry before writing. It retains explicitly named control paths and
rolls back owned writes if an error occurs.

## Tests

```sh
cd tools/aibuddy-rebrand
npm test
cargo test --locked --manifest-path rust-parser/Cargo.toml
```

Fixtures use temporary repositories or exact pinned source commits. Snapshot
verification applies to pristine generated output. Keep one pristine output for
repeatability checks and use a separate copy for build validation.
