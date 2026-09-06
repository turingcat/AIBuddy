# Azure Desktop x32/x64 Build Design

## Goal

Build AIBuddy Desktop for Windows x32 and x64 in Azure Pipelines. Each installer must contain the matching Rust CLI executable.

The pipeline is manual-only and must not trigger GitHub Actions.

## Architecture

Use one Azure Pipelines matrix job with two legs and `maxParallel: 1` so the free-tier account uses at most one hosted agent at a time.

| Artifact | Electron architecture | Rust target | CLI features |
| --- | --- | --- | --- |
| `x32` | `ia32` | `i686-pc-windows-msvc` | Exclude features unsupported by the 32-bit target |
| `x64` | `x64` | `x86_64-pc-windows-msvc` | Use the standard Windows Desktop CLI feature set |

Each matrix leg performs the complete build locally on one Windows agent:

1. Install the matching Rust target and Node/pnpm toolchain.
2. Build the release `goose.exe` for that target.
3. Place the CLI and Windows helper binaries in `ui/desktop/src/bin`.
4. Build the Electron package for the matching architecture.
5. Create the architecture-specific Inno Setup installer.
6. Publish the installer as an Azure Pipeline artifact.

Keeping each leg self-contained avoids intermediate artifact jobs and reduces Azure scheduling overhead.

## Triggering

Keep both declarations disabled:

```yaml
trigger: none
pr: none
```

The pipeline is started manually through Azure Pipelines or its REST/CLI API. No GitHub workflow dispatch, push, tag, or pull-request event is used.

## Outputs

The successful run publishes exactly these final artifacts:

- `AIBuddy-windows-x32-setup` containing `AIBuddy-windows-x32-setup.exe`
- `AIBuddy-windows-x64-setup` containing `AIBuddy-windows-x64-setup.exe`

No standalone CLI-only artifact or portable ZIP is required.

## Failure Handling

The two matrix legs are independent. A failure in one architecture does not cancel the other, but the overall run fails unless both installers are produced. Every packaging step checks the expected file before publishing it.

## Verification

Before pushing the branch:

- Parse and inspect `azure-pipelines.yml`.
- Run the repository's Windows architecture and release-workflow tests.
- Confirm the YAML contains x32 and x64 targets, `maxParallel: 1`, `trigger: none`, and `pr: none`.
- Confirm no GitHub workflow is invoked or modified.

After pushing, manually run the Azure Pipeline and verify both installer artifacts complete successfully.
