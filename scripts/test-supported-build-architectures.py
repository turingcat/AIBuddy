#!/usr/bin/env python3

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ACTIVE_MACOS_WORKFLOW_FILES = (
    ".github/workflows/bundle-macos.yml",
    ".github/workflows/release.yml",
    ".github/workflows/canary.yml",
    ".github/workflows/release-branches.yml",
)
HISTORIC_MACOS_WORKFLOW_FILES = ()


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
            "crates/aibuddy-cli/src/commands/update.rs",
            "crates/aibuddy-sdk/scripts/maven-resource-prefix.sh",
            "crates/aibuddy-sdk/scripts/prepare-maven-package.sh",
            "crates/aibuddy-sdk/maven/README.md",
            "documentation/src/components/SupportedEnvironments.js",
            "flake.nix",
            "ui/scripts/publish-npm-packages.sh",
            "ui/aibuddy-acp-client/package.json",
            "ui/aibuddy-acp/package.json",
            "ui/aibuddy-acp/src/resolve-binary.ts",
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

    def test_windows_builds_only_x32_and_x64_desktop_targets(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")
        self.assertIn("i686-pc-windows-msvc", workflow)
        self.assertIn("x86_64-pc-windows-msvc", workflow)
        self.assertIn("electron_arch: ia32", workflow)
        self.assertIn("electron_arch: x64", workflow)
        self.assertIn('pnpm run package:windows -- --arch="${ELECTRON_ARCH}"', workflow)
        self.assertIn("internal-aibuddy-${{ matrix.artifact_arch }}", workflow)
        self.assertIn("internal-windows-unsigned-${{ matrix.artifact_arch }}", workflow)
        self.assertNotIn("package-cli-windows:", workflow)
        self.assertNotIn("package_cli", workflow)
        self.assertNotIn("aarch64-pc-windows", workflow)
        self.assertNotIn("--platform=win32 --arch=arm64", workflow)

    def test_package_manager_allows_windows_ia32_dependencies(self) -> None:
        workspace = (ROOT / "ui/pnpm-workspace.yaml").read_text(encoding="utf-8")
        self.assertIn("ia32", workspace)

    def test_windows_workflow_uses_edition_aware_portable_name(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")
        self.assertIn("portableFileName", workflow)
        self.assertIn("steps.package-windows-zip.outputs.portable_file_name", workflow)
        self.assertIn("steps.package-windows-installer.outputs.setup_file_name", workflow)
        self.assertNotIn("AIBuddy-win32-x64", workflow)

    def test_intel_native_package_was_removed(self) -> None:
        self.assertFalse(
            (ROOT / "ui/aibuddy-binary/aibuddy-binary-darwin-x64/package.json").exists()
        )


if __name__ == "__main__":
    unittest.main()
