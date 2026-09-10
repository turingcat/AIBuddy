import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { isAbsolute, join, relative, resolve } from "node:path";

import * as publicApi from "../dist/index.js";
import { resolveAIBuddyBinaryForRuntime } from "../dist/resolve-binary.js";

const supportedPlatforms = [
  ["darwin", "arm64", "@aibuddy/aibuddy-binary-darwin-arm64", "aibuddy"],
  ["linux", "arm64", "@aibuddy/aibuddy-binary-linux-arm64", "aibuddy"],
  ["linux", "x64", "@aibuddy/aibuddy-binary-linux-x64", "aibuddy"],
  ["win32", "x64", "@aibuddy/aibuddy-binary-win32-x64", "aibuddy.exe"],
];

function setAIBuddyBinary(t, value) {
  const original = process.env.AIBUDDY_BINARY;
  process.env.AIBUDDY_BINARY = value;
  t.after(() => {
    if (original === undefined) {
      delete process.env.AIBUDDY_BINARY;
    } else {
      process.env.AIBUDDY_BINARY = original;
    }
  });
}

for (const [
  platform,
  arch,
  packageName,
  executableName,
] of supportedPlatforms) {
  test(`resolves ${platform}-${arch}`, () => {
    let resolvedSpecifier;
    let checkedPath;
    const fixturePackageRoot = join("/fixtures", packageName);

    const result = resolveAIBuddyBinaryForRuntime(platform, arch, {
      resolvePackageJson(specifier) {
        resolvedSpecifier = specifier;
        return join(fixturePackageRoot, "package.json");
      },
      isFile(path) {
        checkedPath = path;
        return true;
      },
    });

    assert.equal(resolvedSpecifier, `${packageName}/package.json`);
    assert.equal(result, resolve(fixturePackageRoot, "bin", executableName));
    assert.equal(checkedPath, result);
    assert.equal(isAbsolute(result), true);
  });
}

test("exports only the public resolver from the package root", () => {
  assert.deepEqual(Object.keys(publicApi), ["resolveAIBuddyBinary"]);
});

test("uses AIBUDDY_BINARY as an explicit override", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "aibuddy-acp-override-"));
  const binaryPath = join(directory, "aibuddy");
  writeFileSync(binaryPath, "");
  setAIBuddyBinary(t, relative(process.cwd(), binaryPath));

  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  assert.equal(publicApi.resolveAIBuddyBinary(), binaryPath);
});

test("rejects an invalid AIBUDDY_BINARY override", (t) => {
  setAIBuddyBinary(t, "missing-aibuddy-binary");

  assert.throws(
    () => publicApi.resolveAIBuddyBinary(),
    /AIBUDDY_BINARY does not point to a file/,
  );
});

test("reports unsupported platform and architecture combinations", () => {
  assert.throws(
    () =>
      resolveAIBuddyBinaryForRuntime("freebsd", "x64", {
        resolvePackageJson() {
          throw new Error("should not resolve a package");
        },
        isFile() {
          return false;
        },
      }),
    /No AIBuddy npm binary is available for freebsd-x64/,
  );
});

test("reports a missing optional platform package", () => {
  assert.throws(
    () =>
      resolveAIBuddyBinaryForRuntime("linux", "x64", {
        resolvePackageJson() {
          throw new Error("module not found");
        },
        isFile() {
          return false;
        },
      }),
    /AIBuddy binary package @aibuddy\/aibuddy-binary-linux-x64 is not installed/,
  );
});

test("reports a missing executable in an installed platform package", () => {
  assert.throws(
    () =>
      resolveAIBuddyBinaryForRuntime("darwin", "arm64", {
        resolvePackageJson() {
          return join(
            "/fixtures",
            "@aibuddy/aibuddy-binary-darwin-arm64/package.json",
          );
        },
        isFile() {
          return false;
        },
      }),
    /AIBuddy executable from @aibuddy\/aibuddy-binary-darwin-arm64 was not found/,
  );
});
