#!/usr/bin/env bash
set -euo pipefail

: "${TENCENT_CLOUD_SECRET_ID:?TENCENT_CLOUD_SECRET_ID is required}"
: "${TENCENT_CLOUD_SECRET_KEY:?TENCENT_CLOUD_SECRET_KEY is required}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -c 'import runpy; from pathlib import Path; import sys; runpy.run_path(sys.argv[1])["release_files"](Path.cwd())' "$script_dir/windows_cos_publish.py"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
python3 -m venv "$temp_dir/venv"
"$temp_dir/venv/bin/python" -m pip install --quiet --disable-pip-version-check cos-python-sdk-v5==1.9.38
"$temp_dir/venv/bin/python" "$script_dir/windows_cos_publish.py"
