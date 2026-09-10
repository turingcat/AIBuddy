# Native Binary Packages for aibuddy

This directory contains the npm package scaffolding for distributing the
`aibuddy` Rust binary as platform-specific npm packages.

## Packages

| Package | Platform |
|---------|----------|
| `@aibuddy/aibuddy-binary-darwin-arm64` | macOS Apple Silicon |
| `@aibuddy/aibuddy-binary-linux-arm64` | Linux ARM64 |
| `@aibuddy/aibuddy-binary-linux-x64` | Linux x64 |
| `@aibuddy/aibuddy-binary-win32-x64` | Windows x64 |

## Usage

These are platform-specific implementation dependencies and are not intended
to be installed directly. Install `@aibuddy/aibuddy-acp` instead. It installs the
appropriate package automatically and provides the `aibuddy` command. Each
binary package contains its native executable. Its platform-specific internal
command preserves executable permissions during npm packing;
`@aibuddy/aibuddy-acp` remains the sole owner of the supported `aibuddy` command.

## Release preparation

The `ui/scripts/prepare-npm-packages.sh` script downloads binaries from an exact
versioned AIBuddy release and prepares verified platform package tarballs. The
unified AIBuddy release flow publishes those tarballs with
`ui/scripts/publish-npm-packages.sh`.
