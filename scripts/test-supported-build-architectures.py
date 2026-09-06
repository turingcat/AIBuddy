#!/usr/bin/env python3

import json
import re
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


def normalize_powershell_value(value: str, aliases: dict[str, str]) -> str:
    normalized = value.strip().replace("\\", "/")
    for _ in range(8):
        expanded = re.sub(
            r"\$([A-Za-z_]\w*)",
            lambda match: aliases.get(match.group(1).lower(), match.group(0)),
            normalized,
        )
        if expanded == normalized:
            break
        normalized = expanded
    return normalized.lower()


def powershell_aliases(scripts: list[str]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for script in scripts:
        for line in script.splitlines():
            assignment = re.match(
                r"^\s*\$([A-Za-z_]\w*)\s*=\s*(.+?)\s*$",
                line,
            )
            if assignment:
                aliases[assignment.group(1).lower()] = normalize_powershell_value(
                    assignment.group(2), aliases
                )
    return aliases


def powershell_copy_destinations(
    script: str, aliases: dict[str, str]
) -> list[str]:
    destinations = []
    for line in script.splitlines():
        command = re.match(r"(?i)^\s*(?:Copy-Item|Move-Item)\b(.*)", line)
        if command is None:
            continue

        arguments = command.group(1)
        named = re.search(
            r'(?i)-Destination\s+("[^"]*"|\'[^\']*\'|\$[A-Za-z_]\w*)',
            arguments,
        )
        if named:
            destination = named.group(1)
        else:
            tokens = [
                token
                for token in re.findall(r'"[^"]*"|\'[^\']*\'|\S+', arguments)
                if not token.startswith("-")
            ]
            destination = tokens[1] if len(tokens) > 1 else None
        if destination:
            destinations.append(normalize_powershell_value(destination, aliases))
    return destinations


def uses_approved_runtime_copy(script: str) -> bool:
    normalized = script.replace("\\", "/")
    return bool(
        re.search(
            r'(?im)^\s*\$srcBin\s*=\s*Join-Path\s+'
            r'\$env:BUILD_SOURCESDIRECTORY\s+["\']ui/desktop/src/bin["\']\s*$',
            normalized,
        )
        and re.search(
            r'(?im)^\s*\$resourcesBin\s*=\s*Join-Path\s+'
            r'\$packaged\s+["\']resources/bin["\']\s*$',
            normalized,
        )
        and re.search(
            r'(?im)^\s*Copy-Item\s+-Path\s+["\']\$srcBin/\*["\']\s+'
            r'-Destination\s+\$resourcesBin\s+-Recurse\s+-Force\s*$',
            normalized,
        )
    )


def uses_approved_installer_validation(script: str) -> bool:
    return bool(
        re.search(
            r"(?is)if\s*\(\s*-not\s*\(Test-Path\s+\$installer\)\s*"
            r"-or\s*\(Get-Item\s+\$installer\)\.Length\s+-eq\s+0\s*\)\s*"
            r"\{[^}]*throw",
            script,
        )
    )


def forbidden_publication_or_archive_steps(steps: list[dict]) -> list[dict]:
    forbidden = []
    for step in steps:
        if not isinstance(step, dict):
            continue

        task = str(step.get("task", ""))
        step_text = str(step)
        if re.search(
            r"(?i)PublishBuildArtifacts|UniversalPackages|CopyFiles|ArchiveFiles",
            task,
        ) or re.search(
            r"(?i)artifact\.upload|\baz\s+artifacts\b|Compress-Archive|"
            r"\btar(?:\.exe)?\s+-a\b|"
            r"7z(?:\.exe)?\s+a\b.*(?:-tzip|\.zip)|portableFileName|\.zip\b",
            step_text,
        ):
            forbidden.append(step)
    return forbidden


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

        desktop_builds = []
        for script in scripts:
            normalized = script.replace("\\", "/")
            enters_desktop = re.search(
                r'(?i)(?:Set-Location|cd)\s+["\']?(?:\./)?ui/desktop["\']?',
                normalized,
            )
            if (
                enters_desktop
                and "prepare-platform-binaries.js" in normalized
                and "pnpm run package:windows -- --arch=$env:ELECTRON_ARCH"
                in normalized
                and "resolveWindowsPackage" in normalized
                and "ARTIFACT_ARCH" in normalized
                and uses_approved_runtime_copy(script)
            ):
                desktop_builds.append(script)

        self.assertEqual(1, len(desktop_builds))
        self.assertTrue(
            uses_approved_runtime_copy(desktop_builds[0]),
            "Azure pipeline must use the approved src/bin to resources/bin copy",
        )

    def test_azure_publishes_only_architecture_specific_installers(self) -> None:
        pipeline = load_yaml(AZURE_PIPELINE)
        steps = pipeline.get("steps", [])
        publish_shorthand = [
            step
            for step in steps
            if isinstance(step, dict) and "publish" in step
        ]
        self.assertEqual([], publish_shorthand)

        publish_tasks = [
            step
            for step in steps
            if isinstance(step, dict)
            and re.search(
                r"(?i)PublishPipelineArtifact",
                str(step.get("task", "")),
            )
        ]
        self.assertEqual(1, len(publish_tasks))
        publish = publish_tasks[0]
        self.assertEqual("PublishPipelineArtifact@1", publish.get("task"))
        self.assertEqual([], forbidden_publication_or_archive_steps(steps))

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

        publish_inputs = publish.get("inputs", {})
        self.assertEqual(artifact_name, publish_inputs.get("artifact"))
        self.assertEqual(
            f"$(Build.ArtifactStagingDirectory)/{artifact_name}",
            str(publish_inputs.get("targetPath", "")).replace("\\", "/"),
        )

    def test_azure_stages_and_validates_only_the_setup_executable(self) -> None:
        pipeline = load_yaml(AZURE_PIPELINE)
        installer_scripts = [
            script
            for script in powershell_scripts(pipeline)
            if "desktop-setup.iss" in script
        ]
        self.assertEqual(1, len(installer_scripts))
        installer = installer_scripts[0]
        self.assertIn(
            '$outputDir = Join-Path $env:BUILD_ARTIFACTSTAGINGDIRECTORY '
            '"AIBuddy-windows-$env:ARTIFACT_ARCH-setup"',
            installer,
        )
        self.assertRegex(
            installer,
            r"windows-package\.js.*\$env:ARTIFACT_ARCH.*\$outputDir",
        )
        self.assertRegex(
            installer,
            r'(?i)&\s+\$iscc\s+@\(\$pkg\.isccArgs\)\s+'
            r'["\']ui[\\/]desktop[\\/]desktop-setup\.iss["\']',
        )
        self.assertIn(
            "$installer = Join-Path $outputDir $pkg.setupFileName",
            installer,
        )
        self.assertTrue(
            uses_approved_installer_validation(installer),
            "Installer validation must check missing and empty in one throwing if",
        )

    def test_azure_has_no_cli_or_portable_artifact_paths(self) -> None:
        pipeline = load_yaml(AZURE_PIPELINE)
        pipeline_text = AZURE_PIPELINE.read_text(encoding="utf-8-sig")
        steps = pipeline.get("steps", [])
        scripts = powershell_scripts(pipeline)
        aliases = powershell_aliases(scripts)
        self.assertFalse(
            any(
                "artifactstagingdirectory" in destination
                or "$outputdir" in destination
                or "aibuddy-windows-$env:artifact_arch-setup" in destination
                for script in scripts
                for destination in powershell_copy_destinations(
                    script,
                    aliases,
                )
            ),
            "Azure pipeline must not copy standalone payloads into setup staging",
        )
        self.assertEqual([], forbidden_publication_or_archive_steps(steps))

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
