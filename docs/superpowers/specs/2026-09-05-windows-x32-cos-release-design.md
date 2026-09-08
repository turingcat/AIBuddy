# Windows x32 and COS Release Design

## Goal

Publish installable HeyBuddy desktop clients for 32-bit and 64-bit Windows, then replace two fixed objects in the private Tencent COS bucket after a tagged GitHub release succeeds.

The published objects are exactly:

- `heybuddy/stable/HeyBuddy-windows-x32-setup.exe`
- `heybuddy/stable/HeyBuddy-windows-x64-setup.exe`

Portable ZIP packages and historical version directories are out of scope.

## Windows Build

The reusable Windows workflow will run desktop builds as an architecture matrix:

| Public name | Electron arch | Rust target | Runtime downloads |
| --- | --- | --- | --- |
| `x32` | `ia32` | `i686-pc-windows-msvc` | Node `win-x86`, uv `i686-pc-windows-msvc` |
| `x64` | `x64` | `x86_64-pc-windows-msvc` | Node `win-x64`, uv `x86_64-pc-windows-msvc` |

Architecture will be passed explicitly to packaging helpers. Installer names, Electron output directories, caches, intermediate artifact names, and Rust binary paths must remain distinct between matrix entries.

The existing Windows CLI release remains x64-only. The new x32 target applies to the desktop installer and its bundled backend.

## Installer Packaging

The Windows packaging helper will generate architecture-aware package metadata and installer names. The Inno Setup configuration will install the x64 build in 64-bit mode and the x32 build in normal 32-bit mode.

Each architecture produces one final release artifact:

- `HeyBuddy-windows-x32-setup.exe`
- `HeyBuddy-windows-x64-setup.exe`

The portable archive creation step and portable release artifact will be removed.

## Release and COS Upload

Tagged releases continue publishing the Windows installers to the versioned and `stable` GitHub Releases. After the GitHub release steps succeed, the workflow uploads the two local installer files to the fixed COS object keys and overwrites the previous objects.

The upload targets are in bucket `heybuddy-1252724067`, region `ap-guangzhou`. The Action will use repository secrets named:

- `TENCENT_CLOUD_SECRET_ID`
- `TENCENT_CLOUD_SECRET_KEY`

The credentials should be restricted to uploading or replacing the two `heybuddy/stable/*` objects. The workflow will not change bucket ACLs, bucket policy, object ACLs, or anonymous access settings.

The COS bucket remains private. Anonymous `GetObject` access for `heybuddy/stable/*` is configured separately in Tencent Cloud and is not managed by GitHub Actions.

## Failure Behavior

- A missing x32 or x64 installer fails the release job before any COS upload.
- A failed COS upload fails the release workflow instead of reporting a fully published release.
- Uploading fixed keys is intentional: rerunning a release replaces the same two objects.
- Secrets are passed only as masked environment values and are not printed.

## Verification

Unit tests will cover architecture validation, package names, Electron output names, Rust targets, runtime download selection, and Inno Setup definitions.

Workflow-focused tests will assert that:

- both Windows architectures are built;
- portable ZIP creation is absent;
- both installer artifacts are published;
- COS uploads target only the two approved fixed object keys;
- COS upload steps run only for tagged releases.

The final diff will also be checked for accidental secret values and unintended COS ACL changes.
