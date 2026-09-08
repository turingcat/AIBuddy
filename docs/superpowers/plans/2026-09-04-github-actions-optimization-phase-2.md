# GitHub Actions Optimization Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce HeyBuddy CI and release time, runner usage, cache churn, and artifact storage without removing required validation tiers.

**Architecture:** Extend the existing Ruby workflow-contract suite first, then update CI selection, consolidated Rust jobs, platform tiers, MCP triggers, and reusable bundle retention. GitHub Actions YAML remains the production interface and the contract suite verifies its behavior statically.

**Tech Stack:** GitHub Actions YAML, Ruby Minitest, Cargo, Swatinem/rust-cache, pnpm

## Global Constraints

- Work from a new branch based on `origin/main`.
- Preserve the aggregate `CI Gate` contract.
- Keep complete Windows release builds and macOS release packaging.
- Do not run full Cargo build, test, or clippy commands without separate authorization.

---

### Task 1: Define Phase 2 Workflow Contracts

**Files:**
- Modify: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- Reads workflow YAML and shell command text.
- Produces failing assertions for every approved optimization.

- [ ] Add assertions for one Rust cache mechanism, path categories, Ubuntu desktop tests, Windows tiers, consolidated jobs, conditional cleanup, MCP triggers, and artifact retention.
- [ ] Run `ruby scripts/test-ci-performance-contracts.rb` and confirm the new assertions fail for the missing behavior.

### Task 2: Optimize Main CI Structure

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- `changes` produces `rust`, `desktop`, `schema`, `windows`, and `workflow-config` outputs.
- `rust-compatibility` replaces separate UniFFI and roaming jobs.
- `rust-build-and-test-tls` runs one or two TLS backends according to event tier.
- `rust-build-windows` checks on main and builds on merge-group/manual runs.

- [ ] Implement categorized path filtering and category-aware job conditions.
- [ ] Disable setup-rust-toolchain caching and retain explicit job caches.
- [ ] Consolidate TLS and compatibility jobs.
- [ ] Move desktop lint/tests to Ubuntu.
- [ ] Make disk cleanup conditional below 25 GiB.
- [ ] Update the aggregate gate for category-aware expected results.
- [ ] Run the contract suite until CI assertions pass.

### Task 3: Optimize MCP and Supporting Rust Workflows

**Files:**
- Modify: `.github/workflows/mcp-conformance.yml`
- Modify: `.github/workflows/pr-smoke-test.yml`
- Modify: `.github/workflows/model-toolcall-conformance.yml`
- Modify: `.github/workflows/docs-update-cli-ref.yml`
- Modify: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- No workflow enables setup-rust-toolchain's built-in cache.
- MCP has no schedule and cancels superseded runs.

- [ ] Remove MCP's daily schedule and update concurrency.
- [ ] Disable built-in Rust cache wherever setup-rust-toolchain is used.
- [ ] Add an explicit cache to the model tool-call build.
- [ ] Run the contract suite until supporting-workflow assertions pass.

### Task 4: Bound Build Artifact Retention

**Files:**
- Modify: `.github/workflows/bundle-macos.yml`
- Modify: `.github/workflows/bundle-windows.yml`
- Modify: `.github/workflows/build-cli-linux.yml`
- Modify: `.github/workflows/release-branches.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/test-ci-performance-contracts.rb`

**Interfaces:**
- Bundle workflows accept `artifact_retention_days`, defaulting to seven.
- Release candidates pass fourteen days.
- Final uploads use the configured retention.

- [ ] Add retention inputs to reusable and manual bundle entry points.
- [ ] Set final artifact retention and keep internal artifacts at one day.
- [ ] Run Windows CLI compression on Ubuntu.
- [ ] Run the contract suite until artifact assertions pass.

### Task 5: Verify Workflow Configuration

**Files:**
- Verify all modified workflow and documentation files.

- [ ] Run `ruby -c scripts/test-ci-performance-contracts.rb`.
- [ ] Run `ruby scripts/test-ci-performance-contracts.rb`.
- [ ] Parse every modified workflow with `YAML.safe_load(..., aliases: true)`.
- [ ] Run `git diff --check`.
- [ ] Review `git diff --stat` and `git status --short` for scope.
