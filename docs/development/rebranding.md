# Source Rebranding and Upstream Sync

## Mainline

`main` is the only product mainline. Create feature and sync branches or worktrees
from current main, review and test their changes, then merge normally. No product
development is performed in a generated-only branch.

The initial HeyBuddy main migration is prepared in
`sync/heybuddy-main-aibuddy-map-20260908`. Do not merge
unconverted upstream sources into a renamed product tree or overwrite product
sources with a pristine upstream snapshot.

## Tooling

Install the locked dependencies in `tools/aibuddy-rebrand` with `npm ci`. The tool requires
Node matching its package engines, Rust/Cargo/rustfmt, and Git. The parser helper
uses its own locked Cargo workspace; it does not replace product dependencies.

Run from the source repository:

```sh
node tools/aibuddy-rebrand/cli.mjs inventory --source-ref <commit> --report-dir <new-report-directory>
node tools/aibuddy-rebrand/cli.mjs generate --source-ref <commit> --output <new-output-directory> --input product
node tools/aibuddy-rebrand/cli.mjs generate --source-ref <upstream-release-commit> --output <new-output-directory> --input upstream
node tools/aibuddy-rebrand/cli.mjs verify --output <generated-directory>
```

Output directories must be new and outside source worktrees. Generation never
updates Git refs. `.aibuddy-rebrand.json` records input commit/tree, pinned tool
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
  AIBuddy. Goose/Geese and HeyBuddy/HeyBuddies converge on
  AIBuddy/AIBuddies.
- Copyright/license notices and real upstream/external URLs remain accurate.
- Published third-party dependency `v8-goose` and Rust binding `v8_goose` remain
  unchanged. Local workspace crates are renamed.
- Provider model aliases such as `goose-o1`, `kgoose-o3`, and
  `headless-goose-o3-mini` remain unchanged because they are external input
  identities rather than product branding.
- Historical data/keychain/browser partition identities are explicit exceptions
  until a tested data migration is approved. Never rename another installation's
  data or credentials automatically.
- Unsupported/legacy values in negative tests must remain invalid inputs. Expected
  sorted name lists must reflect target-name ordering. Test fixtures are not
  silently weakened to make a conversion pass.
- Maps, transformation tests and historical plans retain their source-name data.

## Independent upstream history

Follow `docs/development/aibuddy-upstream-sync.md`. Generate verified previous and
next snapshots using this mapping, then apply their delta on a product sync branch.
Record source hashes in `.aibuddy-upstream.json` and create ordinary single-parent
AIBuddy commits. Do not merge upstream/mirror branches or use upstream commits as
product parents. The historical bootstrap is retained only for provenance.
