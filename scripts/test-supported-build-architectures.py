#!/usr/bin/env python3

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class SupportedBuildArchitecturesTest(unittest.TestCase):
    def test_macos_builds_only_target_arm64(self) -> None:
        build_files = [
            ".github/workflows/bundle-macos.yml",
            ".github/workflows/canary.yml",
            ".github/workflows/release-branches.yml",
            ".github/workflows/release.yml",

            "Justfile",
            "ui/desktop/package.json",
            "documentation/src/components/MacDesktopInstallButtons.js",
            "download_cli.sh",
            "crates/goose-cli/src/commands/update.rs",
            "crates/goose-sdk/scripts/maven-resource-prefix.sh",
            "crates/goose-sdk/scripts/prepare-maven-package.sh",
            "crates/goose-sdk/maven/README.md",
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
            "Goose_intel_mac",
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
        self.assertIn("internal-goose-${{ matrix.rust_target }}", workflow)
        self.assertIn("internal-windows-unsigned-${{ matrix.name }}", workflow)
        self.assertIn("Goose-win32-${{ matrix.name }}", workflow)
        self.assertNotIn("aarch64-pc-windows", workflow)
        self.assertNotIn("--platform=win32 --arch=arm64", workflow)
        self.assertNotIn("--arch=x64", package["scripts"]["package:windows"])

    def test_windows_cli_remains_x64_only(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")

        package_cli_job = workflow.split("  package-cli-windows:", 1)[1].split(
            "  build-desktop-windows:", 1
        )[0]
        self.assertIn("internal-goose-x86_64-pc-windows-msvc", package_cli_job)
        self.assertNotIn("internal-goose-i686-pc-windows-msvc", package_cli_job)

    def test_windows_workflow_publishes_installers_without_portable_archives(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")

        self.assertIn("HeyBuddy-windows-${{ matrix.name }}-setup.exe", workflow)
        self.assertNotIn("portableFileName", workflow)
        self.assertNotIn("portable.zip", workflow)
        self.assertNotIn("7z a", workflow)
        self.assertNotIn("HeyBuddy-win32-x64", workflow)

    def test_intel_native_package_was_removed(self) -> None:
        self.assertFalse(
            (ROOT / "ui/goose-binary/goose-binary-darwin-x64/package.json").exists()
        )


if __name__ == "__main__":
    unittest.main()
