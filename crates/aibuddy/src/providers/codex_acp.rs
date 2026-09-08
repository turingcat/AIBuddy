use anyhow::Result;
use futures::future::BoxFuture;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::acp::{
    extension_configs_to_mcp_servers, AcpProvider, AcpProviderConfig, ACP_CURRENT_MODEL,
};
use crate::config::search_path::SearchPaths;
use crate::config::{AIBuddyMode, Config, ConfigError};
use crate::providers::base::{
    current_working_dir, ProviderDef, ProviderDescriptor, ProviderMetadata,
};
use crate::providers::catalog::ProviderSetupMetadata;

pub(crate) const CODEX_ACP_PROVIDER_NAME: &str = "codex-acp";
const CODEX_ACP_DOC_URL: &str = "https://github.com/agentclientprotocol/codex-acp";

pub struct CodexAcpProvider;

fn resolve_aibuddy_mode(
    configured_mode: Result<AIBuddyMode, ConfigError>,
) -> Result<AIBuddyMode, ConfigError> {
    match configured_mode {
        Ok(mode) => Ok(mode),
        Err(ConfigError::NotFound(_)) => Ok(AIBuddyMode::Auto),
        Err(error) => Err(error),
    }
}

impl aibuddy_providers::base::ProviderDescriptor for CodexAcpProvider {
    fn metadata() -> ProviderMetadata {
        ProviderMetadata::new(
            CODEX_ACP_PROVIDER_NAME,
            "Codex ACP",
            "Use aibuddy with ChatGPT Plus/Pro or OpenAI API credits via the codex-acp adapter.",
            ACP_CURRENT_MODEL,
            vec![],
            CODEX_ACP_DOC_URL,
            vec![],
        )
        .with_setup_steps(vec![
            "Verify `codex-acp --version` shows `@agentclientprotocol/codex-acp`",
            "If `--version` is rejected, remove `@zed-industries/codex-acp`: `npm uninstall -g @zed-industries/codex-acp`",
            "If `codex-acp` is missing or was removed, install `@agentclientprotocol/codex-acp`: `npm install -g @agentclientprotocol/codex-acp`",
            "Authenticate with OpenAI: run `codex` and follow the prompts",
        ])
        .with_setup(
            ProviderSetupMetadata::cli_agent(CODEX_ACP_PROVIDER_NAME, &["codex-acp", "codex_cli", "codex"])
                .with_acp()
                .with_docs_url("https://github.com/openai/codex")
                .with_capabilities(true, true, true),
        )
    }
}

impl ProviderDef for CodexAcpProvider {
    type Provider = AcpProvider;

    fn from_env(
        extensions: Vec<crate::config::ExtensionConfig>,
        tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<AcpProvider>> {
        Self::from_env_with_working_dir(extensions, current_working_dir(), tls_config)
    }

    fn from_env_with_working_dir(
        extensions: Vec<crate::config::ExtensionConfig>,
        working_dir: PathBuf,
        _tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<AcpProvider>> {
        Box::pin(async move {
            let config = Config::global();
            // with_npm() includes npm global bin dir (desktop app PATH may not)
            let resolved_command = SearchPaths::builder()
                .with_npm()
                .resolve(CODEX_ACP_PROVIDER_NAME)?;
            let aibuddy_mode = resolve_aibuddy_mode(config.get_aibuddy_mode_strict())?;
            let mcp_servers = extension_configs_to_mcp_servers(&extensions);

            let mode_mapping = HashMap::from([
                (AIBuddyMode::Auto, vec!["agent-full-access".to_string()]),
                (AIBuddyMode::SmartApprove, vec!["agent".to_string()]),
                (AIBuddyMode::Approve, vec!["read-only".to_string()]),
                (AIBuddyMode::Chat, vec!["read-only".to_string()]),
            ]);

            let provider_config = AcpProviderConfig {
                command: resolved_command,
                args: vec![],
                env: vec![],
                env_remove: vec![],
                work_dir: working_dir,
                mcp_servers,
                session_mode_id: None,
                session_config_options: vec![],
                model_config_option_id: Some("model".to_string()),
                mode_mapping,
                notification_callback: None,
            };

            let metadata = Self::metadata();
            AcpProvider::connect(metadata.name, aibuddy_mode, provider_config).await
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::{symlink, PermissionsExt};
    #[cfg(unix)]
    use std::process::Command;

    #[cfg(unix)]
    const CHILD_ENV: &str = "AIBUDDY_CODEX_ACP_MODE_TEST_CHILD";
    #[cfg(unix)]
    const EXPECT_CONFIG_ERROR_ENV: &str = "AIBUDDY_CODEX_ACP_EXPECT_CONFIG_ERROR";

    #[cfg(unix)]
    #[derive(Clone, Copy)]
    enum ConfigFixture {
        Absent,
        File(&'static str),
        Directory,
        DanglingSymlink,
        DanglingParentSymlink,
    }

    #[test]
    fn missing_aibuddy_mode_defaults_to_auto() {
        assert_eq!(
            resolve_aibuddy_mode(Err(ConfigError::NotFound("AIBUDDY_MODE".to_string()))).unwrap(),
            AIBuddyMode::Auto
        );
    }

    #[test]
    fn configured_aibuddy_modes_are_preserved() {
        for mode in [
            AIBuddyMode::Auto,
            AIBuddyMode::SmartApprove,
            AIBuddyMode::Approve,
            AIBuddyMode::Chat,
        ] {
            assert_eq!(resolve_aibuddy_mode(Ok(mode)).unwrap(), mode);
        }
    }

    #[test]
    fn invalid_aibuddy_mode_errors_are_preserved() {
        assert!(matches!(
            resolve_aibuddy_mode(Err(ConfigError::DeserializeError("invalid".to_string()))),
            Err(ConfigError::DeserializeError(_))
        ));
        assert!(matches!(
            resolve_aibuddy_mode(Err(ConfigError::FileError(std::io::Error::other(
                "unreadable"
            )))),
            Err(ConfigError::FileError(_))
        ));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn aibuddy_mode_validation_precedes_codex_acp_launch() {
        if std::env::var_os(CHILD_ENV).is_some() {
            let error = CodexAcpProvider::from_env(vec![], None)
                .await
                .expect_err("marker executable should fail ACP initialization");
            let is_config_error = matches!(
                error.downcast_ref::<ConfigError>(),
                Some(ConfigError::DeserializeError(_) | ConfigError::FileError(_))
            );
            assert_eq!(
                is_config_error,
                std::env::var_os(EXPECT_CONFIG_ERROR_ENV).is_some(),
                "unexpected provider error: {error:#}"
            );
            return;
        }

        let fixture = tempfile::tempdir().unwrap();
        let executable = fixture.path().join(CODEX_ACP_PROVIDER_NAME);
        fs::write(
            &executable,
            "#!/bin/sh\n: > \"$AIBUDDY_CODEX_ACP_MARKER\"\nexit 1\n",
        )
        .unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();

        let search_paths = serde_json::to_string(&vec![fixture.path()]).unwrap();
        for (name, mode, config_fixture, should_launch) in [
            ("unset", None, ConfigFixture::Absent, true),
            ("auto", Some("auto"), ConfigFixture::Absent, true),
            (
                "smart_approve",
                Some("smart_approve"),
                ConfigFixture::Absent,
                true,
            ),
            ("approve", Some("approve"), ConfigFixture::Absent, true),
            ("chat", Some("chat"), ConfigFixture::Absent, true),
            ("invalid", Some("invalid"), ConfigFixture::Absent, false),
            (
                "configured_file",
                None,
                ConfigFixture::File("AIBUDDY_MODE: approve\n"),
                true,
            ),
            (
                "malformed_file",
                None,
                ConfigFixture::File("AIBUDDY_MODE: ["),
                false,
            ),
            ("unreadable_file", None, ConfigFixture::Directory, false),
            (
                "dangling_symlink",
                None,
                ConfigFixture::DanglingSymlink,
                false,
            ),
            (
                "dangling_parent_symlink",
                None,
                ConfigFixture::DanglingParentSymlink,
                false,
            ),
        ] {
            let marker = fixture.path().join(format!("launched-{name}"));
            let path_root = fixture.path().join(format!("config-{name}"));
            let config_dir = path_root.join("config");
            fs::create_dir_all(&config_dir).unwrap();
            let config_path = config_dir.join("config.yaml");
            match config_fixture {
                ConfigFixture::Absent => {}
                ConfigFixture::File(content) => fs::write(&config_path, content).unwrap(),
                ConfigFixture::Directory => fs::create_dir(&config_path).unwrap(),
                ConfigFixture::DanglingSymlink => {
                    symlink(config_dir.join("missing.yaml"), &config_path).unwrap()
                }
                ConfigFixture::DanglingParentSymlink => {
                    fs::remove_dir(&config_dir).unwrap();
                    symlink(path_root.join("missing-config"), &config_dir).unwrap();
                }
            }
            let mut command = Command::new(std::env::current_exe().unwrap());
            command
                .arg("--exact")
                .arg("providers::codex_acp::tests::aibuddy_mode_validation_precedes_codex_acp_launch")
                .arg("--nocapture")
                .env(CHILD_ENV, "1")
                .env("AIBUDDY_SEARCH_PATHS", &search_paths)
                .env("AIBUDDY_CODEX_ACP_MARKER", &marker)
                .env("AIBUDDY_PATH_ROOT", &path_root)
                .env(
                    crate::config::base::TEST_SYSTEM_CONFIG_PATH_ENV,
                    path_root.join("system-config.yaml"),
                )
                .env_remove("AIBUDDY_ADDITIONAL_CONFIG_FILES")
                .env("AIBUDDY_DISABLE_KEYRING", "1");
            if should_launch {
                command.env_remove(EXPECT_CONFIG_ERROR_ENV);
            } else {
                command.env(EXPECT_CONFIG_ERROR_ENV, "1");
            }
            match mode {
                Some(mode) => {
                    command.env("AIBUDDY_MODE", mode);
                }
                None => {
                    command.env_remove("AIBUDDY_MODE");
                }
            }
            let output = command.output().unwrap();

            assert!(
                output.status.success(),
                "{name} child test failed:\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            assert_eq!(
                marker.exists(),
                should_launch,
                "unexpected codex-acp launch result for {name} AIBUDDY_MODE"
            );
        }
    }
}
