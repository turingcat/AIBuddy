# AIBuddy Product Separation and Independent Data Design

## Goal

Turn this repository into a single-product AIBuddy fork while retaining the inheritance chain `Goose -> HeyBuddy -> AIBuddy` for reusable development.

AIBuddy must not contain or expose HeyBuddy branding, OA login, `ai.linyeyun.cn`, or HeyBuddy-specific provider behavior. It must not read or copy HeyBuddy credentials, settings, model configuration, extensions, OAuth state, or session history.

## Repository Inheritance

The repositories use this branch topology:

```text
aaif-goose/goose
        |
        v
HeyBuddy shared: Goose updates and reusable product-neutral improvements
        |                                      |
        v                                      v
HeyBuddy main: HeyBuddy branding and OA        AIBuddy main: AIBuddy branding and TFlow
```

The AIBuddy repository keeps `turingcat/HeyBuddy` as its Git upstream. Routine synchronization targets `upstream/shared`, not `upstream/main`.

HeyBuddy first integrates official Goose changes into `shared`. After verification, HeyBuddy `main` and AIBuddy consume those changes independently.

### Shared Branch Contract

The HeyBuddy `shared` branch may contain:

- official Goose updates;
- engine fixes and provider-neutral backend improvements;
- generic desktop interaction and accessibility improvements;
- reusable localization and product-neutral copy infrastructure;
- build, test, and release tooling without product identity or service coupling.

It must not contain:

- HeyBuddy or AIBuddy product names, identity prompts, icons, bundle identifiers, or URL schemes;
- OA, TFlow, Sub2API, or other product-account integrations;
- product service hosts or product-specific environment variables;
- product-specific providers, credentials, entitlements, quotas, or migration rules.

Mixed changes must be split in HeyBuddy before promotion to `shared`. Shared code may expose a product-neutral interface, while each product branch owns its implementation.

## Single-Edition AIBuddy

AIBuddy no longer carries runtime or build-time selection between HeyBuddy and AIBuddy. These become fixed AIBuddy behavior:

- application name, package name, bundle ID, executable name, icons, tray assets, and URL scheme;
- TFlow/Sub2API authentication and account entitlement behavior;
- the AIBuddy provider and its environment variables;
- visible application copy and assistant identity.

Remove the HeyBuddy brand manifest entry, OA login form and IPC handler, `ai.linyeyun.cn` configuration, HeyBuddy provider, HeyBuddy-only assets, and their dedicated tests.

Generic Goose names may remain when they are protocol, crate, binary, configuration, or compatibility identifiers. They must not produce visible HeyBuddy identity or access HeyBuddy services.

## Current Data Problem

Electron assigns AIBuddy its own `userData` directory, but the desktop currently copies compatible credentials and settings from the sibling HeyBuddy directory on first launch.

The embedded Goose backend is a separate data boundary. Without an explicit `GOOSE_PATH_ROOT`, it uses shared platform defaults. AIBuddy can therefore reuse an existing `config.yaml`, models, extensions, provider state, and `sessions/sessions.db` created by HeyBuddy or another Goose client.

## Data Ownership

AIBuddy owns two nested data areas:

- Electron application data lives in the operating-system `userData` directory selected after `app.setName("AIBuddy")`.
- Embedded Goose data lives under `<AIBuddy userData>/goose`, supplied to the backend as `GOOSE_PATH_ROOT`.

The Goose root contains separate `config`, `data`, and `state` directories. This isolates configuration, providers, models, secrets, extensions, recipes, OAuth tokens, scheduler state, caches, and `data/sessions/sessions.db` through Goose's existing `Paths` abstraction.

## Startup and Migration

Application identity initialization returns the AIBuddy Electron paths and application-owned Goose root. Every embedded `goose serve` process receives that root through `GOOSE_PATH_ROOT`.

The application-owned root takes precedence over inherited `GOOSE_PATH_ROOT` values for packaged and local AIBuddy desktop runs. The standalone Goose CLI remains unchanged.

AIBuddy does not import any data from HeyBuddy. Remove the automatic legacy migration call and its dedicated implementation. A clean launch enters the AIBuddy login flow and lets Goose initialize new configuration and session storage inside the AIBuddy root.

Existing AIBuddy-owned data is preserved. No HeyBuddy data is deleted or modified. External-backend mode does not copy local data; returning to the embedded backend restores the AIBuddy-owned root.

## Components

### Application Identity

`appIdentity` initializes the AIBuddy application name before resolving `userData` and returns the application-owned Goose root.

### Backend Environment

The main process composes the embedded backend environment from AIBuddy credentials and application identity. It always supplies the owned root and selects the AIBuddy provider. HeyBuddy credential mapping is removed.

### Product Authentication

The renderer exposes only the AIBuddy login form. The main process registers only the TFlow/Sub2API authentication IPC handlers. OA request code and configuration are removed.

### Product Identity

Brand and packaging helpers become AIBuddy-only. Visible prompts, chat identity, account text, deep links, and application metadata use AIBuddy without an edition conditional.

## Error Handling

Path construction is deterministic and performs no migration I/O. Directory creation remains with the existing Goose path and configuration layers, preserving their startup diagnostics.

There is no fallback from AIBuddy to a shared Goose path, HeyBuddy login, or HeyBuddy provider.

## Testing

Tests cover these public boundaries:

1. Identity initialization sets the AIBuddy name before resolving `userData` and returns `<userData>/goose`.
2. Backend environment composition overrides inherited `GOOSE_PATH_ROOT` with the AIBuddy-owned root.
3. Embedded `goose serve` receives the isolated root and AIBuddy provider credentials.
4. Startup has no HeyBuddy-to-AIBuddy migration dependency.
5. Authentication exposes only TFlow/Sub2API and cannot invoke an OA IPC path.
6. Brand, packaging, deep links, visible identity, provider defaults, and account presentation resolve only to AIBuddy.
7. Verification rejects active references to the HeyBuddy service host and removed OA configuration outside historical documentation.

Tests are added test-first in vertical slices. Changed functional code must maintain at least 80% path coverage.

## Synchronization Procedure

1. HeyBuddy integrates a Goose release into `shared` and verifies shared behavior.
2. HeyBuddy `main` merges `shared` and resolves its product-layer integration.
3. AIBuddy fetches HeyBuddy and merges `upstream/shared` into a synchronization branch.
4. AIBuddy verifies that product-boundary checks still reject HeyBuddy OA, host, provider, branding, and migration code.
5. AIBuddy completes its test and review workflow before merging to `main`.

Direct merges from HeyBuddy `main` into AIBuddy are not normal workflow. Exceptional cherry-picks must be checked for product dependencies and should preferably be promoted to `shared` first.

## Non-Goals

- Deleting or modifying existing HeyBuddy data.
- Automatically importing selected HeyBuddy settings or sessions.
- Renaming Goose CLI binaries, environment variables, or Rust crates.
- Changing standalone Goose CLI default directories.
- Moving data owned by an external Goose backend.
- Rewriting historical design documents or Git history to erase past references.
- Creating or protecting the HeyBuddy `shared` branch from this repository.

## Verification

Focused desktop unit tests verify product, path, authentication, and backend environment contracts. Formatting is always run. Build, full tests, type checking, and linting are run only when explicitly requested, in accordance with repository instructions.

For a manual package check, launch HeyBuddy with recognizable models and sessions, then launch a clean AIBuddy package. AIBuddy must request its own login and show no HeyBuddy models or sessions. Creating AIBuddy state must not change HeyBuddy state.
