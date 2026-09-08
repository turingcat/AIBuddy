# HeyBuddy Source Rebranding

This tool transforms pinned upstream and product Git snapshots into HeyBuddy-named
source trees. Normal product development remains on feature branches from main.
See `docs/development/rebranding.md` for the workflow and remaining integration gates.

## Requirements

Use the Node versions declared in `package.json`, Git, Cargo, rustc and rustfmt.
Install this tool's pinned dependencies with `npm ci`. The Rust parser has its own
locked workspace in `rust-parser`; generated sources never depend on that helper.

## Commands

Run from the product repository root:

```sh
node tools/rebrand/cli.mjs inventory --source-ref <commit> --report-dir <new-directory>
node tools/rebrand/cli.mjs generate --source-ref <commit> --output <new-directory> --input product
node tools/rebrand/cli.mjs generate --source-ref <upstream-commit> --output <new-directory> --input upstream
node tools/rebrand/cli.mjs verify --output <generated-directory>
```

Outputs must be outside source worktrees and must not already exist. Generation
reads committed Git blobs only, rejects unresolved references and unsafe paths,
formats changed Rust files, and publishes without replacing existing destinations.
The provenance file records mappings, explicit exceptions, formatting and digests.

`production-policy.json` and `text-policy.json` control the full conversion.
`map.json` is a bounded validation example, not the complete repository map.
The complete per-file/per-occurrence map is generated in `.heybuddy-rebrand.json`.
Symbol records are parser-token occurrences, not unique cross-module declarations.

## Application

`src/apply-snapshot.mjs` exports `applySnapshot`. Its default is a dry run; a real
application requires an explicitly selected `feat/*` branch and a quiescent
dedicated worktree. It verifies baseline files, actual snapshot bytes and target
paths, retains unrelated files, and conditionally rolls back owned writes on error.
It never changes main, Git refs or the index. No CLI application shortcut is
provided: inspect the dry-run plan before invoking the library with `dryRun: false`.

Cooperative locking and rechecks detect accidental concurrent changes. They are
not a security boundary against a hostile same-user process writing concurrently.

## Tests and Boundaries

```sh
cd tools/rebrand
npm test
cargo test --locked --manifest-path rust-parser/Cargo.toml
```

Fixtures use temporary repositories or exact pinned source commits. They do not
depend on old-name paths remaining in the product working directory.

Snapshot verification applies to pristine generated output. Building SDKs,
installing dependencies and editing product code legitimately changes that tree.
Keep a pristine output for repeatability and a separate tree for build validation.

Successful conversion does not establish runtime compatibility, path coverage,
installer correctness or successful upstream merging. The initial transformed
mirror ancestry and product release remain separate reviewed steps. Copyright,
external identifiers and approved persistent-data identities are preserved rather
than mechanically relabeled.
