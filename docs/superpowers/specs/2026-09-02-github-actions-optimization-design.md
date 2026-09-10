# GitHub Actions Optimization Design

Date: 2026-09-02

## Goal

Reduce HeyBuddy CI wall time and runner consumption without removing required release platforms or materially reducing regression coverage.

## Scope

This change optimizes `.github/workflows/ci.yml`, `.github/workflows/mcp-conformance.yml`, release bundle workflows, and their workflow-contract tests. It does not remove Rust or npm dependencies. Dependency pruning will be a separate audited change because the fork currently skips cargo-machete and cargo-deny, and the working tree contains an unrelated `Cargo.lock` modification.

## Check Tiers

Pull requests run fast feedback checks: Rust format, default tests, clippy, desktop lint/tests, schema validation, and one representative TLS backend. Main pushes and merge queue runs add UniFFI, both TLS backends, roaming, MSRV, Windows compilation, and MCP conformance. Scheduled or manual workflows retain the complete compatibility matrix.

Required check names remain stable where possible. A final aggregate gate reports success when intentionally skipped tiered jobs are not required for that event.

## Fast Failure

A lightweight prerequisite validates Cargo locked metadata and pnpm frozen-lock consistency before expensive compilation. Heavy jobs depend on it. The prerequisite must not perform full compilation or duplicate the complete dependency installation cost.

## Caching

Rust caches use separate keys for default tests, UniFFI, clippy, MSRV, TLS variants, roaming, Windows release, CUDA, and target architecture. Cache measurements must include restore time, save time, size, and compile duration.

Node jobs cache the pnpm content-addressable store rather than `node_modules`. Bundle jobs also cache Electron downloads using keys containing operating system, architecture, and lockfile hash. Hermit remains the source of Node and pnpm versions unless a workflow already owns an explicit version.

## Filtering and Concurrency

Documentation-only changes skip heavy code jobs for pull requests, pushes, and merge queue events. Manual dispatch remains able to force the requested checks. Path rules broadly exclude documentation-only changes instead of narrowly listing code paths.

Pull request runs use a PR-scoped concurrency group with cancellation enabled. Push and merge queue events use separate groups so they cannot cancel protected validation.

## Release Workflows

macOS ARM64 and Windows x64 release builds remain mandatory. Artifact boundaries used for signing or permissions remain intact. Release job consolidation is deferred because measured artifact transfer time is much smaller than Windows Rust compilation time.

## Dependency Audit

A later branch will enable fork-compatible unused-dependency checks for Rust and the desktop workspace. Each candidate dependency must be confirmed unused across platform code, feature-gated code, build scripts, tests, and packaging before removal. Cargo dependency changes will use `cargo remove` or `cargo add` as appropriate and keep `Cargo.lock` consistent.

## Verification

Static workflow-contract tests cover event tiers, required job dependencies, cache key separation, path filtering, and concurrency groups. YAML syntax and action references are validated without running full builds unless explicitly requested. After merge, three warm Actions runs establish before/after wall time, runner-minutes, cache hit rate, and restore/save overhead.

Success means PR feedback is faster, obsolete PR runs are cancelled, invalid lock state fails before compilation, main/nightly retains compatibility coverage, and release platforms remain unchanged.

## Non-goals

- Removing macOS ARM64 or Windows x64 release artifacts.
- Deleting dependencies in this branch.
- Introducing self-hosted runners or a custom runner image.
- Weakening the repository's 80% path-coverage requirement.
