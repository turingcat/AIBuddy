"""Publish a complete Windows release before removing obsolete installers."""

import hashlib
import os
from pathlib import Path
import re

BUCKET = 'aibuddy-1252724067'
REGION = 'ap-guangzhou'
PREFIX = 'aibuddy/stable/'
VERSION = r'\d+\.\d+\.\d+-b(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:[01]\d|2[0-3])[0-5]\d'
INSTALLER = re.compile(r'AIBuddy-windows-(?:x32|x64)-(?:setup|V' + VERSION + r')\.exe')


def release_files(directory):
    manifest = directory / 'README'
    if not manifest.is_file():
        raise ValueError('Missing release README')
    match = re.fullmatch(r'VERSION=V(' + VERSION + r')', manifest.read_text(encoding='utf-8'))
    if not match:
        raise ValueError('Invalid release README; expected VERSION=Vx.y.z-bMMDDHHmm')
    version = match[1]
    installers = [directory / f'AIBuddy-windows-{arch}-V{version}.exe' for arch in ('x32', 'x64')]
    if any(not path.is_file() or path.stat().st_size == 0 for path in installers):
        raise ValueError('Both nonempty Windows installers must match README')
    if set(directory.glob('AIBuddy-windows-*.exe')) != set(installers):
        raise ValueError('Unexpected Windows installers in release directory')
    return [*installers, manifest]


def old_installers(client):
    keys = []
    marker = ''
    while True:
        args = {'Bucket': BUCKET, 'Prefix': PREFIX}
        if marker:
            args['Marker'] = marker
        page = client.list_objects(**args)
        keys.extend(item['Key'] for item in page.get('Contents', [])
                    if INSTALLER.fullmatch(item['Key'][len(PREFIX):]) and item['Key'].startswith(PREFIX))
        if str(page.get('IsTruncated', 'false')).lower() != 'true':
            return keys
        next_marker = page.get('NextMarker', '')
        if not next_marker or next_marker <= marker:
            raise RuntimeError('COS returned an invalid pagination marker')
        marker = next_marker


def file_digest(path):
    digest = hashlib.md5()
    with path.open('rb') as body:
        for block in iter(lambda: body.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def matches_remote(client, path):
    remote = client.head_object(Bucket=BUCKET, Key=PREFIX + path.name)
    return (int(remote['Content-Length']) == path.stat().st_size
            and remote['ETag'].strip('"') == file_digest(path))


def upload_verified(client, path):
    with path.open('rb') as body:
        client.put_object(Bucket=BUCKET, Key=PREFIX + path.name, Body=body, EnableMD5=True,
                          CacheControl='no-cache', ContentType='text/plain; charset=utf-8'
                          if path.name == 'README' else 'application/octet-stream')
    if not matches_remote(client, path):
        raise RuntimeError(f'COS verification failed for {path.name}')


def publish(client, directory):
    files = release_files(Path(directory))
    previous = old_installers(client)
    existing = {key for key in previous if key in {PREFIX + path.name for path in files[:-1]}}
    for path in files[:-1]:
        if PREFIX + path.name in existing and not matches_remote(client, path):
            raise ValueError(f'Existing release is immutable: {path.name}; choose a new build version')
    for path in files:
        if PREFIX + path.name not in existing:
            upload_verified(client, path)
    current = {PREFIX + path.name for path in files}
    for key in previous:
        if key not in current:
            client.delete_object(Bucket=BUCKET, Key=key)


if __name__ == '__main__':
    from qcloud_cos import CosConfig, CosS3Client

    config = CosConfig(Region=REGION, SecretId=os.environ['TENCENT_CLOUD_SECRET_ID'],
                       SecretKey=os.environ['TENCENT_CLOUD_SECRET_KEY'], Scheme='https')
    publish(CosS3Client(config), Path.cwd())
