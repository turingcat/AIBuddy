#!/usr/bin/env python3

import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AZURE_PIPELINE = ROOT / "azure-pipelines.yml"


def load_yaml(path: Path) -> dict:
    result = subprocess.run(
        [
            "ruby",
            "-rjson",
            "-ryaml",
            "-e",
            "print JSON.generate(YAML.load_file(ARGV.fetch(0)))",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def powershell_scripts(pipeline: dict) -> list[str]:
    return [
        step["powershell"]
        for step in pipeline.get("steps", [])
        if isinstance(step, dict) and isinstance(step.get("powershell"), str)
    ]


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

    def test_windows_builds_only_x32_and_x64_desktop_targets(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")
        self.assertIn("i686-pc-windows-msvc", workflow)
        self.assertIn("x86_64-pc-windows-msvc", workflow)
        self.assertIn("electron_arch: ia32", workflow)
        self.assertIn("electron_arch: x64", workflow)
        self.assertIn('pnpm run package:windows -- --arch="${ELECTRON_ARCH}"', workflow)
        self.assertIn("internal-goose-${{ matrix.artifact_arch }}", workflow)
        self.assertIn("internal-windows-unsigned-${{ matrix.artifact_arch }}", workflow)
        self.assertNotIn("package-cli-windows:", workflow)
        self.assertNotIn("package_cli", workflow)
        self.assertNotIn("aarch64-pc-windows", workflow)
        self.assertNotIn("--platform=win32 --arch=arm64", workflow)

    def test_azure_matrix_maps_x32_and_x64_serially(self) -> None:
        pipeline = load_yaml(AZURE_PIPELINE)
        self.assertEqual("none", pipeline.get("trigger"))
        self.assertEqual("none", pipeline.get("pr"))

        strategy = pipeline.get("strategy")
        self.assertIsInstance(strategy, dict)
        self.assertEqual(1, strategy.get("maxParallel"))

        matrix = strategy.get("matrix")
        self.assertIsInstance(matrix, dict)
        self.assertEqual({"x32", "x64"}, set(matrix))

        expected = {
            "x32": {
                "ARTIFACT_ARCH": "x32",
                "ELECTRON_ARCH": "ia32",
                "RUST_TARGET": "i686-pc-windows-msvc",
                "CARGO_FEATURES": "aws-providers,nostr,otel,rustls-tls,system-keyring",
            },
            "x64": {
                "ARTIFACT_ARCH": "x64",
                "ELECTRON_ARCH": "x64",
                "RUST_TARGET": "x86_64-pc-windows-msvc",
                "CARGO_FEATURES": (
                    "code-mode,aws-providers,nostr,otel,rustls-tls,"
                    "system-keyring,update"
                ),
            },
        }
        for leg, expected_mapping in expected.items():
            with self.subTest(leg=leg):
                actual_mapping = {
                    key: matrix[leg].get(key)
                    for key in expected_mapping
                }
                self.assertEqual(expected_mapping, actual_mapping)

    def test_azure_injects_matching_release_cli_and_runtime_binaries(self) -> None:
        pipeline = load_yaml(AZURE_PIPELINE)
        scripts = powershell_scripts(pipeline)

        release_builds = [
            script
            for script in scripts
            if "cargo build" in script and "--release" in script
        ]
        self.assertEqual(1, len(release_builds))
        release_build = release_builds[0]
        self.assertIn("--target $env:RUST_TARGET", release_build)
        self.assertIn("--features $env:CARGO_FEATURES", release_build)
        self.assertIn(r"target\$env:RUST_TARGET\release\goose.exe", release_build)
        self.assertRegex(
            release_build,
            r'(?i)Copy-Item\s+\$binary\s+["\']ui\\desktop\\src\\bin\\goose\.exe["\']\s+-Force',
        )

        desktop_builds = [
            script for script in scripts if "prepare-platform-binaries.js" in script
        ]
        self.assertEqual(1, len(desktop_builds))
        self.assertIn(
            "pnpm run package:windows -- --arch=$env:ELECTRON_ARCH",
            desktop_builds[0],
        )

        normalized_scripts = [script.replace("\\", "/") for script in scripts]
        self.assertTrue(
            any(
                "Copy-Item" in script
                and "src/bin" in script
                and "resources/bin" in script
                for script in normalized_scripts
            ),
            "Azure pipeline must copy runtime binaries into packaged resources/bin",
        )

    def test_azure_publishes_only_architecture_specific_installers(self) -> None:
        pipeline = load_yaml(AZURE_PIPELINE)
        pipeline_text = AZURE_PIPELINE.read_text(encoding="utf-8-sig")
        matrix = pipeline.get("strategy", {}).get("matrix", {})
        artifact_name = "AIBuddy-windows-$(ARTIFACT_ARCH)-setup"
        resolved_names = {
            artifact_name.replace("$(ARTIFACT_ARCH)", leg.get("ARTIFACT_ARCH", ""))
            for leg in matrix.values()
        }
        self.assertEqual(
            {"AIBuddy-windows-x32-setup", "AIBuddy-windows-x64-setup"},
            resolved_names,
        )

        steps = pipeline.get("steps", [])
        publication_steps = [
            step
            for step in steps
            if isinstance(step, dict)
            and (
                "publish" in step
                or str(step.get("task", "")).startswith("Publish")
            )
        ]
        self.assertEqual(1, len(publication_steps))
        publish = publication_steps[0]
        self.assertEqual("PublishPipelineArtifact@1", publish.get("task"))
        publish_inputs = publish.get("inputs", {})
        self.assertEqual(artifact_name, publish_inputs.get("artifact"))
        self.assertEqual(
            f"$(Build.ArtifactStagingDirectory)/{artifact_name}",
            str(publish_inputs.get("targetPath", "")).replace("\\", "/"),
        )

        installer_scripts = [
            script
            for script in powershell_scripts(pipeline)
            if "desktop-setup.iss" in script
        ]
        self.assertEqual(1, len(installer_scripts))
        self.assertIn(
            "AIBuddy-windows-$env:ARTIFACT_ARCH-setup",
            installer_scripts[0],
        )
        self.assertIn("BUILD_ARTIFACTSTAGINGDIRECTORY", installer_scripts[0])

        self.assertFalse(
            any(
                "goose.exe" in script.lower()
                and "artifactstagingdirectory" in script.lower()
                for script in powershell_scripts(pipeline)
            ),
            "Azure pipeline must not stage a standalone CLI artifact",
        )
        self.assertNotIn("portableFileName", pipeline_text)
        self.assertNotRegex(pipeline_text, r"7z\s+a\s+-tzip")
        self.assertNotIn("gh workflow run", pipeline_text)
        self.assertNotIn("workflow_dispatch", pipeline_text)

    def test_package_manager_allows_windows_ia32_dependencies(self) -> None:
        workspace = (ROOT / "ui/pnpm-workspace.yaml").read_text(encoding="utf-8")
        self.assertIn("ia32", workspace)

    def test_windows_workflow_uses_edition_aware_portable_name(self) -> None:
        workflow = (ROOT / ".github/workflows/bundle-windows.yml").read_text(encoding="utf-8")
        self.assertIn("portableFileName", workflow)
        self.assertIn("steps.package-windows-zip.outputs.portable_file_name", workflow)
        self.assertIn("steps.package-windows-installer.outputs.setup_file_name", workflow)
        self.assertNotIn("HeyBuddy-win32-x64", workflow)

    def test_intel_native_package_was_removed(self) -> None:
        self.assertFalse(
            (ROOT / "ui/goose-binary/goose-binary-darwin-x64/package.json").exists()
        )


if __name__ == "__main__":
    unittest.main()
