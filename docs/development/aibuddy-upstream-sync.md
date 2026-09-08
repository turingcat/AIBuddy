# AIBuddy upstream synchronization

AIBuddy synchronizes product-neutral changes from HeyBuddy through a transformed
mirror. Raw HeyBuddy history is fetched and pinned, converted by
`tools/aibuddy-rebrand`, committed to `upstream/aibuddy-mirror`, and then merged
into a `sync/*` branch with ordinary three-way Git merges. Product authentication,
service configuration, credentials, data migration, assets, packaging, release
identity, and user-visible naming remain owned by AIBuddy.

## Conversion map

`tools/aibuddy-rebrand/brand-map.json` is the authoritative name map. The
conversion policy and its exceptions are versioned in
`production-policy.json` and `text-policy.json` beside it.

| HeyBuddy or Goose source form | AIBuddy form | Applied to |
| --- | --- | --- |
| `heybuddy`, `goose` | `aibuddy` | lowercase names and identifier segments |
| `HeyBuddy`, `Goose` | `AIBuddy` | display names and CamelCase segments |
| `HEYBUDDY`, `GOOSE` | `AIBUDDY` | constants and environment-variable segments |
| `heybuddies`, `geese` | `aibuddies` | lowercase plurals |
| `HeyBuddies`, `Geese` | `AIBuddies` | title-case plurals |
| `HEYBUDDIES`, `GEESE` | `AIBUDDIES` | uppercase plurals |
| `crates/heybuddy*`, `crates/goose*` | `crates/aibuddy*` | first-party crate paths and package names |
| `heybuddy`, `goose` commands | `aibuddy` | CLI binary, launchers, scripts, and examples |
| `HEYBUDDY_*`, first-party `GOOSE_*` | `AIBUDDY_*` | current configuration and runtime environment names |
| `heybuddy://` and current first-party protocol names | `aibuddy://` | current deep links and protocol routing |
| `github.com/turingcat/HeyBuddy` | `github.com/turingcat/AIBuddy` | owned repository, release, and download URLs |
| `@aaif/heybuddy-*`, local `@aaif/goose-*` | `@aibuddy/aibuddy-*` | first-party JavaScript packages |

The map also records source repair rules. `monheybuddy` returns to `mongoose`,
`heybuddybumps` returns to `goosebumps`, and provider model aliases renamed by
HeyBuddy return to their external Goose names. Examples include `goose-o1`,
`kgoose-o3`, `headless-goose-o3-mini`, `goose-gpt-5`, and
`goose-claude-sonnet-4-5-bedrock`.

Explicit preservation policy keeps these identities unchanged:

- external repositories such as `aaif-goose/goose` and `block/goose`;
- registry identities such as `v8-goose` and `v8_goose`;
- provider model aliases such as `goose-o1`, `kgoose-o3`, and
  `goose-claude-sonnet-4-5-bedrock`;
- published Goose ACP metadata and JSON-RPC methods such as `goose` and
  `_goose/unstable/...` in the ACP implementation and fixtures;
- published Goose Nostr links and packaging registration such as
  `goose://sessions/nostr` and `GooseNostrProtocol`;
- legacy `GOOSE_*` inputs only in listed compatibility modules;
- database and serialized migration inputs `goose_mode` and `heybuddy_mode`;
- legacy HeyBuddy values in negative assertions that verify they do not leak
  into AIBuddy prompts or user-visible copy;
- legal attribution and historical research run links;
- MCP replay `STDIN` lines produced by the client are converted to AIBuddy;
  recorded server output, result JSON, and playback diagnostics keep their
  original values.
- evaluation data whose original values are part of the fixture.

For upstream input, `.heybuddy-rebrand.json` and `tools/rebrand/**` are omitted.
AIBuddy maintains its own converter, so upstream branding implementation never
enters the transformed mirror.

## Pin and generate

Fetch HeyBuddy and select an exact commit. Do not use a moving branch name as the
recorded mirror input.

```sh
git fetch upstream main
UPSTREAM_COMMIT=$(git rev-parse upstream/main^{commit})
export SNAPSHOT_A=/private/tmp/aibuddy-upstream-${UPSTREAM_COMMIT}-a
export SNAPSHOT_B=/private/tmp/aibuddy-upstream-${UPSTREAM_COMMIT}-b

node tools/aibuddy-rebrand/cli.mjs generate \
  --source-ref "$UPSTREAM_COMMIT" \
  --output "$SNAPSHOT_A" \
  --input upstream
node tools/aibuddy-rebrand/cli.mjs generate \
  --source-ref "$UPSTREAM_COMMIT" \
  --output "$SNAPSHOT_B" \
  --input upstream
node tools/aibuddy-rebrand/cli.mjs verify --output "$SNAPSHOT_A"
node tools/aibuddy-rebrand/cli.mjs verify --output "$SNAPSHOT_B"
```

The two verification summaries must have the same input digest, output digest,
entry count, source commit, and source tree. Keep one snapshot pristine for
mirror publication.

## Create or append the mirror

Create M0 once with `prepareMirror`. Use `appendMirror` for every later upstream
commit. Both helpers default to a dry run.

```sh
node --input-type=module <<'NODE'
import { prepareMirror } from './tools/aibuddy-rebrand/src/mirror.mjs';

const result = await prepareMirror({
  cwd: process.cwd(),
  snapshotDir: process.env.SNAPSHOT_A,
  branch: 'upstream/aibuddy-mirror',
  dryRun: false,
});
console.log(JSON.stringify(result, null, 2));
NODE
```

For a later snapshot:

```sh
node --input-type=module <<'NODE'
import { appendMirror } from './tools/aibuddy-rebrand/src/mirror.mjs';

const previousMirror = process.env.PREVIOUS_MIRROR;
const result = await appendMirror({
  cwd: process.cwd(),
  snapshotDir: process.env.SNAPSHOT_A,
  branch: 'upstream/aibuddy-mirror',
  parentMirror: previousMirror,
  expectedRef: previousMirror,
  dryRun: false,
});
console.log(JSON.stringify(result, null, 2));
NODE
```

Mirror commits contain transformed source only. Their trailers record the raw
upstream commit and tree, transformed tree, output digest, and transformer
identity. Never rewrite the mirror branch.

## Bootstrap and later merges

The first product baseline needs a two-parent bridge whose tree is exactly the
reviewed AIBuddy product tree. `establishBridge` requires an external JSON proof,
a clean `feat/*` or `sync/*` branch, the exact product commit, and an explicit
non-dry-run approval. The schema and full command are documented in
`docs/development/upstream-mirror.md`.

After bootstrap, create each sync branch from current `main` and merge the new
mirror commit. Resolve only AIBuddy-owned boundaries, then run:

```sh
source bin/activate-hermit
cargo fmt --all
cargo test -p aibuddy
cargo clippy --all-targets -- -D warnings

cd ui/desktop
env CI=true pnpm run check:product-boundary
pnpm run typecheck
pnpm test

cd ../../tools/aibuddy-rebrand
npm test
cargo test --locked --manifest-path rust-parser/Cargo.toml
```

Review remaining Goose or HeyBuddy strings. Historical documents, external
repositories, provider aliases, compatibility inputs, recorded MCP server
output, and evaluation fixtures may remain. MCP client input, active product
code, package names, release URLs, workflow artifacts, commands, and
user-visible identity must use AIBuddy.

## Current bootstrap baseline

The September 8, 2026 bootstrap pins HeyBuddy `main` at
`ad5c466ccd64e26b40db5ff9650addc643ce1d58`, whose source tree is
`b9fbcceef8e2e1462cd74c6f413fee92d3104d08`.

Two independently generated snapshots produced the same verification values:

| Field | Value |
| --- | --- |
| Input digest | `bfdd045f59cce4400ed51d0f3b46efd2df37838f8d008ca8266a6bb67e28af44` |
| Output digest | `06b26bb441eae5404f908cacd0d5d24b09acd9b6ee7036fdef9544afa34c81d6` |
| Transform identity | `cef1b2daef669d3b32c248961eb2969dec83cfedca121b67c6e0e2e57ca2d911` |
| Entry count | `2223` |
| Product baseline P0 | `f0ad0cc87bb9c77ee2039a52b5f3d1a6d48ae1fc` |
| Product tree | `924d620b4009e837557979eb2d5d39ec4991e5df` |
| Mirror root M0 | `e3aea38cbf3f260fd75aa4edfcfe93ad2ee1a1c5` |
| Mirror tree | `9fdbcdd4f2a07553e1b86b62fd1ab620bf4238a8` |
| Bootstrap bridge | `b2cceb889cfb55253d9771f7a4cd5971169915b4` |
| Migration proof digest | `8c4432c353d3877f13af8224a1ff59ddc0548b8be547053ae0452424b78b54b0` |

The bridge has P0 as its first parent and M0 as its second parent. Its tree is
byte-for-byte identical to the P0 product tree.
