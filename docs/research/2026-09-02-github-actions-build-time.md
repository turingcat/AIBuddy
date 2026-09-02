# GitHub Actions Build-Time Baseline

## Scope

This note records the measurements available before the GitHub Actions optimization work on `chore/optimize-github-actions`. It is a baseline only. No optimized workflow run has been authorized or observed, so this document intentionally contains no after measurements, cache hit rates, restore/save timings, or before/after conclusions.

## Baseline Measurements

| Workflow/run | Platform or metric | Measurement |
| --- | --- | --- |
| 33147839567 | Windows total | 119m 33s |
| 33147839567 | Windows compile | 101m 19s |
| 33137493995 | Windows total | 99m 53s |
| 33137493995 | Windows compile | 85m 32s |
| Release 33157330663 | Windows | 89m 01s |
| Release 33157330663 | macOS | 29m 28s |
| CI 33243565459 | Wall time | 49m 43s |
| CI 33243565459 | Runner time | 213m |
| CI 33614283148 | Windows build cache-hit run | 10m 52s |
| CI 33614283148 | Comparable Windows build without cache hit | 42m 32s |

The observed Windows build-cache comparison is approximately 74% lower elapsed time (10m 52s compared with 42m 32s). It is a single baseline observation, not a measured result of this branch.

## Branch Changes Under Measurement

The branch changes the following GitHub Actions behavior:

- CI adds a dependency-lock gate, event-scoped concurrency, and a reduced pull-request compatibility tier while retaining complete non-pull-request coverage.
- CI and smoke workflows isolate Rust build caches by job and build context, preserve V8 marker repair ordering, and restrict cache writes to successful main-equivalent builds.
- CI, smoke, and desktop bundle workflows use the pnpm store rather than `node_modules`; desktop bundles add platform-specific Electron download caches.
- MCP conformance avoids redundant pull-request work, skips documentation-only pull requests, and retains the full matrix for main, merge queue, scheduled, and manual runs.
- The Ruby contract suite asserts the workflow performance and coverage invariants above.

## Pending Authorized Verification

- Run `ruby -c scripts/test-ci-performance-contracts.rb`.
- Run `ruby scripts/test-ci-performance-contracts.rb`.
- Parse each modified workflow with `YAML.safe_load(..., aliases: true)`.
- Run `git diff --check` and confirm only intended files are staged.
- Push the feature branch after approval and collect three warm GitHub Actions runs.
- Record per-run wall time, runner-minutes, cache hit rate, cache restore/save time, and failures; then add the after data and comparison here.

## Current Result Status

No GitHub Actions runs have been triggered for this optimization branch. There is no after data yet.
