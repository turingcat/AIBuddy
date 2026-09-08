#!/usr/bin/env node
// Compatibility smoke test: boot the freshly-built heybuddy binary via `heybuddy acp`
// and call every read-only ACP method through the freshly-built SDK. The
// generated client validates every response with Zod, so any schema drift
// between the binary and the SDK client fails this check and blocks the
// publish.
//
// Run with:
//   HEYBUDDY_BINARY=/path/to/heybuddy node ui/sdk/scripts/check-binary-compat.mjs
//
// Or via package script:
//   HEYBUDDY_BINARY=/path/to/heybuddy pnpm --filter @heybuddy/heybuddy-sdk run check:compat

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Writable } from "node:stream";

const SDK_ROOT = resolve(new URL("..", import.meta.url).pathname);
const SDK_DIST = join(SDK_ROOT, "dist");

if (!existsSync(SDK_DIST)) {
  console.error(
    `[compat] expected built SDK at ${SDK_DIST} — run pnpm build first`,
  );
  process.exit(1);
}

const HEYBUDDY_BINARY = process.env.HEYBUDDY_BINARY;
if (!HEYBUDDY_BINARY || !existsSync(HEYBUDDY_BINARY)) {
  console.error(
    `[compat] HEYBUDDY_BINARY must point to a built heybuddy binary (got: ${HEYBUDDY_BINARY ?? "<unset>"})`,
  );
  process.exit(1);
}

const { HeyBuddyExtClient } = await import(join(SDK_DIST, "index.js"));
const {
  client: createAcpClient,
  methods,
  PROTOCOL_VERSION,
  ndJsonStream,
} = await import("@agentclientprotocol/sdk");

// Each entry is a read-only ACP method we expect to succeed against a fresh,
// unconfigured heybuddy install. Platform-specific skips keep hardware-sensitive
// checks from turning local environment quirks into publish blockers.
const READ_ONLY_CHECKS = [
  {
    name: "providersList_unstable",
    call: (c) => c.heybuddy.providersList_unstable({ providerIds: [] }),
  },
  {
    name: "providersCatalogList_unstable",
    call: (c) => c.heybuddy.providersCatalogList_unstable({}),
  },
  {
    name: "providersSetupCatalogList_unstable",
    call: (c) => c.heybuddy.providersSetupCatalogList_unstable({}),
  },
  {
    name: "defaultsRead_unstable",
    call: (c) => c.heybuddy.defaultsRead_unstable({}),
  },
  {
    name: "preferencesRead_unstable",
    call: (c) => c.heybuddy.preferencesRead_unstable({}),
  },
  {
    name: "sourcesList_unstable",
    call: (c) => c.heybuddy.sourcesList_unstable({}),
  },
  {
    name: "dictationConfig_unstable",
    skipIf: () => process.platform === "darwin",
    skipReason:
      "skipped on macOS because local-inference Metal probing can panic before returning a schema response",
    call: (c) => c.heybuddy.dictationConfig_unstable({}),
  },
  {
    name: "dictationModelsList_unstable",
    call: (c) => c.heybuddy.dictationModelsList_unstable({}),
  },
  {
    name: "configExtensionsList_unstable",
    call: (c) => c.heybuddy.configExtensionsList_unstable({}),
  },
];

const sandbox = mkdtempSync(join(tmpdir(), "heybuddy-compat-"));
const env = {
  ...process.env,
  HOME: sandbox,
  XDG_CONFIG_HOME: join(sandbox, ".config"),
  XDG_DATA_HOME: join(sandbox, ".local/share"),
  XDG_STATE_HOME: join(sandbox, ".local/state"),
  XDG_CACHE_HOME: join(sandbox, ".cache"),
  HEYBUDDY_CONFIG_DIR: join(sandbox, ".config/heybuddy"),
};

console.log(`[compat] using binary: ${HEYBUDDY_BINARY}`);
console.log(`[compat] sandbox HOME: ${sandbox}`);
console.log(`[compat] binary size: ${statSync(HEYBUDDY_BINARY).size} bytes`);

const child = spawn(HEYBUDDY_BINARY, ["acp"], {
  stdio: ["pipe", "pipe", "inherit"],
  env,
});

let exitedEarly = false;
child.on("exit", (code, signal) => {
  if (!exitedEarly) {
    console.error(
      `[compat] heybuddy acp exited unexpectedly (code=${code} signal=${signal})`,
    );
  }
});
child.on("error", (err) => {
  console.error(`[compat] failed to spawn heybuddy acp: ${err.message}`);
  process.exit(1);
});

const stream = ndJsonStream(
  Writable.toWeb(child.stdin),
  Readable.toWeb(child.stdout),
);

const app = createAcpClient({ name: "publish-npm-compat" })
  .onRequest(methods.client.session.requestPermission, async () => ({
    outcome: { outcome: "cancelled" },
  }))
  .onNotification(methods.client.session.update, async () => {});
const connection = app.connect(stream);
const client = {
  connection,
  heybuddy: new HeyBuddyExtClient(connection.agent),
};

let failed = 0;
let passed = 0;

const timeout = (ms, label) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
  );

try {
  await Promise.race([
    client.connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "publish-npm-compat", version: "0.0.0" },
      clientCapabilities: {},
    }),
    timeout(15_000, "initialize"),
  ]);
  console.log("[compat] ✅ initialize");

  for (const check of READ_ONLY_CHECKS) {
    if (check.skipIf?.()) {
      console.log(`[compat] ⏭️ ${check.name} (${check.skipReason})`);
      continue;
    }

    try {
      await Promise.race([check.call(client), timeout(15_000, check.name)]);
      console.log(`[compat] ✅ ${check.name}`);
      passed += 1;
    } catch (err) {
      failed += 1;
      const msg =
        err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.error(`[compat] ❌ ${check.name}`);
      console.error(indent(msg, "  "));
    }
  }
} finally {
  exitedEarly = true;
  connection.close();
  child.kill("SIGTERM");
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

if (failed > 0) {
  console.error(
    `\n[compat] ${failed} check(s) failed, ${passed} passed — refusing to publish.`,
  );
  console.error(
    "[compat] This means the SDK's generated client schema doesn't match what",
  );
  console.error(
    "[compat] the heybuddy binary returns. Regenerate the SDK or fix the server DTO.",
  );
  process.exit(1);
}

console.log(`\n[compat] all ${passed} checks passed.`);
process.exit(0);

function indent(s, prefix) {
  return s
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}
