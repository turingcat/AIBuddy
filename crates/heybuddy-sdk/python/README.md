# heybuddy-sdk

Python bindings for the heybuddy Development Kit (GDK).

This package is generated from the Rust `heybuddy-sdk` crate using UniFFI.

## Build a local wheel

From the repository root:

```bash
just --justfile crates/heybuddy-sdk/justfile python-wheel
```

The wheel is written to `crates/heybuddy-sdk/python/dist/`.
