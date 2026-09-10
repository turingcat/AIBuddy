# Windows release workflow

Approved on 2026-09-09. This replaces the previous separate experimental Win7 delivery proposal for future Windows releases; it does not modify the existing experimental design file.

## Artifacts and publication

Azure push and pull-request triggers are disabled. The GitHub Windows workflow builds x32 and x64 installers. It resolves one version in Asia/Shanghai time, e.g. `1.0.6-b09092210`, and uses it for Cargo, Electron, both Inno installers and README. Inno's numeric executable metadata remains `1.0.6`.

The final files are:

- `HeyBuddy-windows-x32-V1.0.6-b09092210.exe`
- `HeyBuddy-windows-x64-V1.0.6-b09092210.exe`
- `README`, containing exactly `VERSION=V1.0.6-b09092210` without a newline.

Publishing is enabled by default when desktop packaging is enabled; `publish_cos: false` builds artifacts without publishing. Reusable callers pass the existing Tencent secrets. The publisher uses the existing bucket and prefix `cos://heybuddy-1252724067/heybuddy/stable/` and does not change ACLs.

Both installers must finish before publishing. Every publisher shares the `heybuddy-cos-stable` concurrency group. Local manifest/files are validated before network access. The publisher lists old installer keys with pagination, refuses to overwrite an existing version with different contents, reuses identical installers on retries, uploads and verifies both installers, then updates and verifies README. Only then does it delete old matching Windows installer keys. Other objects and nested directories are preserved. An upload failure cannot trigger cleanup. A cleanup failure is reported and can be retried.

## x32 compatibility path

There is one x32 installer, targeting Windows 7 SP1 and later x86-compatible Windows. The x64 build keeps the current Electron and normal Windows Rust target.

- x32 Rust target: `i686-win7-windows-msvc`, using pinned `nightly-2026-09-01`, `rust-src` and `build-std`; this tier-3 target cannot be installed using `rustup target add`.
- x32 Electron: `22.3.27`. The workflow changes the exact Electron devDependency only after installing the frozen workspace dependencies. Forge derives its effective Electron version from that package field, overriding a packagerConfig-only setting.
- x32 main/preload/renderer targets: Node 16 / Chromium 108. CSS minification uses Lightning CSS with the same browser target and emits fallbacks for newer colors.
- A Chromium `net.request` adapter supplies the fetch response/stream behavior missing from Electron 22, retaining session certificate verification. Old Electron file dragging uses `File.path`.
- uv and uvx are built from the pinned `0.11.11` source for the same Win7 target, then checked against the build's SHA-256 manifest. Generic x86 uv release binaries are not used for x32.
- Node `12.22.12` x86, verified against its pinned SHA-256, is bundled for x32 npm launching. Modern npm/MCP extensions that require Node 18/20+ are outside this old runtime's capabilities. An x32 package no longer downloads Node 22 on Win7.
- Inno Setup is pinned to `6.5.4`; the x32 installer declares `MinVersion=6.1sp1`.
- The build checks all packaged PE executables, DLLs and native Node modules for x86 architecture, subsystem version and known unsupported static imports. The check is intentionally not represented as a complete Win7 API compatibility proof.

## Verification and remaining deployment checks

Local verification covers version generation and the exact README, packaging metadata, workflow syntax/contracts, COS success/failure/retry/pagination/deletion paths, real synthetic PE headers, old Electron networking and preload behavior, TypeScript, Rust formatting, and main/renderer compilation. Coverage tools measure branch and statement coverage, not exhaustive path coverage through loops and external services.

Before claiming an actual installer supports Win7 SP1, run the Windows workflow and test the resulting installer on Win7 SP1: install/uninstall, launch and rendering, OA login, HTTPS streaming, local file/shell tools, and supported extension subprocesses. OS runtime prerequisites such as the Universal CRT and SHA-2/TLS/root-certificate updates must be checked on that machine. No Windows/Win7 machine was available in this local macOS verification session. The COS service itself was not mutated during this workflow-editing task.
