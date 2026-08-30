# AIBuddy Identity Repair Design

## Objective

Make the AIBuddy macOS build visibly and behaviorally independent from HeyBuddy: use the selected `b-sproutbuddy` icon and route unauthenticated users through the existing Sub2API/TFlow login implementation instead of the HeyBuddy OA login.

## Scope

- Integrate `feat/aibuddy-sub2api-login`, which supplies the already-tested per-edition authentication implementation.
- Keep HeyBuddy on its existing OA endpoint and form.
- Give AIBuddy the existing `b-sproutbuddy` asset as a distinct macOS application and runtime window icon.
- Centralize icon selection in the versioned brand manifest so Forge and Electron main process consume the same identity record.
- Rebuild and verify a macOS ARM64 AIBuddy package.

## Architecture

`branding/brands.json` becomes the complete build identity source. In addition to the existing product, bundle, protocol, and Windows identity fields, each edition declares its authentication mode, authentication base URL, and icon resource stem. Vite injects the selected authentication configuration; Forge uses the selected icon stem for the packaged application, and the main process uses the same selected resource for the runtime window icon.

The merged authentication branch selects `AIBuddyLoginForm` only when the runtime edition is `aibuddy`. It invokes the Sub2API/TFlow IPC client and its captcha flow. The existing OA login form and IPC path stay isolated to `heybuddy`.

## Asset Handling

The selected source is `branding/heybuddy-icon-b-sproutbuddy-macos-1024.png`. A macOS `.icns` and runtime PNG are generated from that source under `ui/desktop/src/images/aibuddy/`; the shared HeyBuddy images remain unchanged. A manifest path identifies the AIBuddy icon, avoiding edition checks or literal image paths outside the manifest-driven resolver.

## Error Handling

Unknown or absent `APP_EDITION` continues to fail before packaging. Authentication mode and icon path are required fields in each brand record. The AIBuddy login form reports captcha and Sub2API failures in the form without falling back to OA.

## Verification

- Unit tests cover both brand records' authentication and icon metadata.
- Focused login tests prove AIBuddy renders the Sub2API form and HeyBuddy renders OA.
- Forge and main configuration tests prove AIBuddy selects its icon rather than `src/images/icon`.
- Existing authentication branch tests, desktop typecheck, i18n validation, and the full desktop suite run under Hermit Node 24.
- `APP_EDITION=aibuddy pnpm run bundle:default` produces a valid `AIBuddy.app` with bundle ID `com.electron.aibuddy`, a distinct icon resource, and the AIBuddy login route.
