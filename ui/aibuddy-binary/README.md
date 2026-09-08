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

## Building

From the repository root:

```bash
# Build for current platform only
cd ui/sdk
npm run build:native

# Build for all platforms (requires cross-compilation toolchains)
npm run build:native:all

# Build for specific platform(s)
npx tsx scripts/build-native.ts darwin-arm64 linux-x64
```

The built binaries are placed into `ui/aibuddy-binary/aibuddy-binary-{platform}/bin/`.
These directories are git-ignored.

Linux native binaries are built with local inference Vulkan support. Linux build
hosts need Vulkan headers and `glslc`; Linux runtime hosts need the Vulkan loader
package, such as `libvulkan1` on Debian/Ubuntu or `vulkan-loader` on RPM-based
distributions.

## Publishing

Publishing is handled by GitHub Actions. See `.github/workflows/publish-npm.yml`.

For manual publishing:

```bash
# From repository root
./ui/scripts/publish.sh --real
```

This will publish all native packages along with `@aibuddy/aibuddy-sdk`.

## Usage

These packages are installed as optional dependencies by `@aibuddy/aibuddy-sdk`, which
resolves the appropriate package for the user's platform automatically. See
`ui/sdk/src/resolve-binary.ts` for how the binary path is resolved.
