use std::env;
use std::path::PathBuf;

// aibuddy-providers has its own library version, so User-Agent must read the
// workspace product version and fall back to the crate version for standalone builds.
fn main() {
    let product_version = read_workspace_version()
        .unwrap_or_else(|| env::var("CARGO_PKG_VERSION").unwrap_or_default());

    println!("cargo:rustc-env=AIBUDDY_PRODUCT_VERSION={product_version}");
    println!("cargo:rerun-if-changed=../../Cargo.toml");
}

fn read_workspace_version() -> Option<String> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").ok()?);
    let workspace_manifest = manifest_dir.join("../../Cargo.toml");

    // Only read the workspace package version, not another manifest version field.
    let mut in_workspace_package = false;
    for line in std::fs::read_to_string(workspace_manifest).ok()?.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_workspace_package = trimmed == "[workspace.package]";
            continue;
        }
        if in_workspace_package {
            if let Some(version) = trimmed.strip_prefix("version = \"") {
                return version.strip_suffix('"').map(str::to_string);
            }
        }
    }
    None
}
