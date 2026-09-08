import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const PLATFORMS: Record<string, string> = {
  "darwin-arm64": "@aibuddy/aibuddy-binary-darwin-arm64",
  "linux-arm64": "@aibuddy/aibuddy-binary-linux-arm64",
  "linux-x64": "@aibuddy/aibuddy-binary-linux-x64",
  "win32-x64": "@aibuddy/aibuddy-binary-win32-x64",
};

/**
 * Resolves the path to the aibuddy binary.
 *
 * Resolution order:
 *   1. `AIBUDDY_BINARY` environment variable (explicit override)
 *   2. Platform-specific `@aibuddy/aibuddy-binary-*` optional dependency
 *
 * @throws if no binary can be found
 */
export function resolveAIBuddyBinary(): string {
  const envBinary = process.env.AIBUDDY_BINARY;
  if (envBinary) return envBinary;

  const key = `${process.platform}-${process.arch}`;
  const pkg = PLATFORMS[key];
  if (!pkg) {
    throw new Error(
      `No aibuddy binary available for ${key}. Set AIBUDDY_BINARY to the path of a aibuddy binary.`,
    );
  }

  try {
    const require = createRequire(import.meta.url);
    const pkgDir = dirname(require.resolve(`${pkg}/package.json`));
    const binName = process.platform === "win32" ? "aibuddy.exe" : "aibuddy";
    return join(pkgDir, "bin", binName);
  } catch {
    throw new Error(
      `aibuddy binary package ${pkg} is not installed. Set AIBUDDY_BINARY or install the native package.`,
    );
  }
}
