import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/upload-windows-installers-to-cos.sh'


class UploadEntrypointTest(unittest.TestCase):
    def test_missing_credentials_or_files_fail_without_installing_sdk(self):
        with tempfile.TemporaryDirectory() as directory:
            for secret in ['', 'dummy']:
                result = subprocess.run(['bash', str(SCRIPT)], cwd=directory, capture_output=True, text=True,
                                        env={**os.environ, 'TENCENT_CLOUD_SECRET_ID': 'dummy',
                                             'TENCENT_CLOUD_SECRET_KEY': secret})
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('Collecting', result.stdout)
                self.assertIn('required' if not secret else 'Missing release README', result.stderr)

    def test_all_publishers_serialize_the_same_cos_prefix(self):
        for name in ['bundle-windows.yml', 'publish-existing-release.yml']:
            workflow = (ROOT / '.github/workflows' / name).read_text()
            self.assertIn('aibuddy-cos-stable', workflow)
            self.assertIn('cancel-in-progress: false', workflow)
            self.assertIn('TENCENT_CLOUD_SECRET_ID: ${{ secrets.TENCENT_CLOUD_SECRET_ID }}', workflow)
            self.assertIn('TENCENT_CLOUD_SECRET_KEY: ${{ secrets.TENCENT_CLOUD_SECRET_KEY }}', workflow)
            self.assertIn('.github/scripts/upload-windows-installers-to-cos.sh', workflow)
            self.assertNotIn('public-read', workflow)
            self.assertNotIn('grant-read', workflow)


if __name__ == '__main__':
    unittest.main()
