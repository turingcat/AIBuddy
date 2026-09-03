# Actions Concurrency and Windows Standard-Only Design

Date: 2026-09-03

## Goal

Prevent obsolete GitHub Actions runs from consuming runners after a newer run starts for the same source, and make the Windows bundle workflow build only the supported standard artifact.

## Scope

This change updates CI, macOS bundle, Windows bundle, and workflow-contract tests. It does not change application runtime CUDA support; it removes only the unused CUDA bundle variant from GitHub Actions. Release and canary continue to produce the standard Windows x64 artifact.

## Concurrency

CI uses one concurrency group per pull request or Git ref. Push, pull request, merge queue, and manual runs that resolve to the same source share the group. `cancel-in-progress` is enabled so the newest run replaces an older run for that source.

The reusable bundle workflows use literal platform-specific group prefixes plus the requested checkout ref, falling back to the triggering Git ref. Literal prefixes keep macOS and Windows independent and avoid reusable workflows inheriting a caller workflow name that could collide with the caller.

The effective groups are:

- CI: `ci-<pull-request-number-or-git-ref>`
- macOS bundle: `bundle-macos-<input-ref-or-git-ref>`
- Windows bundle: `bundle-windows-<input-ref-or-git-ref>`

All three groups set `cancel-in-progress: true`.

## Windows Bundle

Remove `windows_variant` from manual and reusable inputs. The workflow always uses `windows-latest`, builds the standard `goose` binary without the `cuda` feature, and uses standard artifact names. Remove CUDA toolkit setup, CUDA environment validation, conditional runner selection, variant cache keys, and `-cuda` artifact suffixes.

The Rust crates may retain their CUDA features because application runtime capability is outside this workflow-only change.

## Verification

Workflow-contract tests verify that:

- CI and both bundle workflows enable cancellation with stable source-specific groups.
- macOS and Windows bundle groups cannot cancel one another.
- Windows bundle exposes no CUDA variant input, CUDA setup, CUDA build feature, or CUDA artifact suffix.
- The standard Windows x64 release target and release/canary callers remain intact.

Run YAML parsing, Actions performance contracts, release workflow contracts, formatting, desktop checks, Rust clippy, and the final GitHub Actions workflows before merging to `main`.
