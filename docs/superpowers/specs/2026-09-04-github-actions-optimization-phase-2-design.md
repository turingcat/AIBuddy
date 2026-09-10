# GitHub Actions Optimization Phase 2 Design

Date: 2026-09-04

## Goal

Reduce HeyBuddy pull request, main-branch, and release runner time and storage while preserving the required Rust, desktop, schema, Windows, and MCP validation coverage.

## Change Selection

The CI change detector will expose separate outputs for Rust, desktop, schema, Windows, and workflow configuration changes. Each job will run only for the paths that can affect its result. Workflow configuration changes intentionally select every tier so CI changes validate their own execution paths.

Documentation-only changes continue to produce a successful aggregate CI gate without starting build jobs.

## Rust Jobs

Rust caching will use only explicit `Swatinem/rust-cache` steps. Every `actions-rust-lang/setup-rust-toolchain` step will set `cache: false`, including jobs that do not need a cache. Cache writes remain restricted to successful main-branch jobs where the workflow already applies that policy.

The TLS variants will run sequentially in one job so they share dependencies and one target directory. Pull requests run rustls only; main pushes, merge groups, and manual runs also run native TLS.

UniFFI and roaming validation will run sequentially in one compatibility job and share one cache. MSRV remains separate because it uses a different toolchain.

## Platform Tiers

Desktop lint and unit tests will run on Ubuntu. macOS remains reserved for application packaging, signing, and launch validation.

Windows validation will use `cargo check` on main pushes. Merge-group and manual CI runs perform a complete Windows build. Release workflows continue to perform release-mode Windows builds and packaging.

## Disk Management

Large Ubuntu Rust jobs will inspect available workspace disk space before deleting preinstalled SDKs. Cleanup runs only when free space is below 25 GiB. This preserves the existing low-disk recovery path without paying its cost on healthy runners.

## MCP Conformance

The private fork will not run MCP conformance on a daily schedule. Pull request, main push, merge-group, and manual triggers remain. Superseded runs for the same event and ref may be cancelled.

## Artifacts

Reusable macOS and Windows bundle workflows will accept an artifact retention input with a seven-day default. Release-candidate builds use fourteen days. Internal transfer artifacts remain at one day. Linux release artifacts use seven days.

## Verification

`scripts/test-ci-performance-contracts.rb` will assert:

- no job combines setup-rust-toolchain's built-in cache with an explicit Rust cache;
- all Rust setup steps disable the built-in cache;
- change categories control the appropriate CI jobs;
- desktop lint runs on Ubuntu;
- Windows main validation uses check while full builds remain available;
- TLS and compatibility checks are consolidated;
- disk cleanup is conditional;
- MCP has no scheduled trigger;
- final build artifacts have bounded retention.

Workflow YAML will be parsed after modification. Full Cargo builds and test suites are outside this workflow-only change unless separately requested.
