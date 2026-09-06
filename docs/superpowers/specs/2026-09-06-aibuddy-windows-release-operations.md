# AIBuddy Windows Release Operations

## Workflow State

On 2026-09-06 all 36 user-managed GitHub Actions workflows were disabled individually in turingcat/AIBuddy. GitHub returned HTTP 422 when asked to disable its generated Dependabot Updates workflow. The repository Actions master switch was therefore also disabled and verified through the API (`enabled: false`). Dependabot automatic security updates were already disabled and were not changed.

Workflow YAML definitions retain their original paths so they can be re-enabled through GitHub. The newly imported Azure pipeline has `trigger: none` and `pr: none`; no Azure service setting was changed.

To resume selected workflows, first enable Actions under repository Settings > Actions > General, then enable only the workflows needed in the Actions tab. For normal desktop releases, enable Release and its two called Bundle Desktop workflows. Enable Publish Existing Release Artifacts only if recovering a prior build. No workflow was dispatched as part of this change.

## Windows Publication

The release job still waits for macOS ARM64 and both Windows architectures. Only numeric `vMAJOR.MINOR.PATCH` tags pass the stable publication check. Release and recovery publication share a non-cancelling concurrency group.

The uploader checks that both installer files exist and are nonempty before making any COS write. It uses the pinned upstream coscli version and checksum with `TENCENT_CLOUD_SECRET_ID` and `TENCENT_CLOUD_SECRET_KEY` repository secrets. It does not change bucket/object ACLs.

The two overwritten object keys are:

- `cos://heybuddy-1252724067/aibuddy/stable/AIBuddy-windows-x32-setup.exe`
- `cos://heybuddy-1252724067/aibuddy/stable/AIBuddy-windows-x64-setup.exe`

TFlow links directly to the public HTTPS equivalents, with no download-link settings. Public-read access must already be configured on the COS side; the workflow only writes objects. Upload failures fail the publication job. The two COS writes are sequential, not a cross-object atomic transaction; a second-upload failure can temporarily leave different versions and requires retrying publication.

The existing-release workflow accepts a numeric version tag and an artifact source run ID. Operators must select the intended trusted release build. GitHub publication happens before COS upload, so a COS failure can be retried using that recovery workflow.

## Verification Limits

Local tests use a fake coscli and do not publish real objects. Windows installer creation, installation on Windows, and actual COS credentials/permissions require the later manually enabled release run. No new release or tag was created during implementation.
