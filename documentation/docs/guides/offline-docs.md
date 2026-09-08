---
title: Offline / Air-gapped Docs
sidebar_position: 95
sidebar_label: Offline Docs
---

# Offline / Air-gapped Docs

The `heybuddy-doc-guide` skill reads official heybuddy documentation before answering
heybuddy-specific questions. By default it reads from `https://goose-docs.ai`. In
an offline or air-gapped environment, point heybuddy at a **local copy** instead by
setting `HEYBUDDY_DOCS_ROOT`.

- If `HEYBUDDY_DOCS_ROOT` is set (in `config.yaml` or the environment), heybuddy uses
  it as the docs root — either a local filesystem path or an HTTP(S) URL.
- If it is not set, heybuddy falls back to `https://goose-docs.ai`.

When the root is a local path, heybuddy reads the docs with its file tools; no
network access is required.

## Docs layout

A docs root contains a docs map and a `docs/` tree:

```
<docs-root>/
├── heybuddy-docs-map.md
└── docs/
    ├── getting-started/...
    └── guides/...
```

`heybuddy-docs-map.md` is the index the skill searches first; every page it reads
is referenced by a path listed there.

## Building a local docs root

Build the docs from a heybuddy checkout using the same version as your heybuddy
binary, so the docs match the runtime. The standard documentation build already
produces everything heybuddy needs — a `heybuddy-docs-map.md` index and a `docs/` tree
of markdown files — so no custom tooling is required:

```bash
git checkout v1.41.0   # match your heybuddy binary version
cd documentation
npm run build
```

This writes the docs root to `documentation/build/`, containing:

```
build/
├── heybuddy-docs-map.md
└── docs/
    ├── getting-started/...
    └── guides/...
```

`npm run build` requires registry access, so run it in an online environment.
Then copy the resulting `build/` directory to your air-gapped target location
(for example `/opt/heybuddy-docs`) and point `HEYBUDDY_DOCS_ROOT` at it.

## Configuring heybuddy

Set `HEYBUDDY_DOCS_ROOT` in `config.yaml`:

```yaml
HEYBUDDY_DOCS_ROOT: "/opt/heybuddy-docs"
```

Or via the environment:

```bash
export HEYBUDDY_DOCS_ROOT=/opt/heybuddy-docs
```

For a managed distribution, bake the docs tree into your image and set
`HEYBUDDY_DOCS_ROOT` in the shipped `config.yaml` or launcher environment.

## Notes

- Documentation links in heybuddy's answers always render as canonical
  `https://goose-docs.ai/...` URLs, even when read locally.
- A custom HTTP(S) mirror also works: set `HEYBUDDY_DOCS_ROOT` to its root URL.
- For MCP extension runtime issues offline, see
  [Airgapped/Offline Environment Issues](/docs/troubleshooting/known-issues#airgappedoffline-environment-issues).
