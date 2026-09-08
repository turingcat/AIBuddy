---
sidebar_position: 10
title: Configuration Files
sidebar_label: Configuration Files
---

# Configuration Overview

aibuddy uses YAML [configuration files](#configuration-files) to manage settings and extensions. The primary config file is located at:

* macOS/Linux: `~/.config/aibuddy/config.yaml`
* Windows: `%APPDATA%\Block\aibuddy\config\config.yaml`

The configuration files allow you to set default behaviors, configure language models, set tool permissions, and manage extensions. While many settings can also be set using [environment variables](/docs/guides/environment-variables), the config files provide a persistent way to maintain your preferences.

## Configuration Files

- **config.yaml** - Provider, model, extensions, and general settings
- **permission.yaml** - Tool permission levels configured via `aibuddy configure`
- **secrets.yaml** - API keys and secrets (when aibuddy is using [file-based secret storage](#security-considerations))
- **permissions/tool_permissions.json** - Runtime permission decisions (auto-managed)
- **prompts/** - Customized [prompt templates](/docs/guides/context-engineering/prompt-templates)

In addition to editing configuration files directly, many settings can be managed from aibuddy Desktop and aibuddy CLI:
- **aibuddy Desktop**: From the `Settings` page and the bottom toolbar
- **aibuddy CLI**: Run the `aibuddy configure` command

## Provider Configuration

Provider settings are stored in the `active_provider` and `providers` keys:

```yaml
active_provider: anthropic
providers:
  anthropic:
    enabled: true
    model: claude-sonnet-4-5-20250929
    configured: true
```

`AIBUDDY_PROVIDER` and `AIBUDDY_MODEL` are still supported as environment variables and override the config file for that process. Older config files that use flat `AIBUDDY_PROVIDER` and `AIBUDDY_MODEL` keys are read for compatibility and migrated when aibuddy updates the provider settings.

## Global Settings

The following settings can be configured at the root level of your config.yaml file:

| Setting | Purpose | Values | Default | Required |
|---------|---------|---------|---------|-----------|
| `AIBUDDY_TEMPERATURE` | Model response randomness | Float between 0.0 and 1.0 | Model-specific | No |
| `AIBUDDY_MAX_TOKENS` | Maximum number of tokens for each model response (truncates longer responses) | Positive integer | Model-specific | No |
| `AIBUDDY_CACHE_TTL` | Anthropic prompt-cache TTL; `1h` keeps the cached prefix alive across idle gaps at a higher cache-write rate. Headless runs always use `5m` | "5m", "1h" | "5m" | No |
| `AIBUDDY_MODE` | [Tool execution behavior](/docs/guides/managing-tools/aibuddy-permissions) | "auto", "approve", "chat", "smart_approve" | "auto" | No |
| `AIBUDDY_MAX_TURNS` | [Maximum number of turns](/docs/guides/sessions/smart-context-management#maximum-turns) allowed without user input | Integer (e.g., 10, 50, 100) | 1000 | No |
| `AIBUDDY_PLANNER_PROVIDER` | Provider for [planning mode](/docs/guides/context-engineering/creating-plans) | Same as `AIBUDDY_PROVIDER` options | Falls back to `AIBUDDY_PROVIDER` | No |
| `AIBUDDY_PLANNER_MODEL` | Model for planning mode | Model name | Falls back to `AIBUDDY_MODEL` | No |
| `AIBUDDY_TOOLSHIM` | Enable tool interpretation | true/false | false | No |
| `AIBUDDY_TOOLSHIM_OLLAMA_MODEL` | Model for tool interpretation | Model name (e.g., "llama3.2") | System default | No |
| `AIBUDDY_INPUT_LIMIT` | Override input token limit for Ollama (maps to `num_ctx`) | Positive integer | Model default | No |
| `AIBUDDY_CLI_MIN_PRIORITY` | Tool output verbosity | Float between 0.0 and 1.0 | 0.0 | No |
| `AIBUDDY_CLI_THEME` | [Theme](/docs/guides/aibuddy-cli-commands#themes) for CLI response markdown | "light", "dark", "ansi" | "ansi" | No |
| `AIBUDDY_CLI_LIGHT_THEME` | Custom syntax highlighting theme for light mode | [bat theme name](https://github.com/sharkdp/bat#adding-new-themes) | "GitHub" | No |
| `AIBUDDY_CLI_DARK_THEME` | Custom syntax highlighting theme for dark mode | [bat theme name](https://github.com/sharkdp/bat#adding-new-themes) | "zenburn" | No |
| `AIBUDDY_CLI_SHOW_COST` | Show estimated cost for token use in the CLI | true/false | false | No |
| `AIBUDDY_ALLOWLIST` | URL for allowed extensions | Valid URL | None | No |
| `AIBUDDY_DOCS_ROOT` | Documentation root used by `aibuddy-doc-guide` (e.g. for offline/air-gapped docs) | Local path or HTTP(S) URL containing `aibuddy-docs-map.md` and `docs/` | `https://goose-docs.ai` | No |
| `AIBUDDY_RECIPE_GITHUB_REPO` | GitHub repository for recipes | Format: "org/repo" | None | No |
| `AIBUDDY_AUTO_COMPACT_THRESHOLD` | Set the percentage threshold at which aibuddy [automatically compacts your session](/docs/guides/sessions/smart-context-management#automatic-compaction). | Float between 0.0 and 1.0 (disabled at 0.0)| 0.8 | No |
| `SECURITY_PROMPT_ENABLED` | Enable [prompt injection detection](/docs/guides/security/prompt-injection-detection) to identify potentially harmful commands | true/false | false | No |
| `SECURITY_PROMPT_THRESHOLD` | Sensitivity threshold for prompt injection detection (higher = stricter) | Float between 0.01 and 1.0 | 0.8 | No |
| `SECURITY_PROMPT_CLASSIFIER_ENABLED` | Enable ML-based prompt injection detection for advanced threat identification | true/false | false | No |
| `SECURITY_PROMPT_CLASSIFIER_ENDPOINT` | Classification endpoint URL for ML-based prompt injection detection | URL (e.g., "https://api.example.com/classify") | None | No |
| `SECURITY_PROMPT_CLASSIFIER_TOKEN` | Authentication token for `SECURITY_PROMPT_CLASSIFIER_ENDPOINT` | String | None | No |

Additional [environment variables](/docs/guides/environment-variables) may also be supported in config.yaml.

## Example Configuration

Here's a basic example of a config.yaml file:

```yaml
# Model Configuration
active_provider: anthropic
providers:
  anthropic:
    enabled: true
    model: claude-sonnet-4-5-20250929
    configured: true
AIBUDDY_TEMPERATURE: 0.7

# Planning Configuration
AIBUDDY_PLANNER_PROVIDER: "openai"
AIBUDDY_PLANNER_MODEL: "gpt-4"

# Tool Configuration
AIBUDDY_MODE: "smart_approve"
AIBUDDY_TOOLSHIM: true
AIBUDDY_CLI_MIN_PRIORITY: 0.2

# Recipe Configuration
AIBUDDY_RECIPE_GITHUB_REPO: "aaif-goose/goose-recipes"

# Documentation Configuration
AIBUDDY_DOCS_ROOT: "/path/to/aibuddy-docs"

# Search Path Configuration
AIBUDDY_SEARCH_PATHS:
  - "/usr/local/bin"
  - "~/custom/tools"
  - "/opt/homebrew/bin"

# Security Configuration
SECURITY_PROMPT_ENABLED: true

# Extensions Configuration
extensions:
  developer:
    bundled: true
    enabled: true
    name: developer
    timeout: 300
    type: builtin
  
  memory:
    bundled: true
    enabled: true
    name: memory
    timeout: 300
    type: builtin
```

## Extensions Configuration

Extensions are configured under the `extensions` key. Each extension can have the following settings:

```yaml
extensions:
  extension_name:
    bundled: true/false       # Whether it's included with aibuddy
    display_name: "Name"      # Human-readable name (optional)
    enabled: true/false       # Whether the extension is active
    name: "extension_name"    # Internal name
    timeout: 300              # Operation timeout in seconds
    type: "builtin"           # Extension type
    available_tools: []       # Filter to specific tools (empty = all)
```

Supported extension types are `builtin`, `platform`, `stdio`, and `streamable_http`. SSE is not supported; migrate old SSE configurations to `streamable_http`.

Common extension shapes:

```yaml
extensions:
  developer:
    type: builtin
    name: developer
    enabled: true
    bundled: true
    timeout: 300

  computercontroller:
    type: platform
    name: computercontroller
    display_name: Computer Controller
    enabled: true
    bundled: true

  filesystem:
    type: stdio
    name: filesystem
    enabled: true
    cmd: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    env_keys: []
    envs: {}
    timeout: 300

  remote-tools:
    type: streamable_http
    name: remote-tools
    enabled: true
    uri: "https://example.com/mcp"
    headers: {}
    env_keys: []
    envs: {}
    timeout: 300
```

### Tool Filtering

Use the `available_tools` field to limit which tools are loaded from an extension. List the tool names you want — only those will be available to aibuddy. Leave it empty (the default) to load all tools. This can help reduce token overhead in sessions where you only need a subset of an extension's capabilities.

## Search Path Configuration

Extensions may need to execute external commands or tools. AIBuddy builds the command search path from any `AIBUDDY_SEARCH_PATHS` entries, built-in fallback paths, and then your system PATH. You can add additional search directories in your config file:

```yaml
AIBUDDY_SEARCH_PATHS:
  - "/usr/local/bin"
  - "~/custom/tools"
  - "/opt/homebrew/bin"
```

These paths are checked before the built-in fallback paths and system PATH when running extension commands, ensuring your custom tools are found without modifying your global PATH.

## Observability Configuration

Configure aibuddy to export telemetry to [OpenTelemetry](https://opentelemetry.io/docs/) compatible platforms. Environment variables override these settings and support additional options like per-signal configuration. See the [environment variables guide](/docs/guides/environment-variables#observability-configuration) for details.

| Setting | Purpose | Values | Default |
|---------|---------|--------|---------|
| `otel_exporter_otlp_endpoint` | OTLP endpoint URL | URL (e.g., `http://localhost:4318`) | None |
| `otel_exporter_otlp_timeout` | Export timeout in milliseconds | Integer (ms) | 10000 |

```yaml
otel_exporter_otlp_endpoint: "http://localhost:4318"
otel_exporter_otlp_timeout: 20000
```

## Recipe Command Configuration
You can optionally set up [custom slash commands](/docs/guides/context-engineering/slash-commands) to run recipes that you create. List the command (without the leading `/`) along with the path to the recipe:

```yaml
slash_commands:
  - command: "run-tests"
    recipe_path: "/path/to/recipe.yaml"
  - command: "daily-standup"
    recipe_path: "/Users/me/.local/share/aibuddy/recipes/standup.yaml"
```

## Configuration Priority

Settings are applied in the following order of precedence:

1. Environment variables (highest priority)
2. Config file settings
3. Default values (lowest priority)

## Security Considerations

:::warning Provider API keys do not go in `config.yaml`
aibuddy does not read provider API keys from `config.yaml`. A key placed there is ignored, which typically surfaces as an authentication failure such as `No api key passed in`. Store the key in the system keyring (via `aibuddy configure`), or—when using file-based secret storage—in `secrets.yaml`. It can also be supplied through the provider's environment variable (for example `OPENAI_API_KEY`), which takes precedence over stored secrets.
:::

- Avoid storing sensitive information (API keys, tokens) in the config file
- Use the system keyring (keychain on macOS) for storing secrets. When available, this is the recommended option.
- If aibuddy is using file-based secret storage, secrets are stored in a separate `secrets.yaml` file (in plain text). This can happen when:

  - Your environment does not provide a desktop keyring service (for example: headless servers, CI/CD, containers)
  - You disable the keyring explicitly (via [AIBUDDY_DISABLE_KEYRING](/docs/guides/environment-variables#security-and-privacy))
  - aibuddy cannot access the keyring and falls back to file-based secret storage

  For troubleshooting keyring failures and automatic fallback behavior, see [Known Issues](/docs/troubleshooting/known-issues#keyring-cannot-be-accessed-automatic-fallback).

## Updating Configuration

Direct edits to config files usually require restarting aibuddy to take effect for existing sessions. AIBuddy2 provider credential/config saves made through Settings use ACP/core to update storage and refresh provider inventory without restarting the app, but currently active chat sessions continue using the provider instance they started with. You can verify your current configuration using:

```bash
aibuddy info -v
```

This will show all active settings and their current values.

## See Also

- **[Multi-Model Configuration](/docs/guides/multi-model/)** - For multiple model-selection strategies
- **[Environment Variables](./environment-variables.md)** - For environment variable configuration
- **[Using Extensions](/docs/getting-started/using-extensions.md)** - For more details on extension configuration
