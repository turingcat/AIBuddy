# @aibuddy/aibuddy-sdk

TypeScript client library for the AIBuddy Agent Client Protocol (ACP).

This package provides:

- TypeScript types and Zod validators for AIBuddy ACP extension methods
- A client for communicating with the AIBuddy ACP server

## Installation

```bash
npm install @aibuddy/aibuddy-sdk @agentclientprotocol/sdk
```

The native `aibuddy` binaries are distributed as optional dependencies
and will be automatically installed for your platform.

## Development

### Prerequisites

- Node.js 18+
- Rust toolchain
- (Optional) Cross-compilation toolchains for building all platforms

### Building

```bash
# Build everything (schema + TypeScript)
npm run build

# Build just the schema (requires Rust)
npm run build:schema

# Build just the TypeScript
npm run build:ts

# Build native binary for current platform
npm run build:native

# Build native binaries for all platforms
npm run build:native:all
```

### Local Development with npm link

To use this package locally in another project:

```bash
# In ui/sdk
npm run build
npm link

# In the consuming project
npm link @aibuddy/aibuddy-sdk
```

### Schema Generation

The TypeScript types are generated from Rust schemas defined in `crates/aibuddy`.
The build process:

1. Builds the `generate-acp-schema` Rust binary
2. Runs it to generate `acp-schema.json` and `acp-meta.json`
3. Uses `@hey-api/openapi-ts` to generate TypeScript types and Zod validators
4. Generates a typed client in `src/generated/client.gen.ts`

To regenerate schemas after changing Rust types:

```bash
npm run build:schema
```

## Native Binary Packages

Platform-specific npm packages for the `aibuddy` binary are located in
`ui/aibuddy-binary/`:

| Package                           | Platform            |
| --------------------------------- | ------------------- |
| `@aibuddy/aibuddy-binary-darwin-arm64` | macOS Apple Silicon |
| `@aibuddy/aibuddy-binary-linux-arm64` | Linux ARM64 |
| `@aibuddy/aibuddy-binary-linux-x64` | Linux x64 |
| `@aibuddy/aibuddy-binary-win32-x64` | Windows x64 |

These are published separately from `@aibuddy/aibuddy-sdk`.

### Building Native Binaries

```bash
# Build for current platform
npm run build:native

# Build for all platforms (requires cross-compilation toolchains)
npm run build:native:all

# Build for specific platform(s)
npx tsx scripts/build-native.ts darwin-arm64 linux-x64
```

## Publishing

Publishing is handled by GitHub Actions. See `.github/workflows/publish-npm.yml`.

For manual publishing:

```bash
# From repository root
./ui/scripts/publish.sh --real
```

This will:

1. Build and publish `@aibuddy/aibuddy-sdk`
2. Publish all native binary packages

## Usage

Compose the ACP client with the standard ACP SDK, then use `AIBuddyExtClient` for
typed AIBuddy extension methods:

```typescript
import {
  client as createAcpClient,
  methods,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import { createWebSocketStream } from "@agentclientprotocol/sdk/experimental/ws-client";
import { AIBuddyExtClient } from "@aibuddy/aibuddy-sdk";

const app = createAcpClient({ name: "my-client" });
const stream = createWebSocketStream("ws://localhost:3000/acp");
const connection = app.connect(stream);
const aibuddy = new AIBuddyExtClient(connection.agent);

await connection.agent.request(methods.agent.initialize, {
  protocolVersion: PROTOCOL_VERSION,
  clientInfo: { name: "my-client", version: "1.0.0" },
  clientCapabilities: {},
});

const providers = await aibuddy.providersList_unstable({ providerIds: [] });
```

See the [main documentation](../../README.md) for more details.
