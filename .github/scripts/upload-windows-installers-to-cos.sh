#!/usr/bin/env bash

set -euo pipefail

: "${TENCENT_CLOUD_SECRET_ID:?TENCENT_CLOUD_SECRET_ID is required}"
: "${TENCENT_CLOUD_SECRET_KEY:?TENCENT_CLOUD_SECRET_KEY is required}"

readonly COS_BUCKET="aibuddy-1252724067"
readonly COS_ENDPOINT="aibuddy-1252724067.cos.ap-guangzhou.myqcloud.com"
readonly COS_PREFIX="aibuddy/stable"
readonly COSCLI_VERSION="1.0.9"
readonly COSCLI_SHA256="a07de5ba2800147a700ed29036b0c76a4229088cee68e1682d0eae19b638a915"
readonly -a INSTALLERS=(
  "AIBuddy-windows-x32-setup.exe"
  "AIBuddy-windows-x64-setup.exe"
)

for installer in "${INSTALLERS[@]}"; do
  if [[ ! -s "$installer" ]]; then
    echo "Missing or empty Windows installer: $installer" >&2
    exit 1
  fi
done

if [[ -n "${COSCLI_BIN:-}" ]]; then
  coscli="$COSCLI_BIN"
else
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  coscli="$temp_dir/coscli"
  coscli_url="https://github.com/tencentyun/coscli/releases/download/v${COSCLI_VERSION}/coscli-v${COSCLI_VERSION}-linux-amd64"

  curl --fail --location --silent --show-error "$coscli_url" --output "$coscli"
  printf '%s  %s\n' "$COSCLI_SHA256" "$coscli" | sha256sum --check --status
  chmod +x "$coscli"
fi

if [[ ! -x "$coscli" ]]; then
  echo "COSCLI is not executable: $coscli" >&2
  exit 1
fi

for installer in "${INSTALLERS[@]}"; do
  "$coscli" \
    --secret-id "$TENCENT_CLOUD_SECRET_ID" \
    --secret-key "$TENCENT_CLOUD_SECRET_KEY" \
    --endpoint "$COS_ENDPOINT" \
    --customized \
    --init-skip \
    --disable-log \
    cp "$installer" "cos://${COS_BUCKET}/${COS_PREFIX}/${installer}"
done
