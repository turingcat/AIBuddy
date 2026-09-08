# Windows x32 Portable Repack Design

## Goal

Create a downloadable Windows x32 portable ZIP from the successful installer artifact produced by Actions run `33966581247`, without rebuilding Rust or Electron.

## Workflow

Add a manually dispatched workflow that accepts a source run ID, source artifact name, architecture, and retention period. It downloads the existing Actions artifact with the repository `GITHUB_TOKEN`, runs the installer silently into an isolated staging directory on a Windows runner, removes the generated uninstaller, and archives the staged application contents at the ZIP root.

The initial dispatch uses:

- source run: `33966581247`
- source artifact: `Goose-win32-x32`
- architecture: `x32`
- output: `HeyBuddy-windows-x32-portable.zip`
- retention: 90 days

## Validation

The workflow fails unless both `HeyBuddy.exe` and `resources/bin/goose.exe` exist. It reads the PE headers directly and requires both Machine fields to equal `0x014c` for x32 or `0x8664` for x64. The uploaded artifact contains the portable ZIP and its SHA-256 checksum.

## Scope

This is a repackaging utility for existing successful installer artifacts. It does not change the normal Windows bundle or release workflows and does not publish the ZIP to a GitHub Release or Tencent COS.
