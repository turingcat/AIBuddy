# HeyBuddy External Branding

## Decision

Apply external HeyBuddy branding while preserving upstream Goose internal naming.
Base commit: `e8da42984`. Branch: `feat/heybuddy-branding`.
This is local fork work, not an upstream issue implementation.

## Scope

- Audit desktop titles, menus, notifications, onboarding, translations, accessibility labels, visible errors, and bundled visual assets.
- Extend the existing `ui/desktop/branding/brands.json` and brand helpers instead of creating a second branding configuration system.
- Audit installer, artifact, executable, and application identity branding; preserve identifiers already used by HeyBuddy installations.
- Provide a HeyBuddy CLI entry point while retaining the existing Goose entry point and upstream crate names. Determine the packaging mechanism during implementation planning.
- Use `heybuddy://` for newly generated product links and retain `goose://` handling for existing links. Route both through the existing validation and authorization checks; account for conflicts when Goose is installed alongside HeyBuddy.
- Update maintained HeyBuddy-facing entry documentation and command examples. Do not globally rewrite the inherited upstream documentation archive.
- Add a versioned branding map and a read-only audit command, covering replacement rules, compatibility exceptions, and upstream-sync checks.

## Non-Goals

- No internal crate, module, source-directory, function, type, or variable renaming merely to remove Goose spelling.
- No global search-and-replace, upstream history rewrite, or independent generated source branch.
- No renaming of `GOOSE_*` environment variables, serialized fields, MCP identifiers, credential service identifiers, or existing data directories.
- No removal or falsification of copyright, license notices, upstream attribution, third-party package names, or authoritative upstream URLs.
- No agent-loop behavior changes.

## Map and Audit

Use a structured manifest with stable rule IDs, explicit file scopes, category, source name, target name or existing brand helper, action, compatibility policy, and verification expectations.

Categories: display text, visual asset, packaging, public entry point, documentation, and preserved reference.
Record intentional old-name uses narrowly, with reasons. Do not use source line numbers as durable identifiers.
Generate file-level findings from these rules instead of manually maintaining a duplicate list of all matching files.

The audit is read-only. Within declared user-facing scopes, unclassified Goose references, missing required targets, and invalid rules must fail the check with actionable file locations. Internal Goose references outside those scopes are allowed.
The map does not instruct Git merge or guarantee conflict-free synchronization.

## Compatibility

Keep current user data, credentials, settings, and environment-variable contracts unchanged.
Preserve old command and deep-link behavior where supported. New and legacy deep links must share the same security checks.
Never mechanically rewrite external destinations to nonexistent HeyBuddy URLs.
Do not replace a running executable in place; use atomic replacement if packaging validation requires installation.

## Upstream Sync

Merge upstream into an integration branch, resolve semantic conflicts, run the branding audit, classify newly introduced user-facing references, then run focused and integration checks before release.
Keep branding changes separate from unrelated functional modifications. Preserve the existing Rust and TypeScript module structure to minimize merge differences.

## Verification

- Add unit tests for every changed functional path and for audit rules, including invalid rules, preserved references, new references, and missing targets.
- Verify brand helpers, localization, both protocol schemes, CLI entry points, packaging metadata, and unchanged configuration lookup.
- Exercise relevant feature paths in `goose-self-test.yaml` when implementation changes features.
- Request authorization before running builds, tests, and clippy, per repository instructions. Run formatting for edited code.
- Target the repository requirement of at least 80% path coverage. Report the actual available coverage metric; line or branch coverage must not be described as path coverage.
- Do not merge or push until the required tests, build checks, clippy, and visual inspection of changed desktop surfaces have been performed. Test old and new links and existing-user settings explicitly.

## Approval Gate

The approach has been selected. This document defines the proposed implementation boundary and requires user review before the implementation plan and code changes.
