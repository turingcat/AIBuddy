# GitHub Actions Build-Time Baseline

## Scope

This note records the measurements available before the GitHub Actions optimization work on `chore/optimize-github-actions`. It is a baseline only. No optimized workflow run has been authorized or observed, so this document intentionally contains no after measurements, cache hit rates, restore/save timings, or before/after conclusions.

## Windows Bundle Baseline

The three runs below are successful `workflow_dispatch` executions of `Bundle CLI and Desktop (Windows)` on `main`. Total wall time is the run's GitHub `created_at` to `updated_at` duration. Rust compile time is the `Build Windows executable` step in the `Build Goose (Windows)` job. This is the comparison scope for the three-run baseline; it does not compare overall CI or release workflows.

| Run | UTC time | Head ref / SHA | Total wall | Rust compile | Warm | Rust cache hit |
| --- | --- | --- | --- | --- | --- | --- |
| [32649684112](https://github.com/turingcat/HeyBuddy/actions/runs/32649684112) | 2026-08-23 15:48:08 to 17:43:45 | `main` / `36267cf735fa55201ba030de5877ec168ad9471c` | 115m 37s | 104m 49s | unknown | unknown |
| [33137493995](https://github.com/turingcat/HeyBuddy/actions/runs/33137493995) | 2026-08-28 02:58:07 to 04:38:00 | `main` / `3173ce719aad78a2a08351538d32cb950926aa50` | 99m 53s | 85m 32s | unknown | unknown |
| [33147839567](https://github.com/turingcat/HeyBuddy/actions/runs/33147839567) | 2026-08-28 06:24:59 to 08:24:32 | `main` / `de2393403508eccfaf795d4cecf8955586b6cd70` | 119m 33s | 101m 19s | unknown | unknown |

GitHub's run API exposes successful `Cache Rust dependencies` steps but not their cache-hit outcome. Therefore neither a warm-run classification nor a Rust cache-hit claim is inferred for these three runs.

## Supporting Diagnostics

These are supporting samples, not part of the three-run Windows Bundle baseline above.

| Run | Workflow and metadata | Observation | Scope and cache status |
| --- | --- | --- | --- |
| [33157330663](https://github.com/turingcat/HeyBuddy/actions/runs/33157330663) | `Release`; push; `v1.0.1`; `de2393403508eccfaf795d4cecf8955586b6cd70`; 2026-08-28 08:56:32 to 10:35:54 UTC; conclusion: failure | Windows 89m 01s; macOS 29m 28s | Release platform-job timings; warm/cache status unknown. |
| [33243565459](https://github.com/turingcat/HeyBuddy/actions/runs/33243565459) | `CI`; push; `main`; `2e0b4332bd8baa31796eb0f0eeb1236cf9790653`; 2026-08-29 08:36:43 to 09:26:26 UTC; conclusion: failure | Wall 49m 43s; runner time 213m | CI diagnostic sample, not a Windows Bundle warm baseline; cache status unknown. |
| [33614283148](https://github.com/turingcat/HeyBuddy/actions/runs/33614283148) | `CI`; push; `main`; `7590b095b6dad25401193505e3c4de823f219beb`; 2026-09-02 09:28:17 to 09:55:21 UTC; conclusion: failure | Supplied diagnostic: Windows build cache-hit run 10m 52s versus 42m 32s without cache hit, approximately 74% lower elapsed time | Single CI Windows-build comparison, not a three-run warm baseline. Cache hit is reported by the supplied baseline; the queried run metadata does not expose cache restore/save telemetry. |

The 33614283148 comparison is a baseline diagnostic observation, not a measured result of this branch.

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
