# Windows x32 Portable Repack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a Windows x32 portable ZIP from an existing successful Actions installer artifact without rebuilding the application.

**Architecture:** A manual GitHub Actions workflow downloads a named artifact from a named run, builds a pinned upstream extractor with support for the installer's Inno Setup version, validates the extracted executable architecture, creates a root-level portable ZIP, and uploads the ZIP plus checksum. A workflow contract test fixes the inputs, validation, naming, and retention behavior.

**Tech Stack:** GitHub Actions YAML, `actions/download-artifact`, CMake, `innoextract`, `file`, `zip`, Python `unittest`.

## Global Constraints

- Default source run is `33966581247` and default artifact is `Goose-win32-x32`.
- The initial output is `HeyBuddy-windows-x32-portable.zip` retained for 90 days.
- Do not rebuild Rust or Electron.
- Do not modify the normal Windows bundle or release workflows.

---

### Task 1: Add the Portable Repack Workflow

**Files:**
- Create: `.github/workflows/repack-windows-portable.yml`
- Modify: `scripts/test-supported-build-architectures.py`

**Interfaces:**
- Consumes: `source_run_id`, `source_artifact_name`, `architecture`, and `artifact_retention_days` workflow inputs.
- Produces: `HeyBuddy-windows-<architecture>-portable.zip` and a matching `.sha256` file in an Actions artifact.

- [ ] **Step 1: Write the failing workflow contract test**

Assert that the workflow exists, downloads from the selected run with `GITHUB_TOKEN`, builds pinned `innoextract` support for Inno Setup 6.5+, validates both Windows executables, creates the architecture-qualified portable ZIP, and uploads it with the selected retention period.

- [ ] **Step 2: Run the test and verify RED**

Run `python3 scripts/test-supported-build-architectures.py` and confirm it fails because `.github/workflows/repack-windows-portable.yml` is missing.

- [ ] **Step 3: Implement the workflow**

Create the workflow with the exact inputs and validation described above. Archive `extracted/app/*` so `HeyBuddy.exe` is at the ZIP root.

- [ ] **Step 4: Run focused verification**

Run `python3 scripts/test-supported-build-architectures.py`, `ruby scripts/test-ci-performance-contracts.rb`, and `git diff --check`.

- [ ] **Step 5: Commit, push, and dispatch**

Commit the workflow, test, design, and plan to `main`; push `main`; dispatch with the default source run/artifact and 90-day retention.

- [ ] **Step 6: Verify the remote artifact**

Wait for the run to complete, download the resulting artifact, verify the checksum and ZIP root, and report the run URL and artifact name.
