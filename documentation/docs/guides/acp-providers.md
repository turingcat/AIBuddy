---
sidebar_position: 9
title: ACP Providers
sidebar_label: ACP Providers
description: Use ACP agents like Claude Code and Codex as aibuddy providers with extension support
---

# ACP Providers

aibuddy supports [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) agents as providers. ACP is a standard protocol for communicating with coding agents, and there's a growing [registry](https://github.com/agentclientprotocol/registry) of agents that implement it.

ACP providers pass aibuddy [extensions](/docs/getting-started/using-extensions) through to the agent as MCP servers, so the agent can call your extensions directly.

:::tip Use Your Existing Subscriptions
ACP providers let you use aibuddy with your existing Claude Code or ChatGPT Plus/Pro subscriptions — no per-token API costs. They are the recommended replacement for the deprecated [CLI providers](/docs/guides/cli-providers).
:::

:::warning Limitations
- **No session fork or resume**: You can start new sessions, but `aibuddy session resume` and `aibuddy session fork` are not supported yet.
- **ACP session ID differs from aibuddy session ID**: Telemetry fields may not correlate across the two.
:::

## Available ACP Providers

### Amp ACP

Wraps [amp-acp](https://www.npmjs.com/package/amp-acp), an ACP adapter for [Amp](https://ampcode.com). Uses your existing Amp subscription.

**Requirements:**
- Node.js and npm
- Amp CLI installed (`curl -fsSL https://ampcode.com/install.sh | bash`)
- ACP adapter installed (`npm install -g amp-acp`)
- Authenticated with your Amp account (`amp` CLI working)

### Claude ACP

Wraps [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp), an ACP adapter for Anthropic's Claude Code. Uses the same Claude subscription as the deprecated `claude-code` CLI provider.

**Requirements:**
- Node.js and npm
- Active Claude Code subscription
- Authenticated with your Anthropic account (`claude` CLI working)

### Codex ACP

Use aibuddy with ChatGPT Plus/Pro or OpenAI API credits via the [codex-acp](https://github.com/agentclientprotocol/codex-acp) adapter.

**Requirements:**
- Node.js and npm
- Active ChatGPT Plus/Pro subscription or OpenAI API credits
- Authenticated with your OpenAI account (`codex` CLI working)

### Pi ACP

Wraps `pi-acp`, an ACP adapter for Pi. Uses your existing Pi installation.

**Requirements:**
- Pi CLI installed
- ACP adapter installed (`pi-acp` binary available)
- Authenticated with your Pi account (`pi` CLI working)

## Setup Instructions

### Amp ACP

1. **Install the Amp CLI**

   ```bash
   curl -fsSL https://ampcode.com/install.sh | bash
   ```

2. **Install the ACP adapter**

   ```bash
   npm install -g amp-acp
   ```

3. **Authenticate with Amp**

   Run `amp` and follow the authentication prompts.

4. **Configure aibuddy**

   Set the provider environment variable:
   ```bash
   export AIBUDDY_PROVIDER=amp-acp
   ```

   Or configure through the aibuddy CLI using `aibuddy configure`.

### Claude ACP

1. **Install the ACP adapter**

   ```bash
   npm install -g @agentclientprotocol/claude-agent-acp
   ```

2. **Authenticate with Claude**

   Ensure your Claude CLI is authenticated and working

3. **Configure aibuddy**

   Set the provider environment variable:
   ```bash
   export AIBUDDY_PROVIDER=claude-acp
   ```

   Or configure through the aibuddy CLI using `aibuddy configure`:

   ```bash
   ┌   aibuddy-configure
   │
   ◇  What would you like to configure?
   │  Configure Providers
   │
   ◇  Which model provider should we use?
   │  Claude Code
   │
   ◇  Model fetch complete
   │
   ◇  Enter a model from that provider:
   │  default
   ```

### Codex ACP

1. **Check the installed package**

   ```bash
   codex-acp --version
   ```

   The output should start with `@agentclientprotocol/codex-acp`. If it does, continue to authentication.

2. **Install or replace only if needed**

   If `--version` is rejected, remove `@zed-industries/codex-acp`:

   ```bash
   npm uninstall -g @zed-industries/codex-acp
   ```

   If `codex-acp` is missing or was removed, install `@agentclientprotocol/codex-acp`:

   ```bash
   npm install -g @agentclientprotocol/codex-acp
   ```

3. **Authenticate with OpenAI**

   Run `codex` and follow the authentication prompts. A compatible existing Codex login can be reused.

4. **Configure aibuddy**

   Set the provider and use `current` to let Codex choose its default model:
   ```bash
   export AIBUDDY_PROVIDER=codex-acp
   export AIBUDDY_MODEL=current
   ```

   Or configure through the aibuddy CLI using `aibuddy configure`:

   ```bash
   ┌   aibuddy-configure
   │
   ◇  What would you like to configure?
   │  Configure Providers
   │
   ◇  Which model provider should we use?
   │  Codex CLI
   │
   ◇  Model fetch complete
   │
   ◇  Enter a model from that provider:
   │  current
   ```

Replacing the npm package does not change `~/.codex` or require recreating your aibuddy configuration. aibuddy does not replace the package automatically.

### Pi ACP

1. **Install the Pi CLI and ACP adapter**

   Install the `pi` CLI and the `pi-acp` ACP adapter following the project's installation instructions.

2. **Authenticate with Pi**

   Run `pi` and follow the authentication prompts.

3. **Configure aibuddy**

   Set the provider environment variable:
   ```bash
   export AIBUDDY_PROVIDER=pi-acp
   ```

   Or configure through the aibuddy CLI using `aibuddy configure`.

## Usage Examples

### Basic Usage

```bash
aibuddy session
```

### Using with Extensions

Extensions configured via `--with-extension` or `--with-streamable-http-extension` are passed through to the ACP agent:

```bash
AIBUDDY_PROVIDER=claude-acp aibuddy run \
  --with-extension 'npx -y @modelcontextprotocol/server-everything' \
  -t 'Use the echo tool to say hello'
```

```bash
AIBUDDY_PROVIDER=codex-acp aibuddy run \
  --with-streamable-http-extension 'https://mcp.kiwi.com' \
  -t 'Search for flights from BKI to SYD tomorrow'
```

## Configuration Options

### Amp ACP Configuration

| Environment Variable | Description       | Default   |
|----------------------|-------------------|-----------|
| `AIBUDDY_PROVIDER`     | Set to `amp-acp`  | None      |
| `AIBUDDY_MODEL`        | Model to use      | `current` |
| `AIBUDDY_MODE`         | Permission mode   | `auto`    |

### Claude ACP Configuration

| Environment Variable | Description         | Default   |
|----------------------|---------------------|-----------|
| `AIBUDDY_PROVIDER`     | Set to `claude-acp` | None      |
| `AIBUDDY_MODEL`        | Model to use        | `default` |
| `AIBUDDY_MODE`         | Permission mode     | `auto`    |

**Known Models:**
- `default` (opus)
- `sonnet`
- `haiku`

**Permission Modes (`AIBUDDY_MODE`):**

| Mode            | Session Mode        | Behavior                                              |
|-----------------|---------------------|-------------------------------------------------------|
| `auto`          | `bypassPermissions` | Skips all permission checks                           |
| `smart-approve` | `acceptEdits`       | Auto-accepts file edits, prompts for risky operations |
| `approve`       | `default`           | Prompts for all permission-required operations        |
| `chat`          | `plan`              | Planning only, no tool execution                      |

See [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp) for session mode details.

### Codex ACP Configuration

| Environment Variable | Description        | Default   |
|----------------------|--------------------|-----------|
| `AIBUDDY_PROVIDER`     | Set to `codex-acp` | None      |
| `AIBUDDY_MODEL`        | Model to use       | `current` |
| `AIBUDDY_MODE`         | Permission mode    | `auto`    |

Codex ACP reports its available models dynamically. Keep `current` to use Codex's default, or select a discovered model explicitly.

**Permission Modes (`AIBUDDY_MODE`):**

| aibuddy mode      | Codex ACP mode      |
|-----------------|---------------------|
| `auto`          | `agent-full-access` |
| `smart-approve` | `agent`             |
| `approve`       | `read-only`         |
| `chat`          | `read-only`         |

See [codex-acp](https://github.com/agentclientprotocol/codex-acp) for session mode details.

### Pi ACP Configuration

| Environment Variable | Description      | Default   |
|----------------------|------------------|-----------|
| `AIBUDDY_PROVIDER`     | Set to `pi-acp`  | None      |
| `AIBUDDY_MODEL`        | Model to use     | `current` |
| `AIBUDDY_MODE`         | Permission mode  | `auto`    |

## Error Handling

ACP providers depend on external binaries, so ensure:

- The ACP agent binary is installed and in your PATH (`amp-acp`, `claude-agent-acp`, `codex-acp`, `pi-acp`, or `copilot`)
- The underlying CLI tool is authenticated and working
- Subscription limits are not exceeded
- Node.js and npm are installed (for npm-distributed adapters)

If aibuddy can't find the binary, session startup will fail with an error. Run `which <binary>` to verify installation.
