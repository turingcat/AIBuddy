# GitHub Actions Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce PR feedback time and runner consumption while retaining full main, nightly, and release coverage.

**Architecture:** A small Ruby contract suite defines event tiers, cache isolation, dependency gates, and release-platform invariants. CI uses a fast prerequisite followed by event-tiered jobs. Reusable release workflows retain platform and signing boundaries while standardizing dependency caches.

**Tech Stack:** GitHub Actions YAML, Ruby Minitest, Cargo, Swatinem/rust-cache, pnpm, Electron Forge.

## Global Constraints

- Branch from `8de1e5047`; do not include the unrelated working-tree `Cargo.lock` change.
- Retain macOS ARM64 and Windows x64 release artifacts.
- Retain at least 80% path coverage and full compatibility checks outside the PR fast tier.
- Do not remove Cargo or npm dependencies in this branch.
- Keep action references SHA-pinned when the current workflow pins them.
- Do not run build/test commands unless the user explicitly authorizes them.

---

### Task 1: Define Workflow Performance Contracts

**Files:**
- Create: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- Reads workflow YAML as text and parsed YAML.
- Asserts PR concurrency, lock prerequisite dependencies, event-tier conditions, Rust cache separation, pnpm store cache, Electron cache, and retained release targets.

- [ ] Write Minitest cases asserting the approved contracts against `ci.yml`, `mcp-conformance.yml`, `bundle-macos.yml`, and `bundle-windows.yml`.
- [ ] Run `ruby scripts/test-ci-performance-contracts.rb`; expect failures for each missing contract.
- [ ] Commit the red tests with `test(ci): define performance contracts`.

### Task 2: Add Fast CI Gate and Event Tiers

**Files:**
- Modify: `.github/workflows/ci.yml`
- Update: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- `changes` reports code/docs-only state for PR, push, and merge queue events.
- `dependency-locks` validates Cargo locked metadata and pnpm frozen lock consistency without compiling.
- Heavy jobs depend on both `changes` and `dependency-locks`.
- PR runs one TLS backend; main, merge queue, and manual runs retain both TLS backends, UniFFI, roaming, MSRV, and Windows build.

- [ ] Add assertions for event expressions, prerequisite `needs`, and unchanged required check names.
- [ ] Add PR-scoped concurrency with separate push and merge-group keys.
- [ ] Implement dependency-lock validation and correct docs-only conditions.
- [ ] Restrict compatibility jobs by event while preserving complete non-PR coverage.
- [ ] Run the contract test; expect Task 2 assertions to pass.
- [ ] Commit with `ci: tier checks and fail fast on lock drift`.

### Task 3: Standardize Rust Caches

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pr-smoke-test.yml`
- Update: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- Default tests, UniFFI, clippy, MSRV, TLS, roaming, Windows, and smoke build use distinct cache identities.
- Toolchain, target, and CUDA/standard boundaries cannot share target artifacts.
- Cache save-on-failure policy avoids uploading failed or invalid builds.

- [ ] Add failing assertions for cache presence and distinct keys.
- [ ] Add `Swatinem/rust-cache` to uncached Rust jobs with job-specific keys.
- [ ] Preserve V8 marker repair before builds that restore target artifacts.
- [ ] Run contract tests and inspect generated cache keys.
- [ ] Commit with `ci: isolate Rust build caches`.

### Task 4: Standardize pnpm and Electron Caches

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pr-smoke-test.yml`
- Modify: `.github/workflows/bundle-macos.yml`
- Modify: `.github/workflows/bundle-windows.yml`
- Update: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- Hermit supplies pnpm where workflows do not already pin Node explicitly.
- Cache paths come from `pnpm store path`; no workflow caches `node_modules`.
- Bundle jobs set and cache `ELECTRON_CACHE` by OS, architecture, and lockfile hash.
- Schema validation performs one workspace install from `ui/`.

- [ ] Add failing assertions for forbidden `node_modules` caches, required pnpm store cache, Electron cache, and one schema install.
- [ ] Replace node_modules caches with pnpm store caches.
- [ ] Add Electron download caches to both desktop bundle jobs.
- [ ] Consolidate schema dependency installation at the workspace root.
- [ ] Run contract tests and commit with `ci: standardize desktop dependency caches`.

### Task 5: Optimize MCP Conformance Scheduling

**Files:**
- Modify: `.github/workflows/mcp-conformance.yml`
- Update: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- PR updates cancel obsolete MCP runs.
- Docs-only changes skip conformance.
- The existing specification/version matrix and expected-failure baselines remain unchanged.
- Main, merge queue, schedule, and manual dispatch retain the complete matrix.

- [ ] Add failing assertions for concurrency, paths, and unchanged matrix entries.
- [ ] Implement filtering and event-separated concurrency groups.
- [ ] Keep artifact fan-out because one build serves all matrix jobs.
- [ ] Run contract tests and commit with `ci: avoid redundant MCP conformance runs`.

### Task 6: Verify Contracts and Measure on GitHub

**Files:**
- Update: `docs/research/2026-09-02-github-actions-build-time.md`

**Interfaces:**
- Local verification checks Ruby syntax, workflow contracts, YAML parsing, and whitespace.
- GitHub verification compares three warm runs against the recorded baseline.

- [ ] Run `ruby -c scripts/test-ci-performance-contracts.rb`.
- [ ] Run `ruby scripts/test-ci-performance-contracts.rb`.
- [ ] Parse modified YAML files with Ruby `YAML.safe_load(..., aliases: true)`.
- [ ] Run `git diff --check` and inspect only intended files are staged.
- [ ] Push the feature branch after user approval and observe three warm Actions runs.
- [ ] Record wall time, runner-minutes, cache hit rate, cache restore/save time, and failures in the research note.
- [ ] Commit measurement documentation with `docs(ci): record optimized Actions timings`.

## Separate Dependency-Pruning Follow-up

Create another branch after this plan. Enable fork-compatible cargo-machete and front-end `knip` reporting, then review every candidate against platform-specific code, Cargo features, build scripts, tests, and packaging. Remove dependencies one at a time with `cargo remove` or `pnpm remove`, keep lockfiles consistent, and verify affected targets. Do not infer that a dependency is unused only because a text search has no direct import.
