#!/usr/bin/env python3

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ACTIVE_MACOS_WORKFLOW_FILES = (
    ".github/workflows/bundle-macos.yml",
    ".github/workflows/release.yml",
)
HISTORIC_MACOS_WORKFLOW_FILES = (
    ".github/workflows/canary.yml.disabled",
    ".github/workflows/release-branches.yml.disabled",
)


class SupportedBuildArchitecturesTest(unittest.TestCase):
    def test_main_updates_do_not_start_build_workflows(self) -> None:
        for relative_path in (
            ".github/workflows/ci.yml",
            ".github/workflows/mcp-conformance.yml",
        ):
            with self.subTest(file=relative_path):
                workflow = (ROOT / relative_path).read_text(encoding="utf-8")
                trigger_block = workflow.split("on:", 1)[1].split("concurrency:", 1)[0]
                self.assertNotIn("push:", trigger_block)
                self.assertNotIn("merge_group:", trigger_block)
                self.assertIn("pull_request:", trigger_block)
                self.assertIn("workflow_dispatch:", trigger_block)

    def test_macos_builds_only_target_arm64(self) -> None:
        build_files = [
            *ACTIVE_MACOS_WORKFLOW_FILES,
            *HISTORIC_MACOS_WORKFLOW_FILES,

            "Justfile",
            "ui/desktop/package.json",
            "documentation/src/components/MacDesktopInstallButtons.js",
            "download_cli.sh",
            "crates/aibuddy-cli/src/commands/update.rs",
            "crates/aibuddy-sdk/scripts/maven-resource-prefix.sh",
            "crates/aibuddy-sdk/scripts/prepare-maven-package.sh",
            "crates/aibuddy-sdk/maven/README.md",
            "documentation/src/components/SupportedEnvironments.js",
            "flake.nix",
            "ui/scripts/publish.sh",
            "ui/sdk/package.json",
            "ui/sdk/scripts/build-native.ts",
            "ui/sdk/src/resolve-binary.ts",
        ]
        forbidden = (
            "x86_64-apple-darwin",
            "darwin-x64",
            "bundle:intel",
            "make-ui-intel",
            "release-intel",
            "copy-binary-intel",
            "intel_mac",
            "macos-15-intel",
            "AIBuddy_intel_mac",
            "macOS Intel",
            "macos-x86_64",
            "darwin-x86-64",
            "Darwin-x86_64",
        )

        for relative_path in build_files:
            content = (ROOT / relative_path).read_text(encoding="utf-8")
            for marker in forbidden:
                with self.subTest(file=relative_path, marker=marker):
                    self.assertNotIn(marker, content)

    def test_macos_workflow_inventory_requires_declared_paths(self) -> None:
        for relative_path in (*ACTIVE_MACOS_WORKFLOW_FILES, *HISTORIC_MACOS_WORKFLOW_FILES):
            with self.subTest(file=relative_path):
                self.assertTrue(
                    (ROOT / relative_path).is_file(),
                    f"required architecture contract file is missing: {relative_path}",
                )

        self.assertTrue(all(path.endswith(".yml") for path in ACTIVE_MACOS_WORKFLOW_FILES))
        self.assertTrue(all(path.endswith(".yml.disabled") for path in HISTORIC_MACOS_WORKFLOW_FILES))

    def test_desktop_bundle_has_no_intel_script(self) -> None:
        package = json.loads((ROOT / "ui/desktop/package.json").read_text(encoding="utf-8"))
        self.assertNotIn("bundle:intel", package["scripts"])
        self.assertIn("--arch=arm64", package["scripts"]["package:macos"])
        self.assertIn("--arch=arm64", package["scripts"]["bundle:default"])

    def test_macos_workflow_has_no_target_input(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-macos.yml").read_text(encoding="utf-8")
        self.assertNotIn("inputs.target", workflow)
        self.assertIn("aarch64-apple-darwin", workflow)

    def test_windows_builds_x32_and_x64_desktop_targets(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")
        package = json.loads((ROOT / "ui/desktop/package.json").read_text(encoding="utf-8"))

        self.assertIn("i686-pc-windows-msvc", workflow)
        self.assertIn("x86_64-pc-windows-msvc", workflow)
        self.assertIn("electron_arch: ia32", workflow)
        self.assertIn("electron_arch: x64", workflow)
        self.assertIn("--arch=\"$ELECTRON_ARCH\"", workflow)
        self.assertIn("WINDOWS_ARCH: ${{ matrix.name }}", workflow)
        self.assertIn("internal-aibuddy-${{ matrix.rust_target }}", workflow)
        self.assertIn("internal-windows-unsigned-${{ matrix.name }}", workflow)
        self.assertIn("AIBuddy-win32-${{ matrix.name }}", workflow)
        self.assertNotIn("aarch64-pc-windows", workflow)
        self.assertNotIn("--platform=win32 --arch=arm64", workflow)
        self.assertNotIn("--arch=x64", package["scripts"]["package:windows"])

    def test_windows_cli_remains_x64_only(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")

        package_cli_job = workflow.split("  package-cli-windows:", 1)[1].split(
            "  build-desktop-windows:", 1
        )[0]
        self.assertIn("internal-aibuddy-x86_64-pc-windows-msvc", package_cli_job)
        self.assertNotIn("internal-aibuddy-i686-pc-windows-msvc", package_cli_job)

    def test_windows_workflow_can_publish_an_x32_portable_archive(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")

        self.assertIn("AIBuddy-windows-${{ matrix.name }}-setup.exe", workflow)
        self.assertIn("package_x32_portable", workflow)
        self.assertIn("inputs.package_x32_portable && matrix.name == 'x32'", workflow)
        self.assertIn("AIBuddy-windows-x32-portable.zip", workflow)
        self.assertIn("7z a -tzip", workflow)
        self.assertIn("name: AIBuddy-windows-x32-portable", workflow)
        self.assertIn("retention-days: ${{ inputs.artifact_retention_days }}", workflow)

    def test_installers_use_the_aibuddy_release_repository(self) -> None:
        shell_installer = (ROOT / "download_cli.sh").read_text(encoding="utf-8")
        powershell_installer = (ROOT / "download_cli.ps1").read_text(encoding="utf-8")

        self.assertIn('REPO="turingcat/AIBuddy"', shell_installer)
        self.assertIn('$REPO = "turingcat/AIBuddy"', powershell_installer)
        self.assertIn("https://api.github.com/repos/${REPO}/releases/latest", shell_installer)
        self.assertNotIn("aaif-goose/goose/releases", shell_installer)
        self.assertNotIn("aaif-goose/goose/releases", powershell_installer)

    def test_release_attestations_run_for_personal_repositories(self) -> None:
        workflow = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")

        self.assertEqual(workflow.count("actions/attest-build-provenance@"), 2)
        self.assertNotIn("github.event.repository.owner.type", workflow)
        self.assertIn("id-token: write", workflow)
        self.assertIn("attestations: write", workflow)

    def test_intel_native_package_was_removed(self) -> None:
        self.assertFalse(
            (ROOT / "ui/aibuddy-binary/aibuddy-binary-darwin-x64/package.json").exists()
        )


if __name__ == "__main__":
    unittest.main()
