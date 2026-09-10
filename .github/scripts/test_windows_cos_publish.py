import importlib.util
from pathlib import Path
import hashlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('windows_cos_publish.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
VERSION = '1.0.6-b09092210'
NAMES = [f'AIBuddy-windows-{arch}-V{VERSION}.exe' for arch in ('x32', 'x64')]
PREFIX = 'aibuddy/stable/'


class FakeCos:
    def __init__(self, fail='', truncated=False):
        self.objects = {
            PREFIX + 'AIBuddy-windows-x32-setup.exe': b'old',
            PREFIX + 'AIBuddy-windows-x64-V1.0.5-b09082210.exe': b'old',
            PREFIX + 'other.exe': b'keep',
            PREFIX + 'nested/AIBuddy-windows-x32-setup.exe': b'keep',
            PREFIX + 'README': b'previous',
        }
        self.fail = fail
        self.calls = []
        self.truncated = truncated

    def list_objects(self, **args):
        self.calls.append(('list', args))
        if self.fail == 'list':
            raise RuntimeError('list failed')
        keys = list(self.objects)
        if self.truncated and 'Marker' not in args:
            return {'Contents': [{'Key': keys[0]}], 'IsTruncated': 'true', 'NextMarker': keys[0]}
        return {'Contents': [{'Key': key} for key in keys[int(self.truncated):]], 'IsTruncated': 'false'}

    def put_object(self, **args):
        key = args['Key']
        self.calls.append(('put', key))
        if self.fail and self.fail in key:
            raise RuntimeError('upload failed')
        self.objects[key] = args['Body'].read()

    def head_object(self, **args):
        data = self.objects[args['Key']]
        return {'Content-Length': str(len(data)), 'ETag': 'bad' if self.fail == 'verify' else hashlib.md5(data).hexdigest()}

    def delete_object(self, **args):
        self.calls.append(('delete', args['Key']))
        if self.fail == 'delete':
            raise RuntimeError('delete failed')
        del self.objects[args['Key']]


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'README').write_text(f'VERSION=V{VERSION}')
        for name in NAMES:
            (self.root / name).write_bytes(b'installer')

    def test_upload_verify_manifest_then_cleanup_with_pagination(self):
        client = FakeCos(truncated=True)
        publisher.publish(client, self.root)
        puts = [key for op, key in client.calls if op == 'put']
        self.assertEqual(puts, [PREFIX + name for name in [*NAMES, 'README']])
        self.assertEqual(client.objects[PREFIX + 'README'], f'VERSION=V{VERSION}'.encode())
        self.assertEqual(set(client.objects), {PREFIX + name for name in [*NAMES, 'README', 'other.exe', 'nested/AIBuddy-windows-x32-setup.exe']})
        self.assertLess(client.calls.index(('put', PREFIX + 'README')), next(i for i, call in enumerate(client.calls) if call[0] == 'delete'))
        self.assertEqual(len([c for c in client.calls if c[0] == 'list']), 2)

    def test_failures_never_remove_old_installers(self):
        for failure in ['list', NAMES[0], NAMES[1], 'README', 'verify']:
            with self.subTest(failure=failure):
                client = FakeCos(fail=failure)
                with self.assertRaises(RuntimeError):
                    publisher.publish(client, self.root)
                self.assertFalse(any(op == 'delete' for op, _ in client.calls))
                if failure != 'README':
                    self.assertEqual(client.objects[PREFIX + 'README'], b'previous')

    def test_existing_version_is_immutable_before_any_upload(self):
        client = FakeCos()
        client.objects[PREFIX + NAMES[0]] = b'current live x32'
        client.objects[PREFIX + NAMES[1]] = b'current live x64'
        client.objects[PREFIX + 'README'] = f'VERSION=V{VERSION}'.encode()
        before = dict(client.objects)
        with self.assertRaises(ValueError):
            publisher.publish(client, self.root)
        self.assertEqual(client.objects, before)
        self.assertFalse(any(op in ('put', 'delete') for op, _ in client.calls))

    def test_retries_reuse_identical_existing_installer(self):
        client = FakeCos()
        client.objects[PREFIX + NAMES[0]] = b'installer'
        publisher.publish(client, self.root)
        self.assertNotIn(('put', PREFIX + NAMES[0]), client.calls)
        self.assertIn(('put', PREFIX + NAMES[1]), client.calls)

    def test_missing_readme_and_invalid_pagination_never_upload(self):
        (self.root / 'README').unlink()
        client = FakeCos()
        with self.assertRaisesRegex(ValueError, 'Missing release README'):
            publisher.publish(client, self.root)
        self.assertEqual(client.calls, [])
        (self.root / 'README').write_text(f'VERSION=V{VERSION}')
        client.list_objects = lambda **args: {'IsTruncated': 'true', 'NextMarker': ''}
        with self.assertRaisesRegex(RuntimeError, 'pagination marker'):
            publisher.publish(client, self.root)
        self.assertFalse(any(op in ('put', 'delete') for op, _ in client.calls))

    def test_cleanup_failure_is_reported(self):
        with self.assertRaises(RuntimeError):
            publisher.publish(FakeCos(fail='delete'), self.root)

    def test_invalid_manifest_and_missing_empty_or_extra_installers_fail_before_network(self):
        for value in ['', 'VERSION=V1.0.6', 'VERSION=V1.0.6-b13992210', '../evil', f'VERSION=V{VERSION}\nextra']:
            (self.root / 'README').write_text(value)
            client = FakeCos()
            with self.assertRaises(ValueError):
                publisher.publish(client, self.root)
            self.assertEqual(client.calls, [])
        (self.root / 'README').write_text(f'VERSION=V{VERSION}')
        for value in [b'', None]:
            path = self.root / NAMES[1]
            path.write_bytes(b'') if value == b'' else path.unlink()
            client = FakeCos()
            with self.assertRaises(ValueError):
                publisher.publish(client, self.root)
            self.assertEqual(client.calls, [])

    def test_unexpected_version_is_rejected(self):
        (self.root / 'AIBuddy-windows-x64-V9.0.0-b09092210.exe').write_bytes(b'extra')
        client = FakeCos()
        with self.assertRaises(ValueError):
            publisher.publish(client, self.root)
        self.assertEqual(client.calls, [])


if __name__ == '__main__':
    unittest.main()
