# HeyBuddy Main to AIBuddy Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize `upstream/main` at `ad5c466cc` into AIBuddy while converting first-party Goose and HeyBuddy source identity to AIBuddy through a reusable mapping workflow.

**Architecture:** The product branch receives upstream changes through a dedicated sync branch. A versioned transformer under `tools/aibuddy-rebrand` converts committed Goose or HeyBuddy snapshots to AIBuddy and records per-file provenance; an `upstream/aibuddy-mirror` branch stores only transformed upstream snapshots so later updates use ordinary three-way merges. Product-owned authentication, service endpoints, credentials, data migration, assets, release names, and visible identity remain AIBuddy-specific.

**Tech Stack:** Git, Node.js ESM, TypeScript parser, Rust parser helper, Cargo, pnpm, Electron.

## Global Constraints

- Upstream input is exactly `upstream/main@ad5c466cc` unless a later explicit fetch changes the selected commit.
- Convert first-party `Goose`, `goose`, `GOOSE`, `Geese` and HeyBuddy equivalents to AIBuddy equivalents.
- Preserve authoritative external URLs, legal attribution, third-party registry identifiers, and explicitly supported legacy configuration inputs.
- Keep AIBuddy authentication, TFlow service configuration, provider entitlements, data isolation, icons, installer identity, and artifact naming.
- Do not merge or push to `main` in this task.
- Run `cargo fmt`, the rebrand unit tests, focused desktop tests, product-boundary checks, and clippy before declaring the sync ready.

---

### Task 1: Merge the selected upstream commit

**Files:**
- Modify: repository files changed by `upstream/main@ad5c466cc`
- Preserve: AIBuddy-owned product files identified by `AGENTS.md` and `ui/desktop/scripts/check-product-boundary.js`

**Interfaces:**
- Consumes: clean branch `sync/heybuddy-main-aibuddy-map-20260908`
- Produces: a resolved Git merge containing upstream v1.49.0 and HeyBuddy source-renaming changes

- [ ] **Step 1: Merge without committing**

```bash
git merge --no-commit --no-ff upstream/main
```

- [ ] **Step 2: Resolve conflicts by semantic ownership**

Use upstream for product-neutral engine and tooling changes. Preserve or port AIBuddy behavior for product identity, authentication, service endpoints, credentials, data migration, assets, packaging, and release workflows.

- [ ] **Step 3: Audit unresolved files**

```bash
git diff --name-only --diff-filter=U
git status --short
```

- [ ] **Step 4: Commit the resolved upstream merge**

```bash
git commit -m "merge: sync HeyBuddy main before AIBuddy conversion"
```

### Task 2: Add the reusable AIBuddy conversion map

**Files:**
- Create: `tools/aibuddy-rebrand/`
- Create: `tools/aibuddy-rebrand/map.json`
- Create: `tools/aibuddy-rebrand/production-policy.json`
- Create: `tools/aibuddy-rebrand/text-policy.json`
- Create: `docs/development/aibuddy-upstream-sync.md`
- Test: `tools/aibuddy-rebrand/tests/`

**Interfaces:**
- Consumes: committed Git snapshots containing Goose, HeyBuddy, or mixed first-party naming
- Produces: deterministic AIBuddy-named snapshots with `.aibuddy-rebrand.json` provenance

- [ ] **Step 1: Port the parser-backed upstream transformer**

Copy the reviewed upstream transformer into `tools/aibuddy-rebrand` and parameterize its source brand variants, target brand forms, provenance filename, mirror branch, and application branch.

- [ ] **Step 2: Define exact canonical mappings**

```json
{
  "sourceBrands": ["goose", "Goose", "GOOSE", "geese", "Geese", "GEESE", "heybuddy", "HeyBuddy", "HEYBUDDY", "heybuddies", "HeyBuddies", "HEYBUDDIES"],
  "target": {
    "lower": "aibuddy",
    "title": "AIBuddy",
    "upper": "AIBUDDY",
    "pluralLower": "aibuddies",
    "pluralTitle": "AIBuddies",
    "pluralUpper": "AIBUDDIES"
  }
}
```

- [ ] **Step 3: Define preservation rules**

Preserve external repository slugs such as `aaif-goose/goose`, third-party package identities such as `v8-goose` and `v8_goose`, legal attribution, and legacy `GOOSE_*` inputs in explicitly listed compatibility modules. Do not preserve active HeyBuddy product identity.

- [ ] **Step 4: Add unit tests**

Cover mixed Goose and HeyBuddy identifiers, plural forms, package scopes, path moves, external URL preservation, third-party dependencies, legacy environment aliases, target collisions, and deterministic provenance.

- [ ] **Step 5: Document future synchronization**

Document fetch, snapshot generation, mirror append, sync merge, product-boundary audit, test, and rollback commands with exact branch roles.

### Task 3: Convert the merged product tree

**Files:**
- Modify: all first-party paths and source references reported by the converter
- Preserve: product-specific AIBuddy files and explicit compatibility exceptions

**Interfaces:**
- Consumes: the resolved merge commit from Task 1 and `tools/aibuddy-rebrand`
- Produces: a fully AIBuddy-named product source tree

- [ ] **Step 1: Generate two product snapshots**

```bash
node tools/aibuddy-rebrand/cli.mjs generate --source-ref HEAD --output /tmp/aibuddy-product-a --input product
node tools/aibuddy-rebrand/cli.mjs generate --source-ref HEAD --output /tmp/aibuddy-product-b --input product
```

- [ ] **Step 2: Verify deterministic output**

```bash
node tools/aibuddy-rebrand/cli.mjs verify --output /tmp/aibuddy-product-a
node tools/aibuddy-rebrand/cli.mjs verify --output /tmp/aibuddy-product-b
```

Compare the two provenance output digests and stop on any unresolved occurrence.

- [ ] **Step 3: Apply the verified snapshot**

Run `applySnapshot` first in dry-run mode, inspect all added, removed, renamed, and modified paths, then apply it to the sync branch.

- [ ] **Step 4: Commit the conversion**

```bash
git commit -am "refactor: convert synchronized sources to AIBuddy"
```

Add newly created paths before committing.

### Task 4: Establish the transformed upstream mirror

**Files:**
- Git ref: `upstream/aibuddy-mirror`
- Create: transformed snapshot outside the worktree
- Create: mirror provenance in the mirror commit message

**Interfaces:**
- Consumes: `upstream/main@ad5c466cc` and the committed AIBuddy transformer
- Produces: a product-neutral AIBuddy upstream mirror commit for later incremental syncs

- [ ] **Step 1: Generate and verify the upstream snapshot**

```bash
node tools/aibuddy-rebrand/cli.mjs generate --source-ref ad5c466cc --output /tmp/aibuddy-upstream-ad5c466cc --input upstream
node tools/aibuddy-rebrand/cli.mjs verify --output /tmp/aibuddy-upstream-ad5c466cc
```

- [ ] **Step 2: Create the mirror commit**

Use the mirror helper to write the verified snapshot as the first commit on `upstream/aibuddy-mirror`, excluding `.aibuddy-rebrand.json` from the mirror tree while retaining provenance trailers in the commit message.

- [ ] **Step 3: Record the mirror baseline in sync documentation**

Record the exact source commit, source tree, transformed tree, output digest, transformer identity, and sync branch commit.

### Task 5: Verify product behavior and boundaries

**Files:**
- Test: `tools/aibuddy-rebrand/tests/`
- Test: `ui/desktop/scripts/check-product-boundary.test.js`
- Test: changed Rust and desktop modules

**Interfaces:**
- Consumes: converted product tree and mirror baseline
- Produces: evidence that the branch is ready for review, without merging to `main`

- [ ] **Step 1: Format changed Rust code**

```bash
cargo fmt
```

- [ ] **Step 2: Test the converter and native parser**

```bash
cd tools/aibuddy-rebrand && npm test
cargo test --locked --manifest-path tools/aibuddy-rebrand/rust-parser/Cargo.toml
```

- [ ] **Step 3: Run product boundary and focused desktop checks**

```bash
cd ui/desktop && pnpm run check:product-boundary
cd ui/desktop && pnpm test -- --run scripts/check-product-boundary.test.js scripts/brand.test.js src/appIdentity.test.ts
cd ui/desktop && pnpm run typecheck
```

- [ ] **Step 4: Run Rust tests and clippy**

```bash
cargo test -p aibuddy
cargo clippy --all-targets -- -D warnings
```

- [ ] **Step 5: Audit residual product names**

```bash
rg -n "HeyBuddy|heybuddy|HEYBUDDY" --glob '!docs/superpowers/**' --glob '!tools/aibuddy-rebrand/tests/**'
git status --short --branch
```

Classify every residual as an explicit compatibility or historical exception; active HeyBuddy product identity is a failure.
