import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const PLATFORMS: Record<string, string> = {
  "darwin-arm64": "@heybuddy/heybuddy-binary-darwin-arm64",
  "linux-arm64": "@heybuddy/heybuddy-binary-linux-arm64",
  "linux-x64": "@heybuddy/heybuddy-binary-linux-x64",
  "win32-x64": "@heybuddy/heybuddy-binary-win32-x64",
};

/**
 * Resolves the path to the heybuddy binary.
 *
 * Resolution order:
 *   1. `HEYBUDDY_BINARY` environment variable (explicit override)
 *   2. Platform-specific `@heybuddy/heybuddy-binary-*` optional dependency
 *
 * @throws if no binary can be found
 */
export function resolveHeyBuddyBinary(): string {
  const envBinary = process.env.HEYBUDDY_BINARY;
  if (envBinary) return envBinary;

  const key = `${process.platform}-${process.arch}`;
  const pkg = PLATFORMS[key];
  if (!pkg) {
    throw new Error(
      `No heybuddy binary available for ${key}. Set HEYBUDDY_BINARY to the path of a heybuddy binary.`,
    );
  }

  try {
    const require = createRequire(import.meta.url);
    const pkgDir = dirname(require.resolve(`${pkg}/package.json`));
    const binName = process.platform === "win32" ? "heybuddy.exe" : "heybuddy";
    return join(pkgDir, "bin", binName);
  } catch {
    throw new Error(
      `heybuddy binary package ${pkg} is not installed. Set HEYBUDDY_BINARY or install the native package.`,
    );
  }
}
