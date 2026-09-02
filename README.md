<div align="center">

# AIBuddy

_your native AI agent - desktop app, CLI, and API - for code, workflows, and everything in between_

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"
    ><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg"
  /></a>
</p>

</div>

AIBuddy is a general-purpose AI agent that runs on your machine. Use it for research, writing, automation, data analysis, software development, and other day-to-day work.

It includes a native desktop app for macOS, Linux, and Windows, a CLI for terminal workflows, and an API for embedding agent capabilities. The core is built in Rust for performance and portability.

AIBuddy works with providers including Anthropic, OpenAI, Google, Ollama, OpenRouter, Azure, and Bedrock. It supports API keys and existing Claude, ChatGPT, or Gemini subscriptions through [ACP](https://goose-docs.ai/docs/guides/acp-providers), plus extensions built on the open [Model Context Protocol](https://modelcontextprotocol.io/) standard.

Product accounts and authentication are provided through [TFlow](https://tflow.online). Credentials and service configuration are managed by the application and are not documented in this repository.

## Project lineage

The code lineage is **Goose -> HeyBuddy shared -> AIBuddy**. [Goose](https://github.com/aaif-goose/goose) is the upstream open source agent framework from the [Agentic AI Foundation (AAIF)](https://aaif.io/) at the Linux Foundation. HeyBuddy is the shared fork layer from which this repository inherited compatibility code. AIBuddy is the active product and the only product identity exposed by this app.

The CLI binary, crate names, environment variables, configuration files, and protocol compatibility surfaces retain the original `goose` naming where changing them would break compatibility.

## Synchronization

Routine AIBuddy updates fetch and merge `upstream/shared`, never `upstream/main`. The shared branch carries official Goose updates and reusable product-neutral engine, desktop, localization, and tooling changes. AIBuddy owns its product identity, authentication and service configuration, provider credentials and entitlements, data migration, and user-visible behavior. Run `cd ui/desktop && pnpm run check:product-boundary` after each shared merge.

## Get started

Open [TFlow](https://tflow.online) to access AIBuddy.

The compatible Goose CLI can still be installed with the upstream installer:

```bash
curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash
```

## Quick links

- [Quickstart](https://goose-docs.ai/docs/quickstart)
- [Installation](https://goose-docs.ai/docs/getting-started/installation)
- [Tutorials](https://goose-docs.ai/docs/category/tutorials)
- [Documentation](https://goose-docs.ai/docs/category/getting-started)
- [Governance](https://github.com/aaif-goose/goose/blob/main/GOVERNANCE.md)
- [Custom distributions](https://github.com/aaif-goose/goose/blob/main/CUSTOM_DISTROS.md)
- [Diagnostics and reporting](https://goose-docs.ai/docs/troubleshooting/diagnostics-and-reporting)
- [Known issues](https://goose-docs.ai/docs/troubleshooting/known-issues)
