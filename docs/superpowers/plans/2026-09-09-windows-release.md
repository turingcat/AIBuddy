# Windows release implementation plan

Approved scope: disable automatic Azure runs; one x32 build targeting Windows 7 SP1 and one x64 build; shared Shanghai-time x.y.z-bMMDDHHmm version; versioned installers and extensionless README; upload to the existing COS stable prefix and remove only older Windows installers after successful publication.

- [x] Add tested version/installer metadata helpers and update both workflow and local packaging callers.
- [x] Add a tested COS publisher: validate both installers and README before network access, snapshot paginated old objects, upload and verify installers, publish README last, then delete only old matching installer keys. Serialize all publishers.
- [x] Disable Azure push/PR triggers. Generate the version once in the Windows workflow and propagate it to Rust, Electron and Inno Setup. Publish the three deliverables after both architectures succeed.
- [x] Use Electron 22.3.27 and the Rust i686-win7-windows-msvc target with a pinned nightly/build-std for x32. Adjust renderer/preload/main targets and incompatible Electron APIs. Build bundled uv for the same target and prevent downloading incompatible Node on Win7.
- [x] Verify unit tests, workflow parsing, formatting and relevant desktop build checks. Report Windows-native/Win7 runtime verification separately; a successful modern-host build does not establish Win7 compatibility.

COS location: cos://heybuddy-1252724067/heybuddy/stable/. Credentials remain repository secrets. No ACL changes. Preserve unrelated files and current installers. Workflow edits do not themselves trigger a release or change remote objects.

Validation caveat: native Windows builds, Win7 SP1 runtime acceptance and actual COS publication remain deployment checks; local branch coverage is not exhaustive path coverage. See the approved-scope design document for details.
