---
title: Set up aibuddy in Zed
sidebar_position: 3
description: See how Zed installs and configures aibuddy as an ACP agent.
---

# Set up aibuddy in Zed

Zed can run aibuddy as an ACP agent. Install aibuddy from the ACP Registry for the
simplest setup, or configure it manually to use your own aibuddy binary and
environment overrides.

## Install aibuddy from the ACP Registry

Zed has built-in ACP Registry support, so it can download and run aibuddy for you
without manual configuration.

1. Open Zed
2. Open Agent Settings
3. Click `Add Agent`, then choose `Install from Registry`
4. Select `aibuddy`

A registry-installed aibuddy runs the same `aibuddy acp` server and reads your
existing aibuddy configuration, so your providers, models, and extensions carry
over. Zed keeps the installed version up to date for you.

## Configure aibuddy manually

Use a custom agent if you want to run your own aibuddy binary, such as a local
development build, or pass environment overrides.

### Prerequisites

Ensure you have both Zed and the aibuddy CLI installed:

- **Zed**: Download from [zed.dev](https://zed.dev/)
- **aibuddy CLI**: Follow the [installation guide](/docs/getting-started/installation)

Verify aibuddy is installed:

```bash
aibuddy --version
```

### Add aibuddy to your Zed settings

1. Open Zed
2. Open Agent Settings, click `Add Agent`, then choose `Add Custom Agent`. Zed
   scaffolds an `agent_servers` entry and opens your settings file
3. Edit the entry so it runs aibuddy:

```json
{
  "agent_servers": {
    "aibuddy": {
      "type": "custom",
      "command": "aibuddy",
      "args": ["acp"]
    }
  }
}
```

You can now interact with aibuddy directly in Zed. ACP sessions use the extensions
enabled in your aibuddy configuration, so their tools are also available in Zed.

## Override the provider and model

By default, aibuddy uses the provider and model defined in your
[configuration file](/docs/guides/config-files). Override them for a specific
agent configuration with the `AIBUDDY_PROVIDER` and `AIBUDDY_MODEL` environment
variables.

This example configures two aibuddy agents with different model settings:

```json
{
  "agent_servers": {
    "aibuddy": {
      "type": "custom",
      "command": "aibuddy",
      "args": ["acp"]
    },
    "aibuddy (GPT-4o)": {
      "type": "custom",
      "command": "aibuddy",
      "args": ["acp"],
      "env": {
        "AIBUDDY_PROVIDER": "openai",
        "AIBUDDY_MODEL": "gpt-4o"
      }
    }
  }
}
```

## Use Zed MCP servers with aibuddy

MCP servers in Zed's `context_servers` configuration are automatically
available to aibuddy. This lets native Zed features and the aibuddy agent use the
same MCP servers.

```json
{
  "context_servers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/dir"
      ]
    }
  },
  "agent_servers": {
    "aibuddy": {
      "type": "custom",
      "command": "aibuddy",
      "args": ["acp"]
    }
  }
}
```

All MCP servers in `context_servers` are available to aibuddy when they use stdio
(command-based) or HTTP transports. aibuddy does not support servers using the
deprecated SSE transport.

If a server in `context_servers` has the same name as a aibuddy extension, aibuddy
uses its own [configuration](/docs/guides/config-files).
