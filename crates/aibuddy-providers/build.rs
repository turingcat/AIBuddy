use std::env;
use std::path::PathBuf;

// aibuddy-providers has its own library version that differs from the workspace
// product version (e.g. 0.1.0-alpha.6 vs 1.0.6). User-Agent should report the
// product version, so read it from the workspace root manifest when available
// and fall back to the crate version for standalone (crates.io) builds.
fn main() {
    let product_version = read_workspace_version()
        .unwrap_or_else(|| env::var("CARGO_PKG_VERSION").unwrap_or_default());

    println!("cargo:rustc-env=AIBUDDY_PRODUCT_VERSION={product_version}");
    println!("cargo:rerun-if-changed=../../Cargo.toml");
}

fn read_workspace_version() -> Option<String> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").ok()?);
    let workspace_manifest = manifest_dir.join("../../Cargo.toml");

    // 仅在 [workspace.package] 段内取 version，防止未来根 manifest
    // 在该段之前新增其他 version = " 行时静默错读
    // @author: logic
    // @date: 2026-09-03
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
