# aibuddy-sdk

Python bindings for the aibuddy Development Kit (GDK).

This package is generated from the Rust `aibuddy-sdk` crate using UniFFI.

## Build a local wheel

From the repository root:

```bash
just --justfile crates/aibuddy-sdk/justfile python-wheel
```

The wheel is written to `crates/aibuddy-sdk/python/dist/`.
