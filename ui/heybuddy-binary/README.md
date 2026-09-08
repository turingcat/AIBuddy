# Native Binary Packages for heybuddy

This directory contains the npm package scaffolding for distributing the
`heybuddy` Rust binary as platform-specific npm packages.

## Packages

| Package | Platform |
|---------|----------|
| `@heybuddy/heybuddy-binary-darwin-arm64` | macOS Apple Silicon |
| `@heybuddy/heybuddy-binary-linux-arm64` | Linux ARM64 |
| `@heybuddy/heybuddy-binary-linux-x64` | Linux x64 |
| `@heybuddy/heybuddy-binary-win32-x64` | Windows x64 |

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

The built binaries are placed into `ui/heybuddy-binary/heybuddy-binary-{platform}/bin/`.
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

This will publish all native packages along with `@heybuddy/heybuddy-sdk`.

## Usage

These packages are installed as optional dependencies by `@heybuddy/heybuddy-sdk`, which
resolves the appropriate package for the user's platform automatically. See
`ui/sdk/src/resolve-binary.ts` for how the binary path is resolved.
