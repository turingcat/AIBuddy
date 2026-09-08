# Source Rebranding and Upstream Sync

## Mainline

`main` is the only product mainline. Create feature and sync branches or worktrees
from current main, review and test their changes, then merge normally. No product
development is performed in a generated-only branch.

The initial migration is being prepared in `feat/heybuddy-branding`. Do not merge
unconverted upstream sources into a renamed product tree or overwrite product
sources with a pristine upstream snapshot.

## Tooling

Install the locked dependencies in `tools/rebrand` with `npm ci`. The tool requires
Node matching its package engines, Rust/Cargo/rustfmt, and Git. The parser helper
uses its own locked Cargo workspace; it does not replace product dependencies.

Run from the source repository:

```sh
node tools/rebrand/cli.mjs inventory --source-ref <commit> --report-dir <new-report-directory>
node tools/rebrand/cli.mjs generate --source-ref <commit> --output <new-output-directory> --input product
node tools/rebrand/cli.mjs generate --source-ref <upstream-release-commit> --output <new-output-directory> --input upstream
node tools/rebrand/cli.mjs verify --output <generated-directory>
```

Output directories must be new and outside source worktrees. Generation never
updates Git refs. `.heybuddy-rebrand.json` records input commit/tree, pinned tool
identity, mappings, preservation decisions, formatting stages and file digests.
Any unresolved entry blocks generation. Existing output is never overwritten.

Verification checks a pristine generated tree. Installing dependencies, building,
or deliberately editing product files changes that tree; do not interpret a later
exact-tree verification failure as a product bug. Keep one untouched output for
reproducibility and apply/build a separate candidate.

Mappings describe original UTF-16 edit positions and parser-token occurrences.
They are not a claim that every symbol has a resolved cross-module semantic ID.
Formatting is a separate recorded stage, so original edit offsets must not be
applied directly to formatted output.

## Preservation Rules

- First-party packages, modules, identifiers, commands and normal product text use
  HeyBuddy. Plural Geese becomes HeyBuddies to avoid colliding with Goose symbols.
- Copyright/license notices and real upstream/external URLs remain accurate.
- Published third-party dependency `v8-goose` and Rust binding `v8_goose` remain
  unchanged. Local workspace crates are renamed.
- Historical data/keychain/browser partition identities are explicit exceptions
  until a tested data migration is approved. Never rename another installation's
  data or credentials automatically.
- Unsupported/legacy values in negative tests must remain invalid inputs. Expected
  sorted name lists must reflect target-name ordering. Test fixtures are not
  silently weakened to make a conversion pass.
- Maps, transformation tests and historical plans retain their source-name data.

## Bootstrap Gate

Before recording the initial transformed mirror as integrated:

1. Verify the exact upstream commit already represented in product history.
2. Generate the upstream baseline and customized product with the same pinned
   conversion policy, preserving product additions and intentional deletions.
3. Review their delta and validate the product output, not just the mirror.
4. Establish the reviewed common baseline ancestry on a temporary branch.
5. Test a subsequent mirror increment against that branch, including overlapping
   edits and modify/delete conflicts, before merging the migration to main.

The initial real mirror ancestry is not yet established by the tooling alone.
The synthetic Git fixtures verify the intended graph but do not perform this
bootstrap in the product repository.

## Later Upstream Releases

Pin a stable release tag to an exact commit. Generate a new mirror snapshot whose
parent is the previously integrated transformed snapshot. Create a sync branch
from current main and perform a normal three-way merge of the mirror increment.
Review overlap with desktop customizations and any non-desktop overrides.

Keep rule changes separate from upstream functional updates. Never rewrite mirror
history or merge raw upstream history as an extra parent. Publish/merge only after
the product-specific tests, build and review gates pass.

## Verification Status

Current execution evidence and outstanding gates are recorded in
`docs/superpowers/plans/2026-09-07-rebranding-progress.md`. Baseline clippy failures,
path-coverage requirements, platform installer checks and compatibility decisions
must not be silently treated as passing.
