# Windows x32 Portable Repack Design

## Goal

Create a downloadable Windows x32 portable ZIP from the successful installer artifact produced by Actions run `33966581247`, without rebuilding Rust or Electron.

## Workflow

Add a manually dispatched workflow that accepts a source run ID, source artifact name, architecture, and retention period. It downloads the existing Actions artifact with the repository `GITHUB_TOKEN`, builds the pending upstream `innoextract` support for Inno Setup 6.4.2 through 7.0.2 from pinned commit `376a13e7c41cc5528b6088d0dd16ec1b323a8d37`, extracts the installer payload, and archives the extracted application contents at the ZIP root.

The initial dispatch uses:

- source run: `33966581247`
- source artifact: `Goose-win32-x32`
- architecture: `x32`
- output: `HeyBuddy-windows-x32-portable.zip`
- retention: 90 days

## Validation

The extractor may return status 1 after warning that it could not read back multi-part files for its own checksum pass. That status is accepted only when `HeyBuddy.exe`, `resources/bin/goose.exe`, `resources/bin/uv.exe`, and `resources/bin/uvx.exe` all exist and are non-empty. For x32, `file` must identify all four executables as `PE32` and must not identify any as `PE32+`; x64 requires `PE32+`. The uploaded artifact contains the portable ZIP and its SHA-256 checksum.

## Scope

This is a repackaging utility for existing successful installer artifacts. It does not change the normal Windows bundle or release workflows and does not publish the ZIP to a GitHub Release or Tencent COS.
