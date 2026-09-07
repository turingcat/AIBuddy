# Windows Installer Recovery Plan

**Goal:** Fix the Inno Setup macro comparison and package existing Windows distributions without rebuilding Rust or Electron.

**Architecture:** Extend the existing Windows workflow with an optional `reuse_run_id` string. When supplied, skip both build jobs and download the named unsigned distributions from that run in this repository. Keep the existing packaging matrix and final artifact uploads. The installer version must match the source build.

**Tech Stack:** GitHub Actions, Inno Setup, Node.js built-in tests, Ruby YAML parser.

## Constraints

- Work on `fix/windows-installer-repackage`; do not merge into main.
- Reuse run `34072162640`, version `1.0.6`, for both architectures.
- No Rust or Electron rebuilds; validate the installer on GitHub Windows runners.
- Upstream Goose has no corresponding Inno Setup installer implementation.

## Steps

- [x] Add regression checks for string macro comparisons, build job gates, cross-run artifact downloads, and unchanged final artifact uploads. Run them and confirm failure.
- [x] Compare the command-line macro against string `"1"`; add `reuse_run_id` to workflow inputs and gate build/package jobs. Limit cross-run artifact permission to the packaging job and grant it in the three existing reusable-workflow callers.
- [x] Run regression checks, workflow lint, product-boundary checks, formatting and diff checks. Ten checks pass; actionlint passes for all four modified workflows; product-boundary and cargo fmt checks pass.
- [ ] Commit and push the repair branch. Dispatch the existing workflow on that branch with the source run ID and matching version.
- [ ] Confirm both build jobs are skipped and the installer/ZIP artifacts are produced successfully.
