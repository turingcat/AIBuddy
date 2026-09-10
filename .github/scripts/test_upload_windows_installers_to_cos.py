#!/usr/bin/env python3

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".github/scripts/upload-windows-installers-to-cos.sh"
INSTALLERS = (
    "AIBuddy-windows-x32-setup.exe",
    "AIBuddy-windows-x64-setup.exe",
)


class UploadWindowsInstallersToCosTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.directory = Path(self.temp_dir.name)
        self.capture = self.directory / "coscli-calls.jsonl"
        self.coscli = self.directory / "coscli"
        self.coscli.write_text(
            """#!/usr/bin/env python3
import json
import os
import sys

with open(os.environ["COSCLI_CAPTURE"], "a", encoding="utf-8") as capture:
    capture.write(json.dumps(sys.argv[1:]) + "\\n")

fail_on = os.environ.get("COSCLI_FAIL_ON")
if fail_on and any(fail_on in argument for argument in sys.argv[1:]):
    raise SystemExit(9)
""",
            encoding="utf-8",
        )
        self.coscli.chmod(0o755)

    def run_script(self, *, create_installers=INSTALLERS, extra_env=None):
        for installer in create_installers:
            (self.directory / installer).write_bytes(b"installer")

        env = os.environ.copy()
        env.update(
            {
                "COSCLI_BIN": str(self.coscli),
                "COSCLI_CAPTURE": str(self.capture),
                "TENCENT_CLOUD_SECRET_ID": "test-secret-id",
                "TENCENT_CLOUD_SECRET_KEY": "test-secret-key",
            }
        )
        if extra_env:
            env.update(extra_env)

        return subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=self.directory,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def calls(self):
        if not self.capture.exists():
            return []
        return [json.loads(line) for line in self.capture.read_text(encoding="utf-8").splitlines()]

    def test_uploads_only_the_two_stable_installer_objects(self) -> None:
        result = self.run_script()

        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(len(calls), 2)
        self.assertEqual(
            [call[-1] for call in calls],
            [
                "cos://aibuddy-1252724067/aibuddy/stable/AIBuddy-windows-x32-setup.exe",
                "cos://aibuddy-1252724067/aibuddy/stable/AIBuddy-windows-x64-setup.exe",
            ],
        )
        for call, installer in zip(calls, INSTALLERS, strict=True):
            self.assertIn("cp", call)
            self.assertIn(installer, call)
            self.assertIn("aibuddy-1252724067.cos.ap-guangzhou.myqcloud.com", call)
            self.assertIn("--customized", call)
            self.assertFalse(any("acl" in argument.lower() for argument in call))
            self.assertFalse(any("grant-" in argument.lower() for argument in call))

    def test_rejects_missing_credentials_before_uploading(self) -> None:
        result = self.run_script(extra_env={"TENCENT_CLOUD_SECRET_KEY": ""})

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_rejects_missing_installer_before_uploading(self) -> None:
        result = self.run_script(create_installers=(INSTALLERS[0],))

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_propagates_coscli_upload_failures(self) -> None:
        result = self.run_script(extra_env={"COSCLI_FAIL_ON": INSTALLERS[1]})

        self.assertEqual(result.returncode, 9)
        self.assertEqual(len(self.calls()), 2)

    def test_rejects_missing_secret_id(self) -> None:
        result = self.run_script(extra_env={"TENCENT_CLOUD_SECRET_ID": ""})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_rejects_missing_x32_before_uploading_x64(self) -> None:
        result = self.run_script(create_installers=(INSTALLERS[1],))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_rejects_empty_installer_before_uploading(self) -> None:
        for installer in INSTALLERS:
            (self.directory / installer).write_bytes(b"")
        result = self.run_script(create_installers=())
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_stops_after_first_upload_failure(self) -> None:
        result = self.run_script(extra_env={"COSCLI_FAIL_ON": INSTALLERS[0]})
        self.assertEqual(result.returncode, 9)
        self.assertEqual(len(self.calls()), 1)

    def test_rejects_non_executable_coscli(self) -> None:
        self.coscli.chmod(0o644)
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def bootstrap_environment(self, failure=""):
        tools = self.directory / "tools"
        tools.mkdir()
        curl = tools / "curl"
        curl.write_text(
            """#!/usr/bin/env python3
import os
import shutil
import sys
if os.environ.get("BOOTSTRAP_FAILURE") == "download":
    raise SystemExit(22)
assert "https://github.com/tencentyun/coscli/releases/download/v1.0.9/coscli-v1.0.9-linux-amd64" in sys.argv
destination = sys.argv[sys.argv.index("--output") + 1]
shutil.copyfile(os.environ["COSCLI_FIXTURE"], destination)
""",
            encoding="utf-8",
        )
        checksum = tools / "sha256sum"
        checksum.write_text(
            """#!/usr/bin/env python3
import os
import sys
assert sys.argv[1:] == ["--check", "--status"]
assert sys.stdin.read().split()[0] == "a07de5ba2800147a700ed29036b0c76a4229088cee68e1682d0eae19b638a915"
raise SystemExit(1 if os.environ.get("BOOTSTRAP_FAILURE") == "checksum" else 0)
""",
            encoding="utf-8",
        )
        for tool in (curl, checksum):
            tool.chmod(0o755)
        return {
            "COSCLI_BIN": "",
            "COSCLI_FIXTURE": str(self.coscli),
            "BOOTSTRAP_FAILURE": failure,
            "PATH": str(tools) + os.pathsep + os.environ["PATH"],
        }

    def test_downloads_and_checks_pinned_coscli_before_upload(self) -> None:
        result = self.run_script(extra_env=self.bootstrap_environment())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.calls()), 2)
        self.assertNotIn("test-secret", result.stdout + result.stderr)

    def test_download_failure_prevents_upload(self) -> None:
        result = self.run_script(extra_env=self.bootstrap_environment("download"))
        self.assertEqual(result.returncode, 22)
        self.assertEqual(self.calls(), [])

    def test_checksum_failure_prevents_upload(self) -> None:
        result = self.run_script(extra_env=self.bootstrap_environment("checksum"))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])


class CosReleaseWorkflowTest(unittest.TestCase):
    def test_tagged_release_uploads_to_cos_after_github_release(self) -> None:
        workflow = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")

        upload_step = workflow.index("- name: Upload Windows installers to COS")
        self.assertGreater(upload_step, workflow.index("- name: Release stable"))
        self.assertIn("bash .github/scripts/upload-windows-installers-to-cos.sh", workflow)
        self.assertIn(
            "TENCENT_CLOUD_SECRET_ID: ${{ secrets.TENCENT_CLOUD_SECRET_ID }}", workflow
        )
        self.assertIn(
            "TENCENT_CLOUD_SECRET_KEY: ${{ secrets.TENCENT_CLOUD_SECRET_KEY }}", workflow
        )
        self.assertIn("AIBuddy-windows-*-setup.exe", workflow)

    def test_recovery_release_restores_the_same_cos_objects(self) -> None:
        workflow = (ROOT / ".github/workflows/publish-existing-release.yml").read_text(
            encoding="utf-8"
        )

        upload_step = workflow.index("- name: Upload Windows installers to COS")
        self.assertGreater(upload_step, workflow.index("- name: Publish versioned release"))
        self.assertIn("bash .github/scripts/upload-windows-installers-to-cos.sh", workflow)
        self.assertIn("AIBuddy-windows-*-setup.exe", workflow)

    def test_release_workflows_do_not_manage_cos_access(self) -> None:
        workflows = "\n".join(
            (ROOT / path).read_text(encoding="utf-8")
            for path in (
                ".github/workflows/release.yml",
                ".github/workflows/publish-existing-release.yml",
            )
        ).lower()

        self.assertNotIn("public-read", workflows)
        self.assertNotIn("grant-read", workflows)
        self.assertNotIn("put-object-acl", workflows)


if __name__ == "__main__":
    unittest.main()
