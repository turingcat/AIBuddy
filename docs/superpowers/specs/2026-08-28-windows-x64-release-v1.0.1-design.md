# Windows x64 Release v1.0.1 Design

## Goal

Publish a non-prerelease GitHub Release tagged `v1.0.1` from `main`, with the
project manifests set to `1.0.1` and an unsigned Windows x64 installer named
`HeyBuddy-Setup.exe` attached to the release.

## Scope

- Set the workspace and desktop application versions to `1.0.1`.
- Extend the existing Windows bundle workflow to build the repository's Inno
  Setup installer from the packaged `HeyBuddy-win32-x64` application.
- Upload both `HeyBuddy-win32-x64.zip` and `HeyBuddy-Setup.exe` as workflow
  artifacts and GitHub Release assets.
- Remove Windows signing inputs and jobs so all current and future Windows
  packages are unsigned by policy.
- Allow the fork's tag-triggered release workflow to run without unavailable
  macOS signing secrets.
- Preserve the user's uncommitted `Justfile` change and `.pnpm-store/` directory.

## Release Flow

1. Validate the modified workflows locally.
2. Commit and push the version and workflow changes directly to `main`, as
   explicitly requested.
3. Dispatch the Windows bundle workflow against `main` with version `1.0.1`,
   desktop packaging enabled, and the standard x64 variant.
4. Confirm that the workflow produces both the portable ZIP and Inno Setup EXE.
5. Create and push tag `v1.0.1` at the verified `main` commit.
6. Let the tag-triggered Release workflow publish a normal GitHub Release and
   attach the Windows assets.

## Windows Installer

The packaging job checks out the tagged source, downloads the packaged desktop
directory, installs Inno Setup when necessary, and compiles
`ui/desktop/heybuddy-setup.iss` with `MyAppVersion=1.0.1`. The resulting
`HeyBuddy-Setup.exe` remains unsigned, so Windows may display an unknown
publisher warning. This is an accepted release constraint.

## Signing

Windows bundles are always unsigned. The reusable Windows workflow has no
signing input, Azure credentials, signing environment, or signing job. macOS
release signing remains independent and is controlled by an
`ENABLE_MAC_RELEASE_SIGNING` Actions variable that defaults to false so this
fork can publish without absent Apple credentials.

## Error Handling

- Missing Windows build files or installer output fails the workflow.
- The formal tag is not pushed until the unsigned Windows preflight build
  succeeds.
- A failed formal Release is investigated without force-moving or recreating
  the published tag.

## Verification

- Validate workflow syntax with `actionlint` when available and parse the YAML
  with the repository's installed tooling.
- Run repository formatting and diff checks.
- Verify version consistency across `Cargo.toml`, `Cargo.lock`, and
  `ui/desktop/package.json`.
- Use the real GitHub Windows runner as the functional test for Inno Setup and
  Electron x64 packaging.
- Verify the final Release is non-draft and non-prerelease and contains
  `HeyBuddy-Setup.exe` plus `HeyBuddy-win32-x64.zip`.
