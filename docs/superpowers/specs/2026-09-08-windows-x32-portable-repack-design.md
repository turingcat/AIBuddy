# Windows x32 Portable Repack Design

## Goal

Create a downloadable Windows x32 portable ZIP from the successful installer artifact produced by Actions run `33966581247`, without rebuilding Rust or Electron.

## Workflow

Add a manually dispatched workflow that accepts a source run ID, source artifact name, architecture, and retention period. It downloads the existing Actions artifact with the repository `GITHUB_TOKEN`, creates a 32-bit Wine prefix on an Ubuntu runner, runs the x32 installer silently into an isolated staging directory, removes the generated uninstaller, and archives the staged application contents at the ZIP root.

The initial dispatch uses:

- source run: `33966581247`
- source artifact: `Goose-win32-x32`
- architecture: `x32`
- output: `HeyBuddy-windows-x32-portable.zip`
- retention: 90 days

## Validation

The workflow fails unless `HeyBuddy.exe`, `resources/bin/goose.exe`, `resources/bin/uv.exe`, and `resources/bin/uvx.exe` all exist and are non-empty. `file` must identify all four executables as `PE32` and must not identify any as `PE32+`. The uploaded artifact contains the portable ZIP and its SHA-256 checksum.

## Scope

This is a repackaging utility for existing successful installer artifacts. It does not change the normal Windows bundle or release workflows and does not publish the ZIP to a GitHub Release or Tencent COS.
