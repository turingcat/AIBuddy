# Transformed Upstream Integration Implementation Plan

> Execution authorization update: the user has now approved unit tests, builds and clippy for this implementation. Older pending-authorization statements below are superseded. Push, release, main integration and live-data changes are still separate actions. See `2026-09-07-rebranding-progress.md` for actual verification status.

## Confirmed Main-Based Workflow

The user confirmed that existing `main` remains the sole product mainline. There is no separate long-lived product development branch.

- Feature work: create a feature branch/worktree from current main, implement and verify changes, then merge back into main.
- Upstream sync: create a sync branch/worktree from current main, pin the selected stable upstream release tag to its exact commit, transform it using versioned Goose-to-HeyBuddy rules, merge the upstream increment, verify, then merge back into main.
- The transformed upstream mirror is only an auxiliary baseline/history for incremental three-way merges. It is not a second product branch and does not receive manual product changes.
- Preserve HeyBuddy customizations and intentional deletions. Do not exclude entire customized files: merge nonconflicting upstream improvements in those files and review overlapping semantic changes explicitly.
- Never replace main with a transformed upstream snapshot. Use the previously integrated transformed baseline to distinguish product changes from upstream changes.
- Continue initial migration work in the existing `feat/heybuddy-branding` worktree; do not create redundant product branches. Review current main drift before final integration.


> Use executing-plans for implementation, with tests first and review checkpoints. This is the authoritative plan, replacing both the external-only design and the full-source generated-product plan.

**Goal:** Rename first-party HeyBuddy sources comprehensively, allow normal development in those renamed sources, and receive updates through a reproducible renamed upstream mirror.

**Architecture:** Transform pristine pinned upstream snapshots into an append-only mirror. Merge mirror increments into the independently editable HeyBuddy product branch. Transform the existing customized product tree once during bootstrap; never regenerate that product tree wholesale during routine updates.

**Tech Stack:** Existing Rust/Cargo, TypeScript/pnpm, Electron and Git; proposed standalone Node tooling in `tools/rebrand`, structured manifest parsers and language-aware source adapters. Parser feasibility is an implementation gate.

## Approved Direction

- Product customization is concentrated in desktop, but existing changes elsewhere must also survive.
- CLI, engine, SDK and other first-party sources receive HeyBuddy names without unrelated logic refactors.
- Developers edit renamed product sources directly, including core code when necessary.
- Only the transformed upstream mirror is generated and must not be hand-edited.
- Main remains unchanged during this planning and pilot work. Approval of this direction does not authorize pushing, publishing, force updates, installing binaries, or modifying real user data.

## Branch Roles

| Branch/ref | Responsibility |
| --- | --- |
| Upstream remote refs | Original upstream history, read-only input |
| `upstream/heybuddy-mirror` local branch | Linear transformed upstream snapshots, no product customizations |
| `feat/heybuddy-branding` | Current tool and migration work; then directly editable renamed product pilot |
| `main` | Normal product development after reviewed migration is merged |

Pin the tool commit, map digest, upstream commit, source tree digest and output tree digest for every mirror snapshot. Store operational timestamps outside reproducibility digests. Keep tool implementation and maps in the product repository; the pure mirror does not contain product-specific tooling or CI changes.

## Bootstrap and Git Ancestry

Use `U0` for the verified upstream baseline already integrated into the fork, `H0` for the customized product migration input, and `T_R` for conversion under pinned rules R.

1. Inspect actual ancestry and the previous integration record. The recorded candidate U0 is upstream v1.49.0, `71fc4be1ed729e26b1dc0a4466abdd03be548a53`; verify it is an ancestor of H0 and account for any later upstream integration before choosing it.
2. Generate mirror baseline `M0 = T_R(U0)` and independent product candidate `P0 = T_R(H0)` into fresh staging directories.
3. Use one shared naming policy on both inputs. Product-only rules may apply only to explicitly product-owned paths; they cannot give inherited symbols different target names. Detect existing HeyBuddy name collisions before output.
4. Review the diff M0..P0 against U0..H0 and confirm desktop customizations, core overrides, and intentional deletions survive. Do not infer that everything outside desktop is unmodified.
5. Add a normal rename commit P0 on the product feature history, preserving all existing history. Establish a one-time reviewed merge bridge with first parent P0, second parent M0, and tree identical to P0. M0 must be an isolated mirror baseline, not a rewritten product history.
6. Creating this bridge is an explicit reviewed bootstrap operation, not a generic `merge -s ours` shortcut. Prove that P0 represents M0 plus the retained transformed product delta before recording M0 as integrated.
7. Verify `git merge-base` selects M0 between the bootstrapped product and the next mirror snapshot M1. Exercise a real three-way merge in a disposable repository before integrating any bridge into main.

Keep the mirror snapshot chain independent of raw upstream ancestry: M1 has M0 as its parent and records U1 as provenance. Do not add raw U1 as a merge parent; merging raw history into the product would reintroduce the naming mismatch.

## Routine Updates and Rule Changes

For upstream U1, create M1 = T_R(U1) with parent M0. Merge M1 into a temporary branch based on the current product. Resolve desktop and any other semantic conflicts, verify naming and behavior, then integrate normally. Never overwrite the product with M1. Upstream changes to intentionally deleted files require review, not automatic resurrection.

Desktop may have more conflicts because it is customized. Unmodified core code should generally merge more easily, but there is no conflict-free guarantee.

Change rules separately from upstream functionality: at the current pinned upstream version create and review a mirror rule-migration snapshot, reconcile that delta into the product, then advance upstream. Do not run the full original conversion on the already renamed product. Existing product-only symbols need explicit targeted migrations when target names change.

Fixes to product behavior are normal product commits. Fixes to conversion belong in tooling/rules and must regenerate the affected mirror candidate; no manual mirror hotfixes. Never reverse-replace HeyBuddy into Goose to reconstruct upstream source.

## Naming and Exceptions

- Rename `goose`, `goose-cli`, other first-party crate/package/directory names, `goose_*`, `Goose*`, commands, SDK imports, assets, owned documentation, environment names and protocol names consistently.
- Use `heybuddy`, `heybuddy-cli`, `heybuddy_*`, `HeyBuddy*`, `HEYBUDDY_*` and `heybuddy://` as canonical names. Proposed local JS scope is `@heybuddy`; publishing or external scope ownership is not assumed.
- Do not invent replacement external URLs or change third-party protocol fields just because their values contain Goose.
- Keep accurate copyright/license notices, upstream attribution and dependency identifiers. Mapping inputs, fixtures and intentional compatibility literals are narrow documented exceptions.
- Classify plural names and visual assets explicitly. Reuse existing HeyBuddy assets where appropriate; do not treat binary files as text.
- The release criterion is no unclassified first-party old-brand references, not zero Goose bytes in legal and maintenance material.

## Compatibility and User Data

Canonical runtime names change, but migration is separate from mechanical renaming. Proposed default is legacy environment/config read compatibility, with canonical names used in output and new writes. Check existing `HEYBUDDY_*` semantics before assigning precedence; distinct old and new settings must not collapse silently.

Old executable alias distribution remains a decision before packaging implementation. It is not a substitute for renaming the actual CLI. Legacy deep links, if supported, use identical validation and authorization and must not hijack a separate Goose installation.

Existing data paths, application IDs and credential service names require ownership analysis. Preserve existing HeyBuddy identities when already correct. Never overwrite, delete or migrate ambiguous Goose data automatically. Test migration with fixtures, backups and repeat-run markers, not live user directories. Handle both old/new populated paths and interrupted migration explicitly.

## Tool Contract

Authoritative files: `tools/rebrand/map.json`, `map.schema.json`, and pinned parser dependencies. Each rule has a stable ID, category, explicit selector, old/new target or preservation action, reason, applicability to upstream/product inputs, and validation expectations. Symbol identity includes language, module/package, declaration kind and qualified name; line numbers are diagnostics only.

Generate a file/symbol inventory report rather than manually maintaining a duplicate mapping list. Report unsupported syntax, missing expected selectors, new unclassified matches, overlapping edits and collisions as failures requiring review. Broad regex replacement is not a semantic fallback.

Proposed CLI: `inventory --source-ref`, `generate --source-ref --output`, and `verify --output`. These commands do not exist yet. Git publication/merge is a separately reviewed operation; generation never pushes or mutates source refs.

Read exact Git blobs, exclude worktrees/dependencies/build outputs, preserve modes and safe symlinks, reject path escapes and case-insensitive collisions, refuse existing output directories, stage before publication, and never overwrite a running executable. Repeating the same pinned input into two fresh outputs must produce identical trees. Reject already converted input.

Use structured TOML/JSON/YAML handling, language-aware symbol references, and narrowly scoped literal adapters for scripts/docs. Regenerate derived artifacts from transformed inputs. Preserve dependency resolutions when reconciling lockfiles; reject unrelated version drift. Human-authored Rust dependency additions use `cargo add`.

## Task 1: Inventory and Preservation Baseline

Files: create `tools/rebrand/cli.mjs`, `src/inventory.mjs`, `tests/inventory.test.mjs`, `package.json`; read `docs/upstream-sync-v1.49.0.md`, workspace manifests and existing brand helpers.

- [ ] Verify H0/U0 ancestry and collect exact input commits without fetching or merging newer upstream into the product.
- [ ] Add failing fixture tests for hidden tracked files, binaries, executable modes, symlinks, plurals, case variants and excluded directories; implement read-only inventory.
- [ ] Recount the earlier 1,408 candidate files against both actual inputs; generate symbol/file reports without claiming regex matches are resolved symbols.
- [ ] Classify U0..H0 customization and deletion deltas, including non-desktop changes.
- [ ] Run authorized tests and commit the inventory independently.

## Task 2: Mapping and Safe Conversion Prototype

Files: create `map.json`, `map.schema.json`, `src/rules.mjs`, `src/generate.mjs`, `src/verify.mjs`, `tests/rules.test.mjs`, `tests/generate.test.mjs`, all under `tools/rebrand`.

- [ ] Write failing cases for collisions with existing HeyBuddy names, shadowed variables, overlapping edits, macros, duplicate rules, unsupported syntax and source/output contamination.
- [ ] Prototype TS language-service and Rust lexical/CST adapters on actual CLI/config examples; resolve declarations/references and macro/string implications before approving parser coverage.
- [ ] Implement pinned-input staging, rule validation, provenance and deterministic tree digests.
- [ ] Prove repeated generation is identical, failed runs leave source/output untouched, and already renamed input is rejected.
- [ ] Review the prototype before expanding to full-repository conversion.

## Task 3: Full Mapping Coverage

Files: `tools/rebrand/src/adapters/{rust,toml,typescript,structured,scripts}.mjs`, corresponding `tests/*.test.mjs`, and manifest rules; source scopes are `crates/*`, `Cargo.toml`, `Cargo.lock`, `ui/*`, `Justfile`, `scripts/*`, `.github/workflows/*`, owned docs/assets.

- [ ] Add tests before each adapter for package paths, features, imports, symbols, generated SDKs, shell/PowerShell commands, CLI help, snapshots and assets.
- [ ] Cover actual `goose-cli` package/directory/bin rename and desktop subprocess consumers together.
- [ ] Classify Kotlin/Python/Ruby and other inventory languages with suitable parsers or reviewed literal rules; reject gaps rather than silently skipping them.
- [ ] Reconcile Cargo/pnpm metadata without dependency upgrades; preserve forbidden desktop OpenAPI client deletion.
- [ ] Generate U0 and H0 separately, inspect remaining occurrences, and validate with authorized builds/typechecks/tests.

## Task 4: Compatibility and Existing Product Behavior

Files: existing config-path modules, environment readers, desktop app identity/path/deep-link modules and their tests, located by inventory and addressed at their renamed paths in the product pilot.

- [ ] Decide old CLI alias policy before packaging, and enumerate data/credential ownership before migration.
- [ ] Add tests for both/old/new/empty environment inputs, preexisting HeyBuddy keys, child processes and secret-safe errors.
- [ ] Add migration tests for no/old/new/both data, ambiguity, rollback, repeated and interrupted migration; implement only approved migrations.
- [ ] Keep compatibility behavior as explicit product code/rules, not hidden logic injected inconsistently into pure upstream conversions.
- [ ] Verify retained authentication, model restrictions, localization, disabled telemetry, platform packaging, and intentional upstream deletions.

## Task 5: Bootstrap Ancestry and Sync Rehearsal

Files: `tools/rebrand/tests/sync.test.mjs`, `docs/development/rebranding.md`; temporary Git repositories and separate staging outputs.

- [ ] Write fixture tests for the exact M0/P0/bridge/M1 graph before implementing any real branch bridge.
- [ ] Include product-only desktop changes, core overrides, upstream edits/moves/deletions/new names, and modify/delete conflicts.
- [ ] Prove merge-base is M0, normal product edits survive, intentional deletions are reviewed, and semantic conflicts stop for resolution.
- [ ] Test a naming-rule update separately from an upstream version update.
- [ ] Rehearse on available historical upstream refs in disposable repositories; no changes to main.
- [ ] Review customization equivalence, then establish pilot baseline and bridge; do not use a snapshot overwrite or blanket conflict preference.

## Task 6: CI and Delivery

Files: `.github/workflows/rebrand-verify.yml`, relevant existing CI contracts, `docs/development/rebranding.md` and verification reports.

- [ ] Add read-only CI for tooling tests, provenance, pure-mirror reproducibility, naming audit and sync fixtures.
- [ ] Validate product behavior separately; do not require product tree equality with mirror or block legitimate product edits.
- [ ] Run Rust tests/clippy, desktop/SDK typechecks/tests, CLI smoke checks and supported-platform packaging checks with authorization.
- [ ] Verify changed visible UI surfaces and actual command/help output. Never replace live binaries in place.
- [ ] Preserve and test both agent-loop paths for any behavioral changes. Clarify the self-test recipe rule against its intentional deletion before adding feature acceptance checks.
- [ ] Meet the repository unit-test and at least 80% path-coverage requirement; do not substitute branch/line coverage claims. Report unsupported coverage/platform gates as unmet.
- [ ] Record known baseline failures separately, review final migration, and request authorization before merging to main or pushing.

## Current Status

- [x] User approved the transformed-upstream mirror with direct HeyBuddy development model.
- [x] Scope reflects desktop-focused customization and comprehensive first-party renaming.
- [ ] Implementation, test/build authorization, old CLI alias decision, prototype, migration and verification remain outstanding.

This planning update does not claim the converter exists or that the Git bridge has been tested. Next execution checkpoint is Tasks 1-2, followed by prototype review.
