#!/bin/bash
# Extract CLI command structure from heybuddy at a specific version
# Usage: ./extract-cli-structure.sh <version>
# Example: ./extract-cli-structure.sh v1.15.0
#
# For tagged releases (v*), downloads pre-built binary from GitHub releases.
# For HEAD or non-release refs, builds from source.

set -e
set -o pipefail

VERSION=${1:-"HEAD"}
HEYBUDDY_REPO=${HEYBUDDY_REPO:-"$HOME/Development/heybuddy"}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Check if version is a release tag (starts with 'v' followed by numbers)
is_release_tag() {
    [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Download pre-built binary for a release version
download_release_binary() {
    local version=$1
    local safe_version=${version//\//-}
    local bin_dir="$TEMP_DIR/bin"
    mkdir -p "$bin_dir"
    
    echo "Downloading heybuddy $version from GitHub releases..." >&2
    
    # Use the official download script with custom bin dir and specific version
    curl -fsSL "https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh" | \
        CONFIGURE=false HEYBUDDY_BIN_DIR="$bin_dir" HEYBUDDY_VERSION="$version" bash >&2 2>&1 || {
        echo "Error: Failed to download heybuddy $version" >&2
        return 1
    }
    
    echo "$bin_dir/heybuddy"
}

# Build heybuddy from source
build_from_source() {
    local version=$1
    local safe_version=${version//\//-}
    
    if [ ! -d "$HEYBUDDY_REPO" ]; then
        echo "Error: HEYBUDDY_REPO directory not found: $HEYBUDDY_REPO" >&2
        exit 1
    fi
    
    cd "$HEYBUDDY_REPO"
    
    if [ "$version" = "HEAD" ]; then
        echo "Building heybuddy from HEAD..." >&2
        cargo build --release --quiet >&2 2>&1 || {
            echo "Error: Failed to build heybuddy from HEAD" >&2
            return 1
        }
        echo "$HEYBUDDY_REPO/target/release/heybuddy"
    else
        # Verify version exists
        if ! git rev-parse "$version" >/dev/null 2>&1; then
            echo "Error: Version $version not found in git history" >&2
            return 1
        fi
        
        echo "Building heybuddy from $version..." >&2
        
        # Create a worktree for the version
        local worktree_dir="$TEMP_DIR/heybuddy-$safe_version"
        git worktree add --quiet "$worktree_dir" "$version" >&2 2>&1 || {
            echo "Error: Failed to create worktree for $version" >&2
            return 1
        }
        
        cd "$worktree_dir"
        cargo build --release --quiet >&2 2>&1 || {
            echo "Error: Failed to build heybuddy from $version" >&2
            cd "$HEYBUDDY_REPO"
            git worktree remove "$worktree_dir" 2>/dev/null || true
            return 1
        }
        
        # Clean up worktree but keep the binary accessible
        local bin_path="$worktree_dir/target/release/heybuddy"
        local temp_bin="$TEMP_DIR/heybuddy-$safe_version-bin"
        cp "$bin_path" "$temp_bin"
        
        cd "$HEYBUDDY_REPO"
        git worktree remove "$worktree_dir" 2>/dev/null || true
        
        echo "$temp_bin"
    fi
}

# Get the heybuddy binary
if is_release_tag "$VERSION"; then
    HEYBUDDY_BIN=$(download_release_binary "$VERSION")
else
    HEYBUDDY_BIN=$(build_from_source "$VERSION")
fi

if [ -z "$HEYBUDDY_BIN" ] || [ ! -x "$HEYBUDDY_BIN" ]; then
    echo "Error: HeyBuddy binary not found or not executable" >&2
    exit 1
fi

echo "Using binary: $HEYBUDDY_BIN" >&2
echo "Binary version: $($HEYBUDDY_BIN --version 2>&1)" >&2

# Run the Python extraction script
python3 "$SCRIPT_DIR/extract-cli-structure.py" "$HEYBUDDY_BIN" "$VERSION"
