# HeyBuddy Full Source Rebranding Implementation Plan

> SUPERSEDED IN FULL: Use `2026-09-07-transformed-upstream-integration.md`. The user approved direct development in renamed HeyBuddy sources. Do not implement the canonical upstream-named product source or generated-only product branch described below. This file is historical only.

> For agentic workers: use executing-plans to implement task-by-task after plan approval. Track the checkboxes below. This plan supersedes the external-only branding design and its CLI amendment.

**Goal:** Generate a fully HeyBuddy-named source tree reproducibly from the customized upstream-named HeyBuddy source, while retaining a practical upstream integration workflow.

**Architecture:** Keep one editable canonical source branch with upstream naming and existing HeyBuddy customizations. A versioned transformation tool produces the renamed tree from a pinned commit. The generated branch is reviewable and buildable but is not an independent development source.

**Tech Stack:** Existing Rust/Cargo, TypeScript/pnpm, Electron, and CI. Proposed transformation tooling: a standalone Node package under `tools/rebrand`, TypeScript compiler API for TS/JS symbol resolution, a Rust lexical/CST adapter, and structured TOML/JSON/YAML parsers. Parser selection and version locking are a prototype gate, not permission to use regular-expression substitution as a semantic fallback.

## Assessment and Constraints

- Prior scan of base `e8da42984`: 2,244 tracked files; 1,112 content matches; 839 path matches; 1,408 unique content-or-path candidates; 16,914 case-insensitive Goose occurrences. These are inventory counts, not promises that every match will be changed.
- Repeat the scan before implementation. Include `geese`, case variants, ignored/generated inputs, symlinks, and visual assets as separate categories. Never recursively ingest `.git`, worktrees, caches, or installed dependencies.
- Rename first-party directories, crates, packages, symbols, commands, assets, documentation, configuration names, and generated first-party identifiers. `goose-cli` is included, not just wrapped.
- Preserve legally required notices, accurate upstream attribution and URLs, third-party identifiers, and explicit legacy compatibility literals. Zero unclassified occurrences is the release criterion, not zero bytes spelling Goose.
- Preserve HeyBuddy authentication, model restrictions, localization, packaging, disabled telemetry, and intentionally removed upstream functionality described in `docs/upstream-sync-v1.49.0.md`.
- Do not rename remote services, publish package scopes, change live credentials, rewrite Git history, or push branches as a side effect of conversion.
- No functional agent-loop change is intended. Any required behavioral change must preserve and test parity between legacy and state-machine paths.
- Request permission before builds/tests/clippy per repository instructions. Format changed code. Do not merge or release without verification.
- Unit tests are required for functional changes. Repository requirement: at least 80% path coverage. Report available line/branch metrics honestly; they do not prove path coverage. If that requirement cannot be demonstrated, report the verification gate as unmet and request a decision.

## Branch and Maintenance Contract

Proposed branches, created only during approved implementation:

1. `source/heybuddy`: canonical upstream-named source, initially seeded from the existing customized fork, not from pristine upstream.
2. `feat/heybuddy-branding`: current planning/tool-development branch; integrate its tooling and compatibility work into the canonical branch before the first conversion.
3. `generated/heybuddy`: append-only generated snapshots. Each snapshot records source commit, upstream baseline, map version, tool version, and input/output tree digests.

Keep `main` unchanged during the pilot. Decide its eventual role only after two successful generation/sync rounds. If it becomes the generated delivery branch, all source edits still go through `source/heybuddy`.

Normal development occurs on canonical-source feature branches. Do not merge renamed generated snapshots back into canonical source. A generated-branch hotfix must first be ported semantically to canonical source and regenerated; automated reverse replacement is forbidden because existing HeyBuddy names make the mapping non-invertible.

Upstream update: merge upstream into a temporary branch based on canonical source; resolve functional conflicts; run source tests; run conversion; review map drift; test generated tree; integrate canonical changes; append a generated commit. The tool never runs `git pull` into the renamed tree.

## Naming and Compatibility Policy

| Kind | Target policy |
| --- | --- |
| Rust crates / paths | `goose-*` -> `heybuddy-*`, `crates/goose` -> `crates/heybuddy` |
| Rust module / symbols | `goose_*` -> `heybuddy_*`, `Goose*` -> `HeyBuddy*`; resolve collisions first |
| CLI | actual package `heybuddy-cli`, primary binary `heybuddy` |
| JS workspace packages | local `@heybuddy/*` names replacing first-party `@aaif/goose-*`; publishing is out of scope |
| Environment | canonical `HEYBUDDY_*`; legacy `GOOSE_*` input aliases in an explicit compatibility module |
| Public protocol | `heybuddy://`; optional registration and acceptance of legacy `goose://` through the same security checks |
| Data/config paths | new HeyBuddy path identity; explicit old-data detection and migration, never blind recursive renaming |
| Serialized/protocol keys | classify ownership; first-party keys may migrate with read aliases, external contracts stay stable |
| Historical/third-party material | retain accurate references using narrow, reasoned exceptions |

Proposed default: retain old CLI and environment inputs during a compatibility period, while output/help/new writes use HeyBuddy names. This is not yet approval to remove old support. If both environment names exist, canonical wins only after checking existing `HEYBUDDY_*` semantics; collisions are a hard review gate.

Existing-user migration must not overwrite either old or new data. No migration of another Goose installation merely because its directory exists: require an explicit user action or reliable HeyBuddy ownership evidence. Copy/validate with backup and migration marker, preserve original data, and fail closed on ambiguity. Keychain entries and existing application IDs require separate ownership review.

## Manifest and Conversion Contract

Create `tools/rebrand/map.json` and `tools/rebrand/map.schema.json` as the authoritative rules. Each rule includes `id`, `category`, `selector`, `from`, `to` or `action: preserve`, `reason`, and validation expectations. Symbol selectors include language, package/module, declaration kind, and qualified name; line numbers are diagnostic only.

Inventory is generated, not a second manually maintained map. Reports include every tracked path, matching declarations/references, string contexts, action, rule ID, collision, unsupported syntax, and unresolved occurrence. Rule IDs must remain unique; scoped matches prevent newly renamed HeyBuddy symbols from being renamed again.

Proposed CLI (implemented by this project, not currently available):

```sh
node tools/rebrand/cli.mjs inventory --source-ref <commit> --report-dir <outside-source>
node tools/rebrand/cli.mjs generate --source-ref <commit> --output <new-empty-directory>
node tools/rebrand/cli.mjs verify --output <generated-directory>
```

Generation reads Git blobs from an exact commit, not a dirty working directory. It refuses an existing/nonempty destination, destination nesting inside source, unresolved rules, case-insensitive path collisions, symlink escapes, or any attempt to overwrite an executable. Build into staging and publish only a successful complete tree. Exclude `.git` and installed/build outputs. Preserve executable bits and safe symlinks. Do not log credentials or inspect user configuration outside the source tree.

Transformation order: inventory and collision analysis; semantic rename plan against original paths; structured strings/manifests; source-reference edits; path moves; generated-source regeneration; lockfile validation; residual audit; report. All edits to a file are computed against one input version and rejected if overlapping.

Reproducibility means identical content and executable-mode tree digest for identical pinned inputs. Keep timestamps and operational reports outside that digest. Re-running against the same source into a fresh destination must reproduce the tree. Already-converted input must be detected and rejected explicitly, not converted twice.

Lockfiles are not free-text replacements: preserve dependency resolutions, regenerate or reconcile with Cargo/pnpm under pinned tool versions, then reject unrelated version drift. First-party renames are structured automated metadata edits; new human-authored Rust dependencies use `cargo add`.

## Task 1: Baseline and Complete Inventory

**Files:** create `tools/rebrand/package.json`, `tools/rebrand/cli.mjs`, `tools/rebrand/src/inventory.mjs`, `tools/rebrand/tests/inventory.test.mjs`; read `Cargo.toml`, `ui/pnpm-workspace.yaml`, `docs/upstream-sync-v1.49.0.md`.

- [ ] Recheck branch state and inventory pinned commit, including packages and all language/file types.
- [ ] Add failing fixture tests for tracked hidden files, binary assets, modes, symlinks, nested worktrees, plurals, and mixed case.
- [ ] Implement read-only Git-blob inventory and machine-readable report; never infer a function count from regex matches.
- [ ] Run tests once authorized; classify every candidate as transform, preserve, regenerate, asset review, or unresolved.
- [ ] Commit the tested inventory tool without modifying application source.

## Task 2: Manifest Validation and Collision Prototype

**Files:** create `tools/rebrand/map.json`, `tools/rebrand/map.schema.json`, `tools/rebrand/src/rules.mjs`, `tools/rebrand/tests/rules.test.mjs`, `tools/rebrand/tests/fixtures/`.

- [ ] Add failing tests for duplicate IDs, missing scope, overlapping edits, shadowed variables, old/new symbol coexistence, package collisions, and case-insensitive path collisions.
- [ ] Prototype TypeScript language-service renames and Rust token/CST renames on real CLI and config excerpts, including macros and stringified identifiers.
- [ ] Lock parser dependencies and record unsupported syntax. A Rust textual identifier pass is insufficient without declaration/reference and macro/string checks.
- [ ] Resolve existing HeyBuddy target collisions with explicit rules; do not merge distinct symbols by spelling.
- [ ] Populate mappings and narrow preservation rules from Task 1; fail on unknown contexts.
- [ ] Run fixture tests and commit. Stop for design review if semantic coverage is inadequate.

## Task 3: Safe Deterministic Generation Engine

**Files:** create `tools/rebrand/src/generate.mjs`, `tools/rebrand/src/verify.mjs`, `tools/rebrand/tests/generate.test.mjs`; extend `cli.mjs`.

- [ ] Add failing tests for nonempty destination, dirty-source exclusion, executable modes, symlink escape, interrupted generation, overlapping edits, and repeated conversion.
- [ ] Implement staging, ordered transforms, output digests, provenance report, and hard failure on unresolved entries.
- [ ] Verify two fresh outputs are identical and failed runs cannot change source or replace an existing output.
- [ ] Ensure engine can operate on a renamed output without importing itself from that output; transformation rules and fixtures are intentional preserved control data.
- [ ] Run tests and commit the engine independently of broad application renames.

## Task 4: Rust and CLI Transform Adapters

**Files:** create `tools/rebrand/src/adapters/rust.mjs`, `tools/rebrand/src/adapters/toml.mjs`, `tools/rebrand/tests/rust.test.mjs`; map source `Cargo.toml`, `Cargo.lock`, `crates/*/Cargo.toml`, `crates/goose-cli/src/main.rs`, and all inventoried Rust declarations/references.

- [ ] Test crate/package/path/lib/bin names, dependency aliases, feature references, macro inputs, docs, snapshots, `include_*`, and command literals.
- [ ] Implement and apply rules to a throwaway generated tree, including `goose-cli` -> `heybuddy-cli` and primary binary rename.
- [ ] Reconcile Cargo metadata and lockfile without dependency upgrades; run formatting and authorized metadata/build/tests/clippy checks on generated crates.
- [ ] Confirm legacy and state-machine paths still compile and their relevant suites pass under the renamed environment policy.
- [ ] Commit adapters/rules, not a partial transformed canonical tree.

## Task 5: Desktop, SDK, Scripts, and Assets

**Files:** create `tools/rebrand/src/adapters/typescript.mjs`, `tools/rebrand/src/adapters/structured.mjs`, `tools/rebrand/tests/frontend.test.mjs`; map `ui/sdk/package.json`, `ui/goose-binary/*/package.json`, `ui/pnpm-workspace.yaml`, `ui/pnpm-lock.yaml`, `ui/desktop/src/brand.ts`, `ui/desktop/branding/brands.json`, `ui/desktop/forge.config.ts`, `ui/desktop/src/main.ts`, `Justfile`, `.github/workflows/*`, `scripts/*`, and remaining inventory rows.

- [ ] Test TS/JS symbols and imports, workspace package graph, subprocess binary names, download artifact names, scripts, deep links, translation keys, and generated SDK inputs.
- [ ] Transform structured manifests and scoped shell/PowerShell/Ruby/Python/Kotlin/documentation contexts using appropriate parsers or explicitly reviewed literal rules. Reject unsupported contexts.
- [ ] Reuse existing HeyBuddy visual assets; audit legacy assets and update references without synthesizing raster edits in code.
- [ ] Regenerate derived SDK outputs from transformed inputs, never create the forbidden desktop OpenAPI client directory.
- [ ] Validate frozen pnpm installation, typecheck, tests, packaging references, and visual desktop surfaces once authorized.
- [ ] Commit adapters and mapping coverage. Document platform checks that need CI runners.

## Task 6: Runtime Compatibility and Data Migration

**Files:** proposed canonical `crates/goose/src/config/legacy_compat.rs`, `crates/goose/tests/branding_compatibility.rs`; update module registration and inventoried environment/config readers, `crates/goose/src/config/paths.rs`, `ui/desktop/src/appIdentity.ts`, `ui/desktop/src/utils/pathUtils.ts`, and their existing tests. Split this task into file-specific substeps after Task 1 identifies all readers.

- [ ] Test both names, canonical-only, legacy-only, empty/invalid values, preexisting HeyBuddy keys, subprocess propagation, and no-secret logging.
- [ ] Implement explicit compatibility lookup; do not assume one startup rewrite covers library callers or child processes.
- [ ] Test no data, legacy data, new data, both populated, ambiguous ownership, partial migration, backup, and repeat migration using isolated fixtures only.
- [ ] Implement guarded migration and legacy CLI/deep-link policy after user approval. Never touch real user data during tests.
- [ ] Test serialized values and third-party protocol contracts separately from Rust/TS identifier names.
- [ ] Commit canonical compatibility behavior and corresponding conversion rules together.

## Task 7: Upstream Sync Rehearsal and CI

**Files:** create `tools/rebrand/tests/sync.test.mjs`, `.github/workflows/rebrand-verify.yml`, `docs/development/rebranding.md`; extend existing CI only where required.

- [ ] Build a temporary Git fixture with upstream, customized canonical source, and generated branch; add upstream changes to renamed files, new Goose symbols, moves, deletions, and conflicting local customizations.
- [ ] Merge into canonical fixture, regenerate, and prove changes reach renamed output while customizations and intentional deletions survive.
- [ ] Prove unclassified new names fail and semantic conflicts are reported rather than guessed away.
- [ ] Rehearse one recorded upstream update using historical refs in disposable worktrees; report any unavailable objects without changing existing branches.
- [ ] Add CI for rule tests, reproducibility, provenance, residual references, generated drift, and rejection of hand-edited generated source.
- [ ] Run workflows with read-only permissions, no publishing credentials, and no package releases. Define canonical-source CI separately from generated-output CI.
- [ ] Document normal development, hotfix porting, sync, regeneration, and rollback; commit tested tooling/docs.

## Task 8: Full Conversion Pilot and Delivery Gate

**Files:** generated output paths enumerated by inventory; report paths outside generated source; no manually edited generated application files.

- [ ] Generate the complete renamed tree twice from one pinned canonical commit and compare digests.
- [ ] Verify every candidate has a disposition and all preserved Goose occurrences are justified, including notices, maps, fixtures, and aliases.
- [ ] Run generated Rust workspace tests, clippy, desktop/SDK tests and typechecks, supported native builds, CLI smoke tests, and installer checks on supported operating systems.
- [ ] Reconcile the repository feature self-test rule with the existing deliberate deletion recorded in the sync notes: ask before restoring that recipe; agree on an equivalent check or restoration before declaring feature verification complete.
- [ ] Separate known baseline failures from new failures with evidence; never silently waive the coverage or platform gates.
- [ ] Append a pilot generated snapshot with provenance only after checks pass. Do not push, publish, replace installed binaries, or change the role of `main` without authorization.
- [ ] Repeat the sync rehearsal and present results before approving the long-term branch workflow.

## Acceptance and Decisions

Accepted only when renamed sources build and behave correctly, conversion is reproducible, map drift fails visibly, and an upstream update reaches generated output without losing HeyBuddy behavior. A passing search-and-replace audit alone is insufficient.

Approval requested for: canonical-source/generated-output maintenance model; scoped legacy compatibility defaults; authorization to run builds/tests during implementation. Implementation begins with Tasks 1-3 and a prototype review before repository-wide conversion. Exact transformed file/symbol totals are delivered by Task 1, not guessed in advance.
