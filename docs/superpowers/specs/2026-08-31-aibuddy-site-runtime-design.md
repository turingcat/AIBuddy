# AIBuddy Desktop Site Runtime Design

## Goal

Make the AIBuddy edition a first-class TFlow/sub2api desktop runtime. Its
account, group, gateway, model, provider environment, and menu-bar icon must
not depend on HeyBuddy/OA-specific code paths. HeyBuddy behavior remains
unchanged.

## Runtime Boundary

The main process owns a small site-adapter registry selected from persisted
credentials. Each adapter supplies:

- normalized gateway credentials and provider environment;
- an account snapshot for the sidebar;
- model catalog retrieval;
- site-specific post-login provisioning.

The renderer consumes one account result and one model catalog IPC contract.
It does not receive panel access tokens or gateway API keys.

## Stored Credentials

Replace the edition-agnostic flat record with a versioned normalized record:

- `siteKind`: `oa` or `sub2api`;
- `session`: access token and optional OA PAT;
- `account`: non-sensitive identity fields;
- `target`: optional selected group ID and name;
- `gateway`: provider ID, base URL, and API key.

Existing encrypted and legacy flat OA/AIBuddy records are migrated on read.
The encrypted outer envelope remains unchanged.

## AIBuddy Login And Group Provisioning

After email/password/captcha or TOTP authentication, the sub2api adapter calls
`GET /api/v1/auth/me` with the panel JWT. The displayed account name is the
portion of the returned email before `@`; its USD `balance` is displayed
directly without new-api quota conversion.

The adapter lists active API keys named exactly `AIBuddy`:

1. If an existing key has a `group_id`, use that group and key automatically.
2. If no such key exists, or only ungrouped keys exist, list
   `GET /api/v1/groups/available` and show a required group-selection step.
3. On confirmation, reuse only an active `AIBuddy` key for that group, or
   create one with that `group_id`.
4. Fetch a non-empty `/v1/models` catalog with the resulting group key before
   persisting credentials.

Ungrouped historical keys are never deleted or reused. No available groups or
a malformed/empty catalog leaves the user on the login flow with an actionable
error and without writing credentials.

## Sidebar And Models

The shared balance hook receives the adapter account snapshot. For AIBuddy it
shows the email-derived name and USD balance; fields unavailable from sub2api,
such as used quota and request count, are omitted from the tooltip. HeyBuddy
retains its existing PAT/new-api account and currency behavior.

After AIBuddy credentials are saved, the renderer refreshes its provider
inventory and the adapter model catalog. The first returned model becomes the
configured default model, replacing the legacy `heybuddy/glm-5.2` default.
The model switcher reads the same adapter catalog, so login and manual model
selection cannot disagree.

## Branding

Add monochrome `aibuddy/iconTemplate.png` and `aibuddy/iconTemplate@2x.png`
assets derived from the approved AIBuddy mark. The tray resolver selects the
edition-specific template asset while preserving macOS template rendering and
the existing HeyBuddy assets.

## Errors And Security

The renderer receives categorized account/model failures only. Panel JWTs and
API keys remain in the main process and encrypted credential store, and are
not logged. Authentication failure, unavailable groups, and model provisioning
errors retain the user on the appropriate login step.

## Verification

Focused Vitest coverage must include legacy credential migration, adapter
selection, TFlow account parsing, grouped-key reuse, ungrouped-key group
selection, key creation, non-empty catalog enforcement, sidebar rendering,
post-login first-model selection, and edition-specific tray asset resolution.
The affected paths must retain at least 80% coverage. Run formatting and the
targeted desktop test suite before completion.
