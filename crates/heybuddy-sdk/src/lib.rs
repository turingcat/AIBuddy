//! The heybuddy Development Kit (GDK).
//!
//! With default features this crate re-exports the shared GDK wire types from
//! `heybuddy-sdk-types` so you can build an Agent Client Protocol (ACP) client
//! that talks to `heybuddy acp` over stdio.
//!
//! With `--features uniffi` the crate additionally compiles as a
//! `cdylib`/`staticlib` and exposes an in-process API to Python and Kotlin via
//! [uniffi-rs](https://github.com/mozilla/uniffi-rs). The current uniffi surface
//! lets callers construct declarative providers from JSON and stream provider
//! completions.

pub use heybuddy_sdk_types::{custom_notifications, custom_requests};

#[cfg(feature = "uniffi")]
uniffi::setup_scaffolding!("heybuddy");

#[cfg(feature = "uniffi")]
pub mod bindings;

#[cfg(feature = "uniffi")]
pub mod observability;
