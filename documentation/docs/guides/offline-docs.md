---
title: Offline / Air-gapped Docs
sidebar_position: 95
sidebar_label: Offline Docs
---

# Offline / Air-gapped Docs

The `aibuddy-doc-guide` skill reads official aibuddy documentation before answering
aibuddy-specific questions. By default it reads from `https://goose-docs.ai`. In
an offline or air-gapped environment, point aibuddy at a **local copy** instead by
setting `AIBUDDY_DOCS_ROOT`.

- If `AIBUDDY_DOCS_ROOT` is set (in `config.yaml` or the environment), aibuddy uses
  it as the docs root — either a local filesystem path or an HTTP(S) URL.
- If it is not set, aibuddy falls back to `https://goose-docs.ai`.

When the root is a local path, aibuddy reads the docs with its file tools; no
network access is required.

## Docs layout

A docs root contains a docs map and a `docs/` tree:

```
<docs-root>/
├── aibuddy-docs-map.md
└── docs/
    ├── getting-started/...
    └── guides/...
```

`aibuddy-docs-map.md` is the index the skill searches first; every page it reads
is referenced by a path listed there.

## Building a local docs root

Build the docs from a aibuddy checkout using the same version as your aibuddy
binary, so the docs match the runtime. The standard documentation build already
produces everything aibuddy needs — a `aibuddy-docs-map.md` index and a `docs/` tree
of markdown files — so no custom tooling is required:

```bash
git checkout v1.41.0   # match your aibuddy binary version
cd documentation
npm run build
```

This writes the docs root to `documentation/build/`, containing:

```
build/
├── aibuddy-docs-map.md
└── docs/
    ├── getting-started/...
    └── guides/...
```

`npm run build` requires registry access, so run it in an online environment.
Then copy the resulting `build/` directory to your air-gapped target location
(for example `/opt/aibuddy-docs`) and point `AIBUDDY_DOCS_ROOT` at it.

## Configuring aibuddy

Set `AIBUDDY_DOCS_ROOT` in `config.yaml`:

```yaml
AIBUDDY_DOCS_ROOT: "/opt/aibuddy-docs"
```

Or via the environment:

```bash
export AIBUDDY_DOCS_ROOT=/opt/aibuddy-docs
```

For a managed distribution, bake the docs tree into your image and set
`AIBUDDY_DOCS_ROOT` in the shipped `config.yaml` or launcher environment.

## Notes

- Documentation links in aibuddy's answers always render as canonical
  `https://goose-docs.ai/...` URLs, even when read locally.
- A custom HTTP(S) mirror also works: set `AIBUDDY_DOCS_ROOT` to its root URL.
- For MCP extension runtime issues offline, see
  [Airgapped/Offline Environment Issues](/docs/troubleshooting/known-issues#airgappedoffline-environment-issues).
