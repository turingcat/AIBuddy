# HeyBuddy v1.50 synchronization

This synchronization uses HeyBuddy `389b6a5b09c1e27cc85ff1c42d37d1b20f2a4e01`
(Goose v1.50.0) as its source. The user explicitly approved using `upstream/main`
because HeyBuddy has no `shared` branch. The raw source is transformed before
merging; raw `upstream/main` is not a parent of this synchronization merge.

## Provenance

- Product baseline: `58734ec0e` (the previously reviewed local branding/bootstrap work, not yet on `main`).
- Previous source: `ad5c466ccd64e26b40db5ff9650addc643ce1d58`.
- Previous mirror: `e3aea38cbf3f260fd75aa4edfcfe93ad2ee1a1c5`.
- Mapping update: `d81baa4dc`.
- New mirror: `f555afac88e04c9f69bb0e40d6bdcbc8f4301ace`.
- Transformed tree: `b8cdb5c5793182f5d945ef385aecfaad82f7ed82`.
- Two independently generated snapshots verified with identical output digest:
  `3b1a7e1893c794e4852ca973e67147a4f90fe081efd47f46c916c2ac542ecac3`.

The mapping extension enumerates new upstream release scripts and ACP package
documentation. Whisper tokenizer vocabulary is preserved byte-for-byte while its
crate path is renamed; vocabulary tokens are not product identifiers.

## Product boundaries retained

- tflow URL, sub2api authentication, login UI, gateway credentials, entitlements,
  balance and recharge behavior, product assets and desktop identity.
- AIBuddy's existing Windows installer names, COS destination, artifact reuse,
  x32 portable packaging, and release workflows. HeyBuddy's replacement Win7 and
  versioned COS publication pipeline is excluded as one coherent product change.
- Migration from both `goose_mode` and `heybuddy_mode`, including rejection of
  ambiguous schemas. The upstream missing-mode repair is retained for current
  schema versions; tests prepare legacy databases before lazy initialization.
- AIBuddy provider registration. An inherited contradictory test assertion that
  the same provider was both absent and valid now checks actual registration.

Product-neutral changes include agent/tool operations, local model discovery,
provider updates, legacy/state-machine telemetry parity, ACP client packaging,
schedule UI, and Electron fetch/file-access compatibility. Auth/runtime IPC use
the Chromium-backed fetch compatibility adapter without changing authentication.
Owned npm package metadata and the release-preparation repository default point
to `turingcat/AIBuddy`.

Retained Windows scripts now use `build-aibuddy-acp-client`. CI contract tests
track the renamed packages, new ACP job, actual workflow filenames, and the
existing pull-request/manual trigger policy.

## Verification

- Core Rust library: 2231 tests passed.
- Agent, provider types, providers and local inference: 887 unit tests passed;
  tool-operation integration: 12 tests passed.
- Final desktop: 160 files / 1304 tests passed with Hermit Node 24.10.0.
- Desktop typecheck and product-boundary checks passed.
- ACP client generation/build and npm version check passed; launcher/resolver:
  13 tests passed.
- Rebrand tooling: 183 tests passed. Declared decision-path scenarios: 17/17.
  This bounded measure is not a whole-repository 80% path-coverage claim.
- CI contracts: 48 tests / 1380 assertions passed; architecture checks: 9 passed.
- Windows workflow contracts: 10 passed; COS upload contract tests: 15 passed;
  release consumer checks passed.
- `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all -- --check`, and
  `git diff --check` passed.

Native Windows/macOS packaged applications and live tflow sign-in were not run.
The PR includes the earlier local branding/bootstrap history because the target
`main` branch does not contain it yet. No merge into `main` or release is performed.

## Publication history repair

GitHub rejected the initial push because five earlier local commits contained a
258 MB generated `ui/desktop/src/bin/goose` executable. The final product tree
already omitted it. Only that historical blob was removed before publishing;
the original branch remains locally at
`sync/heybuddy-v1.50-aibuddy-20260910-full-history`.

The repair rewrote 11 local commit IDs and verified that the merge tree remained
exactly `3c12f6af42f227db2ccc827c49dc6460724c96f5`, retaining both transformed mirror
commits unchanged. The baseline/mapping IDs above identify original local commits;
[the history map](heybuddy-sync-2026-09-10-history.json) records their published
counterparts. No remote history or `main` was rewritten. This documentation was
added after that byte-identical tree verification.
