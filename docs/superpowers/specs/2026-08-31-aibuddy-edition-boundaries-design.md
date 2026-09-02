# AIBuddy Edition Boundaries Design

## Goal

Make the packaged AIBuddy desktop application consistently identify itself as AIBuddy, display user-visible tool images in the conversation, and present AIBuddy account entitlements without changing HeyBuddy behavior.

## Context

The current AIBuddy package uses the correct bundle name and application icon, but several runtime surfaces still inherit HeyBuddy behavior:

- `BaseChat.tsx` hard-codes the HeyBuddy name, Goose mark, and HeyBuddy repository URL.
- Electron reads `app.getPath('userData')` before setting the edition-specific application name. AIBuddy therefore uses `Application Support/HeyBuddy`, and Electron's generated About, Hide, and Quit menu items use HeyBuddy.
- ACP tool responses preserve image content, but `ToolCallWithResponse` places images inside a collapsed tool-output section. Recent AIBuddy sessions contain complete PNG blocks even though no image is visible in the conversation.
- The shared account trigger places the username and balance on one line. The TFlow adapter calls `/api/v1/subscriptions/summary`, which does not return remaining quota and only models the daily window.

## Product Decisions

- AIBuddy and HeyBuddy share infrastructure but have edition-specific identity and account presentation.
- The AIBuddy header uses the existing full-color AIBuddy application mark, the text `AIBuddy`, and links to `https://tflow.online`.
- The HeyBuddy header and link remain unchanged.
- The AIBuddy macOS menu-bar glyph uses the selected Minimal Bot design. It is a monochrome template asset; macOS controls whether it appears gray, black, or white.
- The AIBuddy account trigger shows only the username and disclosure icon.
- The AIBuddy account menu shows the username first, followed by entitlement information on separate rows.
- A subscription displays only the configured daily, weekly, and monthly windows. Missing windows are hidden.
- Remaining subscription quota comes directly from TFlow's `remaining_usd` fields. The desktop does not derive or clamp it.
- A metered key displays the current account balance.
- HeyBuddy keeps its existing balance presentation.

## Architecture

### Desktop Identity

An identity initializer runs in the Electron main process before the first call to `app.getPath('userData')`.

It sets `app.name` from `getAppDisplayName()`. Electron then creates the correct default application menu labels and resolves AIBuddy's user-data directory as `Application Support/AIBuddy`. The existing About panel configuration continues to use the same display name.

The initializer is a small module with an injected Electron application interface so its ordering and behavior can be unit tested without importing the full main process.

### One-Time AIBuddy Data Migration

On AIBuddy startup, migration checks the legacy HeyBuddy directory only when the corresponding AIBuddy destination file does not exist.

Credentials are migrated only when they decode as `authKind: "sub2api"`. HeyBuddy OA credentials are never copied. General desktop settings may be copied only as part of a confirmed AIBuddy migration. Existing AIBuddy credentials and settings always win.

Writes use the existing credential codec and atomic file replacement patterns. A failed or invalid legacy credential migration leaves the destination untouched and allows the normal AIBuddy login flow to continue.

### Renderer Brand Identity

A renderer component selects header content by `getAppEdition()`:

- HeyBuddy renders the existing Goose mark, `HeyBuddy`, and repository URL.
- AIBuddy renders the full-color AIBuddy mark, `AIBuddy`, and `https://tflow.online`.

This removes product literals from `BaseChat` and keeps the brand decision in one testable component.

### User-Visible Tool Images

Tool result parsing remains unchanged. A helper extracts image blocks whose annotations either include the `user` audience or omit an audience. Assistant-only image blocks remain hidden.

`ToolCallWithResponse` renders extracted images in an always-visible media area immediately below the tool activity card. Text, resource data, logs, and debugging output remain inside the existing expandable output sections. Images are removed from the expandable result list to avoid duplicate rendering.

The existing `ImagePreview` component provides sizing and preview behavior, matching top-level assistant images.

### TFlow Entitlement Model

The AIBuddy panel adapter calls `GET /api/v1/subscriptions/progress` with the panel access token. Each response item contains a subscription and progress object:

```text
subscription.group_id
progress.group_name
progress.daily.remaining_usd
progress.weekly.remaining_usd
progress.monthly.remaining_usd
```

The adapter matches the saved API-key group ID to `subscription.group_id`. A matching active subscription becomes a subscription entitlement containing the configured server-provided values:

```text
remainingUSD.daily?: number
remainingUSD.weekly?: number
remainingUSD.monthly?: number
```

The adapter copies `remaining_usd` without calculating `limit - used`. Missing progress windows are omitted. When no active subscription matches the key group, the adapter returns the account's metered balance.

Panel-token refresh and one-time retry behavior remain unchanged for both account and subscription requests.

### Edition-Specific Account Menu

`UserAccountMenu` selects an edition-specific presentation while continuing to consume `useBalance()`.

The AIBuddy trigger contains the user icon, the username, and the disclosure icon. It does not render `BalanceStatus`. The username receives the available row width and retains truncation protection for pathological lengths, with the full value available as accessible text and hover text.

The AIBuddy menu header displays the username on its own line. Below it:

- subscription entitlements render `Daily remaining`, `Weekly remaining`, and `Monthly remaining` rows for the configured periods;
- metered entitlements render one `Current balance` row;
- loading, unauthorized, and load-failure states reuse the existing refresh and error semantics.

HeyBuddy continues to render its current trigger and balance summary.

### Minimal Bot Menu-Bar Asset

The AIBuddy template glyph is generated deterministically at 22x22 and 44x44 pixels with antialiasing. Its alpha mask contains a rounded robot head, antenna, and two eyes. RGB values are irrelevant to macOS template rendering; only the alpha silhouette is authoritative.

The asset-generation path verifies dimensions, RGBA mode, visible bounds, and non-empty transparent margins so future icon preparation does not regress to the current blob-like silhouette.

## Error Handling

- Identity initialization fails fast for an invalid `APP_EDITION`, matching existing brand helpers.
- Migration never overwrites AIBuddy data and never converts an unrecognized credential payload.
- A 401 from either TFlow panel endpoint follows the existing refresh-token retry path.
- Missing or malformed subscription progress data produces the existing balance-load failure state rather than a fabricated remaining value.
- An image load failure keeps the tool activity visible and exposes the existing image error behavior; it does not hide other tool results.

## Testing

Unit tests cover these path families:

- identity initialization occurs before user-data path capture and uses the edition display name;
- AIBuddy data migration succeeds for `sub2api`, skips OA credentials, preserves existing AIBuddy files, and handles invalid legacy data;
- header identity and destination differ correctly for HeyBuddy and AIBuddy;
- user-visible tool images render outside collapsed output, assistant-only images stay hidden, and text output remains expandable;
- TFlow progress parsing handles daily-only, weekly-only, monthly-only, all-period, unmatched-group, unauthorized, and malformed responses;
- AIBuddy's trigger excludes balance while its menu renders subscription periods or metered balance;
- HeyBuddy retains the existing account presentation;
- generated template PNGs satisfy size and alpha-mask constraints.

New and changed functional paths must maintain at least 80 percent path coverage. Focused Vitest runs execute with both `APP_EDITION=heybuddy` and `APP_EDITION=aibuddy`, followed by desktop type checking and formatting checks for touched files.

## Non-Goals

- Redesigning the full-color AIBuddy application icon.
- Changing HeyBuddy branding, account semantics, or balance API behavior.
- Adding a new TFlow backend endpoint or changing the existing TFlow response contract.
- Displaying assistant-only images intended solely for model vision.
- Migrating HeyBuddy sessions or OA credentials into AIBuddy.
