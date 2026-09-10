# @aibuddy/aibuddy-acp

Install and resolve the AIBuddy executable through npm.

This package distributes the AIBuddy CLI using platform-specific optional npm
dependencies. It does not contain or depend on the AIBuddy ACP client.

## Installation

```bash
npm install @aibuddy/aibuddy-acp
```

The matching `@aibuddy/aibuddy-binary-*` package is installed automatically. Do not
install a platform package directly; `@aibuddy/aibuddy-acp` provides the supported
`aibuddy` command.

## Usage

Run the AIBuddy CLI installed by the package:

```bash
npx aibuddy acp
npx aibuddy serve
```

The launcher forwards arguments and standard input, output, and error streams to
the native executable. It preserves the executable's exit status and forwards
termination signals.

Resolve the executable path programmatically:

```typescript
import { resolveAIBuddyBinary } from "@aibuddy/aibuddy-acp";

const binaryPath = resolveAIBuddyBinary();
```

`resolveAIBuddyBinary()` first uses `AIBUDDY_BINARY` when it is set. Otherwise, it
selects the package matching `process.platform` and `process.arch`. In both
cases it verifies that the executable exists and returns an absolute path.

Use the override to run a locally built or custom AIBuddy executable:

```bash
AIBUDDY_BINARY=/path/to/aibuddy npx aibuddy acp
```

`AIBUDDY_BINARY` must point directly to a native AIBuddy executable, not a
`node_modules/.bin/aibuddy` command shim.

Supported platforms:

| Operating system | Architecture |
| ---------------- | ------------ |
| macOS            | ARM64        |
| macOS            | x64          |
| Linux            | ARM64        |
| Linux            | x64          |
| Windows          | x64          |

Package managers must install optional dependencies. If optional dependencies
are disabled, the resolver reports which platform package is missing.
