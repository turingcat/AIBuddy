---
title: heybuddy Logging System
sidebar_label: Logging System
sidebar_position: 65
---


heybuddy uses a unified storage system for conversations and interactions. All conversations and interactions (both CLI and Desktop) are stored **locally** in the following locations:

| **Type**            | **Unix-like (macOS, Linux)**              | **Windows**                              |
|---------------------|----------------------------------------|---------------------------------------------|
| **Command History** | `~/.config/heybuddy/history.txt`          | `%APPDATA%\Block\heybuddy\data\history.txt`    |
| **Session Records** | `~/.local/share/heybuddy/sessions/sessions.db` | `%APPDATA%\Block\heybuddy\data\sessions\sessions.db` |
| **System Logs**     | `~/.local/state/heybuddy/logs/`           | `%APPDATA%\Block\heybuddy\data\logs\`          |

:::info Privacy
heybuddy is a local application and all heybuddy log files are stored locally. These logs are never sent to external servers or third parties, ensuring that all heybuddy data remains private and under your control.
Note that the LLMs and tools heybuddy uses on your behalf may have their own logs and privacy considerations.
:::

## Command History

heybuddy stores command history persistently across chat sessions, allowing heybuddy to recall previous commands.

Command history logs are stored in:

* Unix-like: ` ~/.config/heybuddy/history.txt`
* Windows: `%APPDATA%\Block\heybuddy\data\history.txt`

## Session Records

heybuddy maintains session records that track the conversation history and interactions for each session. 
Sessions are stored in an SQLite database at:
- **Unix-like**: `~/.local/share/heybuddy/sessions/sessions.db`
- **Windows**: `%APPDATA%\Block\heybuddy\data\sessions\sessions.db`

:::info Session Storage Migration
Prior to version 1.10.0, heybuddy stored session records in individual `.jsonl` files under  `~/.local/share/heybuddy/sessions/`.
When you upgrade to v1.10.0 or later, your existing sessions are automatically imported into the database. Legacy `.jsonl` files remain on disk but are no longer managed by heybuddy.
:::

This database contains all saved session data including:
- Session metadata (ID, name, working directory, timestamps)
- Conversation messages (user commands, assistant responses, role information)
- Tool calls and results (IDs, arguments, responses, success/failure status)
- Token usage statistics
- Extension data and configuration

Session IDs are named using `YYYYMMDD_<COUNT>` format, for example: `20250310_2`. heybuddy CLI outputs the session ID at the start of each session. To get session IDs, use [`heybuddy session list` command](/docs/guides/heybuddy-cli-commands#session-list-options) to see all available sessions.

Also see [Session Management](/docs/guides/sessions/session-management) for details about searching sessions.

## System Logs

heybuddy stores logs for its various components. CLI and server logs are automatically organized into date-based directories and cleaned up after two weeks to prevent excessive disk usage.

When [prompt injection detection](/docs/guides/security/prompt-injection-detection) is enabled, CLI and server logs also include:
* Security findings with unique IDs (format: `SEC-{uuid}`)
* User decisions (allow/deny) associated with finding IDs

:::info
Extensions may optionally log to subdirectories under `~/.local/state/heybuddy/logs/`. The specific subdirectory structure is determined by each extension's implementation.
:::

### Desktop Application Log

The desktop application maintains its own logs:
* macOS: `~/Library/Application Support/HeyBuddy/logs/main.log`
* Windows: `%APPDATA%\Block\heybuddy\logs\main.log`

The desktop application follows platform conventions for its own operational logs and state data, but uses the standard heybuddy [session records](#session-records) for actual conversations and interactions. This means your conversation history is consistent regardless of which interface you use to interact with heybuddy.

### CLI Logs 

CLI logs are stored in:
* Unix-like: `~/.local/state/heybuddy/logs/cli/`
* Windows: `%APPDATA%\Block\heybuddy\data\logs\cli\`

Logs are organized into date-based subdirectories (e.g., `cli/2025-11-13/`) and subdirectories older than two weeks are automatically deleted.

CLI session logs contain:
* Tool invocations and responses
* Command execution details
* Session identifiers
* Timestamps

CLI logs also capture extension-related activity, including:
* Tool initialization
* Tool capabilities and schemas
* Extension-specific operations
* Command execution results
* Error messages and debugging information
* Extension configuration states
* Extension-specific protocol information

### Server Logs

Server logs are stored in:
* Unix-like: `~/.local/state/heybuddy/logs/server/`
* Windows: `%APPDATA%\Block\heybuddy\data\logs\server\`

Logs are organized into date-based subdirectories (e.g., `server/2025-11-13/`) and subdirectories older than two weeks are automatically deleted.

The Server logs contain information about the heybuddy daemon (`heybuddyd`), which is a local server process that runs on your computer. This server component manages communication between the CLI, extensions, and LLMs. 

Server logs include:
* Server initialization details
* JSON-RPC communication logs
* Server capabilities
* Protocol version information
* Client-server interactions
* Extension loading and initialization
* Tool definitions and schemas
* Extension instructions and capabilities
* Debug-level transport information
* System capabilities and configurations
* Operating system information
* Working directory information
* Transport layer communication details
* Message parsing and handling information
* Request/response cycles
* Error states and handling
* Extension initialization sequences

### LLM Request Logs

LLM request logs capture the raw request and response data sent to language model providers:
* Unix-like: `~/.local/state/heybuddy/logs/llm_request.*.jsonl`
* Windows: `%APPDATA%\Block\heybuddy\data\logs\llm_request.*.jsonl`

These logs use a numbered rotation system that keeps the 10 most recent completed requests (`llm_request.0.jsonl` through `llm_request.9.jsonl`). Each log contains the model configuration, input payload, response data, and token usage information.
