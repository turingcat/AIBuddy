use serde_yaml::{Mapping, Value};
use std::env;
use std::ffi::OsString;

/// Historical environment/config names that were renamed during the rebrand.
/// The explicit table avoids treating every `GOOSE_*` identifier as a setting.
pub const LEGACY_ENV_ALIASES: &[(&str, &str)] = &[
    (
        "GOOSE_ADDITIONAL_CONFIG_FILES",
        "HEYBUDDY_ADDITIONAL_CONFIG_FILES",
    ),
    ("GOOSE_ALLOWLIST", "HEYBUDDY_ALLOWLIST"),
    ("GOOSE_ALLOWLIST_BYPASS", "HEYBUDDY_ALLOWLIST_BYPASS"),
    ("GOOSE_ALLOWLIST_WARNING", "HEYBUDDY_ALLOWLIST_WARNING"),
    ("GOOSE_APP_TYPE", "HEYBUDDY_APP_TYPE"),
    (
        "GOOSE_AUTO_COMPACT_THRESHOLD",
        "HEYBUDDY_AUTO_COMPACT_THRESHOLD",
    ),
    ("GOOSE_BIN", "HEYBUDDY_BIN"),
    ("GOOSE_BINARY", "HEYBUDDY_BINARY"),
    ("GOOSE_BIN_DIR", "HEYBUDDY_BIN_DIR"),
    ("GOOSE_BUNDLE_HOST", "HEYBUDDY_BUNDLE_HOST"),
    ("GOOSE_BUNDLE_MODEL", "HEYBUDDY_BUNDLE_MODEL"),
    ("GOOSE_BUNDLE_NAME", "HEYBUDDY_BUNDLE_NAME"),
    ("GOOSE_BUNDLE_TYPE", "HEYBUDDY_BUNDLE_TYPE"),
    ("GOOSE_CACHE_TTL", "HEYBUDDY_CACHE_TTL"),
    ("GOOSE_CA_CERT_PATH", "HEYBUDDY_CA_CERT_PATH"),
    ("GOOSE_CLI", "HEYBUDDY_CLI"),
    ("GOOSE_CLIENT_CERT_PATH", "HEYBUDDY_CLIENT_CERT_PATH"),
    ("GOOSE_CLIENT_KEY_PATH", "HEYBUDDY_CLIENT_KEY_PATH"),
    ("GOOSE_CLI_DARK_THEME", "HEYBUDDY_CLI_DARK_THEME"),
    ("GOOSE_CLI_LIGHT_THEME", "HEYBUDDY_CLI_LIGHT_THEME"),
    ("GOOSE_CLI_MIN_PRIORITY", "HEYBUDDY_CLI_MIN_PRIORITY"),
    ("GOOSE_CLI_NEWLINE_KEY", "HEYBUDDY_CLI_NEWLINE_KEY"),
    ("GOOSE_CLI_SHOW_COST", "HEYBUDDY_CLI_SHOW_COST"),
    ("GOOSE_CLI_SHOW_THINKING", "HEYBUDDY_CLI_SHOW_THINKING"),
    ("GOOSE_CLI_THEME", "HEYBUDDY_CLI_THEME"),
    ("GOOSE_CMD", "HEYBUDDY_CMD"),
    (
        "GOOSE_CODEX_ACP_EXPECT_CONFIG_ERROR",
        "HEYBUDDY_CODEX_ACP_EXPECT_CONFIG_ERROR",
    ),
    ("GOOSE_CODEX_ACP_MARKER", "HEYBUDDY_CODEX_ACP_MARKER"),
    (
        "GOOSE_CODEX_ACP_MODE_TEST_CHILD",
        "HEYBUDDY_CODEX_ACP_MODE_TEST_CHILD",
    ),
    ("GOOSE_CODEX_DEBUG", "HEYBUDDY_CODEX_DEBUG"),
    ("GOOSE_CODE_REVIEW_MODEL", "HEYBUDDY_CODE_REVIEW_MODEL"),
    (
        "GOOSE_COMPLETED_TASK_TTL_SECS",
        "HEYBUDDY_COMPLETED_TASK_TTL_SECS",
    ),
    ("GOOSE_CONFIG_DIR", "HEYBUDDY_CONFIG_DIR"),
    ("GOOSE_CONFIG_PREFIX", "HEYBUDDY_CONFIG_PREFIX"),
    ("GOOSE_CONTEXT_LIMIT", "HEYBUDDY_CONTEXT_LIMIT"),
    ("GOOSE_CONTEXT_STRATEGY", "HEYBUDDY_CONTEXT_STRATEGY"),
    ("GOOSE_CURSOR_AGENT_DEBUG", "HEYBUDDY_CURSOR_AGENT_DEBUG"),
    (
        "GOOSE_DATABRICKS_CLIENT_REQUEST_ID",
        "HEYBUDDY_DATABRICKS_CLIENT_REQUEST_ID",
    ),
    ("GOOSE_DEBUG", "HEYBUDDY_DEBUG"),
    (
        "GOOSE_DEFAULT_EXTENSION_TIMEOUT",
        "HEYBUDDY_DEFAULT_EXTENSION_TIMEOUT",
    ),
    ("GOOSE_DEFAULT_MODEL", "HEYBUDDY_DEFAULT_MODEL"),
    ("GOOSE_DEFAULT_PROVIDER", "HEYBUDDY_DEFAULT_PROVIDER"),
    ("GOOSE_DISABLE_KEYRING", "HEYBUDDY_DISABLE_KEYRING"),
    (
        "GOOSE_DISABLE_NOSTR_SHARING",
        "HEYBUDDY_DISABLE_NOSTR_SHARING",
    ),
    (
        "GOOSE_DISABLE_SESSION_NAMING",
        "HEYBUDDY_DISABLE_SESSION_NAMING",
    ),
    ("GOOSE_DOCS_ROOT", "HEYBUDDY_DOCS_ROOT"),
    (
        "GOOSE_DOCS_ROOT_PLACEHOLDER",
        "HEYBUDDY_DOCS_ROOT_PLACEHOLDER",
    ),
    ("GOOSE_ENABLE_ROUTER", "HEYBUDDY_ENABLE_ROUTER"),
    ("GOOSE_EXTERNAL_BACKEND", "HEYBUDDY_EXTERNAL_BACKEND"),
    (
        "GOOSE_EXTERNAL_BACKEND_SOURCE",
        "HEYBUDDY_EXTERNAL_BACKEND_SOURCE",
    ),
    (
        "GOOSE_EXTERNAL_BACKEND_URL",
        "HEYBUDDY_EXTERNAL_BACKEND_URL",
    ),
    ("GOOSE_EXT_AGENT_REQUESTS", "HEYBUDDY_EXT_AGENT_REQUESTS"),
    ("GOOSE_EXT_METHODS", "HEYBUDDY_EXT_METHODS"),
    ("GOOSE_EXT_NOTIFICATIONS", "HEYBUDDY_EXT_NOTIFICATIONS"),
    ("GOOSE_FAST_MODEL", "HEYBUDDY_FAST_MODEL"),
    ("GOOSE_GATEWAY_MAX_TURNS", "HEYBUDDY_GATEWAY_MAX_TURNS"),
    ("GOOSE_GITHUB_REPO", "HEYBUDDY_GITHUB_REPO"),
    ("GOOSE_HINTS_FILENAME", "HEYBUDDY_HINTS_FILENAME"),
    (
        "GOOSE_HUGGINGFACE_OAUTH_CLIENT_ID",
        "HEYBUDDY_HUGGINGFACE_OAUTH_CLIENT_ID",
    ),
    ("GOOSE_INPUT_LIMIT", "HEYBUDDY_INPUT_LIMIT"),
    ("GOOSE_JBANG_REGISTRY", "HEYBUDDY_JBANG_REGISTRY"),
    ("GOOSE_LINUX_VARIANT", "HEYBUDDY_LINUX_VARIANT"),
    ("GOOSE_LOCALE", "HEYBUDDY_LOCALE"),
    ("GOOSE_LOCAL_DRAFT_MODEL", "HEYBUDDY_LOCAL_DRAFT_MODEL"),
    (
        "GOOSE_LOCAL_ENABLE_THINKING",
        "HEYBUDDY_LOCAL_ENABLE_THINKING",
    ),
    ("GOOSE_MAX_ACTIVE_AGENTS", "HEYBUDDY_MAX_ACTIVE_AGENTS"),
    (
        "GOOSE_MAX_BACKGROUND_TASKS",
        "HEYBUDDY_MAX_BACKGROUND_TASKS",
    ),
    (
        "GOOSE_MAX_CODE_BLOCK_LINES",
        "HEYBUDDY_MAX_CODE_BLOCK_LINES",
    ),
    ("GOOSE_MAX_TOKENS", "HEYBUDDY_MAX_TOKENS"),
    (
        "GOOSE_MAX_TOOL_RESPONSE_SIZE",
        "HEYBUDDY_MAX_TOOL_RESPONSE_SIZE",
    ),
    ("GOOSE_MAX_TURNS", "HEYBUDDY_MAX_TURNS"),
    ("GOOSE_MCP_CLIENT_VERSION", "HEYBUDDY_MCP_CLIENT_VERSION"),
    (
        "GOOSE_MCP_HOST_CAPABILITIES",
        "HEYBUDDY_MCP_HOST_CAPABILITIES",
    ),
    ("GOOSE_MCP_OAUTH_CLIENT_ID", "HEYBUDDY_MCP_OAUTH_CLIENT_ID"),
    (
        "GOOSE_MCP_OAUTH_CLIENT_METADATA_URL",
        "HEYBUDDY_MCP_OAUTH_CLIENT_METADATA_URL",
    ),
    (
        "GOOSE_MCP_OAUTH_CLIENT_SECRET",
        "HEYBUDDY_MCP_OAUTH_CLIENT_SECRET",
    ),
    ("GOOSE_MCP_UI_EXTENSION_ID", "HEYBUDDY_MCP_UI_EXTENSION_ID"),
    ("GOOSE_MODE", "HEYBUDDY_MODE"),
    ("GOOSE_MODEL", "HEYBUDDY_MODEL"),
    ("GOOSE_MOIM_MESSAGE_FILE", "HEYBUDDY_MOIM_MESSAGE_FILE"),
    ("GOOSE_MOIM_MESSAGE_TEXT", "HEYBUDDY_MOIM_MESSAGE_TEXT"),
    ("GOOSE_NODE_DIR", "HEYBUDDY_NODE_DIR"),
    ("GOOSE_NOSTR_RELAYS", "HEYBUDDY_NOSTR_RELAYS"),
    ("GOOSE_NOTIFICATIONS", "HEYBUDDY_NOTIFICATIONS"),
    ("GOOSE_NO_CODE_TRUNCATION", "HEYBUDDY_NO_CODE_TRUNCATION"),
    ("GOOSE_NPM_CERT", "HEYBUDDY_NPM_CERT"),
    ("GOOSE_NPM_REGISTRY", "HEYBUDDY_NPM_REGISTRY"),
    (
        "GOOSE_NU_PREEXEC_INSTALLED",
        "HEYBUDDY_NU_PREEXEC_INSTALLED",
    ),
    (
        "GOOSE_OAUTH_AUTOMATIC_CALLBACK",
        "HEYBUDDY_OAUTH_AUTOMATIC_CALLBACK",
    ),
    ("GOOSE_OAUTH_CALLBACK_PORT", "HEYBUDDY_OAUTH_CALLBACK_PORT"),
    (
        "GOOSE_OAUTH_CALLBACK_TIMEOUT_SECONDS",
        "HEYBUDDY_OAUTH_CALLBACK_TIMEOUT_SECONDS",
    ),
    ("GOOSE_PATH_ROOT", "HEYBUDDY_PATH_ROOT"),
    ("GOOSE_PLANNER_MODEL", "HEYBUDDY_PLANNER_MODEL"),
    ("GOOSE_PLANNER_PROVIDER", "HEYBUDDY_PLANNER_PROVIDER"),
    ("GOOSE_PORT", "HEYBUDDY_PORT"),
    ("GOOSE_PREDEFINED_MODELS", "HEYBUDDY_PREDEFINED_MODELS"),
    ("GOOSE_PROMPT_EDITOR", "HEYBUDDY_PROMPT_EDITOR"),
    (
        "GOOSE_PROMPT_EDITOR_ALWAYS",
        "HEYBUDDY_PROMPT_EDITOR_ALWAYS",
    ),
    ("GOOSE_PROVIDER", "HEYBUDDY_PROVIDER"),
    (
        "GOOSE_PROVIDER_SKIP_BACKOFF",
        "HEYBUDDY_PROVIDER_SKIP_BACKOFF",
    ),
    ("GOOSE_PROVIDER__API_KEY", "HEYBUDDY_PROVIDER__API_KEY"),
    ("GOOSE_PROVIDER__HOST", "HEYBUDDY_PROVIDER__HOST"),
    ("GOOSE_PROVIDER__MODEL", "HEYBUDDY_PROVIDER__MODEL"),
    ("GOOSE_PROVIDER__TYPE", "HEYBUDDY_PROVIDER__TYPE"),
    (
        "GOOSE_RANDOM_THINKING_MESSAGES",
        "HEYBUDDY_RANDOM_THINKING_MESSAGES",
    ),
    ("GOOSE_RECIPE", "HEYBUDDY_RECIPE"),
    ("GOOSE_RECIPE_GITHUB_REPO", "HEYBUDDY_RECIPE_GITHUB_REPO"),
    (
        "GOOSE_RECIPE_GITHUB_REPO_CONFIG_KEY",
        "HEYBUDDY_RECIPE_GITHUB_REPO_CONFIG_KEY",
    ),
    (
        "GOOSE_RECIPE_ON_FAILURE_TIMEOUT_SECONDS",
        "HEYBUDDY_RECIPE_ON_FAILURE_TIMEOUT_SECONDS",
    ),
    ("GOOSE_RECIPE_PATH", "HEYBUDDY_RECIPE_PATH"),
    ("GOOSE_RECIPE_PATH_ENV_VAR", "HEYBUDDY_RECIPE_PATH_ENV_VAR"),
    (
        "GOOSE_RECIPE_RETRY_TIMEOUT_SECONDS",
        "HEYBUDDY_RECIPE_RETRY_TIMEOUT_SECONDS",
    ),
    ("GOOSE_RECORD_MCP", "HEYBUDDY_RECORD_MCP"),
    ("GOOSE_REPO", "HEYBUDDY_REPO"),
    ("GOOSE_ROAM_RELAYS", "HEYBUDDY_ROAM_RELAYS"),
    ("GOOSE_ROAM_RELAY_TOKEN", "HEYBUDDY_ROAM_RELAY_TOKEN"),
    ("GOOSE_SCHEMA_CONTEXT", "HEYBUDDY_SCHEMA_CONTEXT"),
    ("GOOSE_SEARCH_PATHS", "HEYBUDDY_SEARCH_PATHS"),
    (
        "GOOSE_SERVER_SECRET_KEY_ENV",
        "HEYBUDDY_SERVER_SECRET_KEY_ENV",
    ),
    ("GOOSE_SERVER__SECRET_KEY", "HEYBUDDY_SERVER__SECRET_KEY"),
    (
        "GOOSE_SERVE_EXITED_USER_MESSAGE",
        "HEYBUDDY_SERVE_EXITED_USER_MESSAGE",
    ),
    ("GOOSE_SHELL", "HEYBUDDY_SHELL"),
    ("GOOSE_SHOW_FULL_OUTPUT", "HEYBUDDY_SHOW_FULL_OUTPUT"),
    ("GOOSE_STATE_MACHINE", "HEYBUDDY_STATE_MACHINE"),
    ("GOOSE_STATUS", "HEYBUDDY_STATUS"),
    ("GOOSE_STATUS_HOOK", "HEYBUDDY_STATUS_HOOK"),
    ("GOOSE_STOP_HOOK_BLOCK_CAP", "HEYBUDDY_STOP_HOOK_BLOCK_CAP"),
    ("GOOSE_STREAM_TIMEOUT", "HEYBUDDY_STREAM_TIMEOUT"),
    ("GOOSE_SUBAGENT_MAX_TURNS", "HEYBUDDY_SUBAGENT_MAX_TURNS"),
    ("GOOSE_SUBAGENT_MODEL", "HEYBUDDY_SUBAGENT_MODEL"),
    ("GOOSE_SUBAGENT_PROVIDER", "HEYBUDDY_SUBAGENT_PROVIDER"),
    (
        "GOOSE_SUBPROCESS_PARENT_DEATH_HELPER",
        "HEYBUDDY_SUBPROCESS_PARENT_DEATH_HELPER",
    ),
    (
        "GOOSE_SUBPROCESS_THREAD_DEATH_HELPER",
        "HEYBUDDY_SUBPROCESS_THREAD_DEATH_HELPER",
    ),
    (
        "GOOSE_SYSTEM_PROMPT_FILE_PATH",
        "HEYBUDDY_SYSTEM_PROMPT_FILE_PATH",
    ),
    ("GOOSE_TELEMETRY_ENABLED", "HEYBUDDY_TELEMETRY_ENABLED"),
    ("GOOSE_TELEMETRY_OFF", "HEYBUDDY_TELEMETRY_OFF"),
    ("GOOSE_TEMPERATURE", "HEYBUDDY_TEMPERATURE"),
    ("GOOSE_TERMINAL", "HEYBUDDY_TERMINAL"),
    ("GOOSE_TEST_ERROR", "HEYBUDDY_TEST_ERROR"),
    ("GOOSE_TEST_PROVIDER", "HEYBUDDY_TEST_PROVIDER"),
    ("GOOSE_THINKING_EFFORT", "HEYBUDDY_THINKING_EFFORT"),
    ("GOOSE_TLS", "HEYBUDDY_TLS"),
    ("GOOSE_TLS_CERT_PATH", "HEYBUDDY_TLS_CERT_PATH"),
    ("GOOSE_TLS_KEY_PATH", "HEYBUDDY_TLS_KEY_PATH"),
    ("GOOSE_TODO_MAX_CHARS", "HEYBUDDY_TODO_MAX_CHARS"),
    ("GOOSE_TOOLSHIM", "HEYBUDDY_TOOLSHIM"),
    ("GOOSE_TOOLSHIM_BACKEND", "HEYBUDDY_TOOLSHIM_BACKEND"),
    ("GOOSE_TOOLSHIM_MODEL", "HEYBUDDY_TOOLSHIM_MODEL"),
    (
        "GOOSE_TOOLSHIM_OLLAMA_MODEL",
        "HEYBUDDY_TOOLSHIM_OLLAMA_MODEL",
    ),
    ("GOOSE_TOOL_CALL_CUTOFF", "HEYBUDDY_TOOL_CALL_CUTOFF"),
    ("GOOSE_TOOL_CALL_OK", "HEYBUDDY_TOOL_CALL_OK"),
    (
        "GOOSE_TOOL_PAIR_SUMMARIZATION",
        "HEYBUDDY_TOOL_PAIR_SUMMARIZATION",
    ),
    (
        "GOOSE_TRUNCATED_SHOW_LINES",
        "HEYBUDDY_TRUNCATED_SHOW_LINES",
    ),
    ("GOOSE_TUNNEL", "HEYBUDDY_TUNNEL"),
    ("GOOSE_USER_AGENT", "HEYBUDDY_USER_AGENT"),
    ("GOOSE_UV_REGISTRY", "HEYBUDDY_UV_REGISTRY"),
    ("GOOSE_VERSION", "HEYBUDDY_VERSION"),
    ("GOOSE_WINDOWS_VARIANT", "HEYBUDDY_WINDOWS_VARIANT"),
    ("GOOSE_WORKING_DIR", "HEYBUDDY_WORKING_DIR"),
];

pub type LegacyKeyChanges = Vec<(&'static str, &'static str)>;

pub fn canonical_key(key: &str) -> Option<&'static str> {
    LEGACY_ENV_ALIASES
        .iter()
        .find_map(|(legacy, canonical)| (*legacy == key).then_some(*canonical))
}

fn legacy_key(canonical: &str) -> Option<&'static str> {
    LEGACY_ENV_ALIASES
        .iter()
        .find_map(|(legacy, name)| (*name == canonical).then_some(*legacy))
}

pub(crate) fn env_value_os(key: &str) -> Option<OsString> {
    let canonical = canonical_key(key).unwrap_or(key);
    env::var_os(canonical).or_else(|| legacy_key(canonical).and_then(env::var_os))
}

pub(crate) fn env_value(key: &str) -> Option<String> {
    let canonical = canonical_key(key).unwrap_or(key);
    match env::var_os(canonical) {
        Some(value) => value.into_string().ok(),
        None => legacy_key(canonical)
            .and_then(env::var_os)
            .and_then(|value| value.into_string().ok()),
    }
}

/// Copy approved legacy environment values into canonical names for direct
/// environment consumers. Library constructors never call this function.
pub fn bootstrap_legacy_environment() -> usize {
    let mut copied = 0;
    for (legacy, canonical) in LEGACY_ENV_ALIASES {
        if env::var_os(canonical).is_none() {
            if let Some(value) = env::var_os(legacy) {
                env::set_var(canonical, value);
                copied += 1;
            }
        }
    }
    copied
}

/// Rename approved legacy keys at one YAML mapping layer.
///
/// Nested mappings are deliberately not traversed. If both names exist in
/// this layer, the canonical value wins and the legacy key is discarded.
pub fn normalize_legacy_config_keys(config: &mut Mapping) -> LegacyKeyChanges {
    let mut changes = Vec::new();

    for (legacy, canonical) in LEGACY_ENV_ALIASES {
        let legacy_key = Value::String((*legacy).to_string());
        let canonical_key = Value::String((*canonical).to_string());
        let Some(value) = config.remove(&legacy_key) else {
            continue;
        };

        if !config.contains_key(&canonical_key) {
            config.insert(canonical_key, value);
        }
        changes.push((*legacy, *canonical));
    }

    changes
}

pub fn migrate_config_content(
    content: &str,
) -> Result<(String, LegacyKeyChanges), serde_yaml::Error> {
    let mut config: Mapping = serde_yaml::from_str(content)?;
    let changes = normalize_legacy_config_keys(&mut config);
    Ok((serde_yaml::to_string(&config)?, changes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use env_lock::lock_env;
    use serde_yaml::{Mapping, Value};

    #[test]
    fn normalizes_allowed_top_level_key_and_canonical_wins() {
        let mut config = Mapping::new();
        config.insert(
            Value::String("GOOSE_MODEL".into()),
            Value::String("old".into()),
        );
        config.insert(
            Value::String("HEYBUDDY_MODEL".into()),
            Value::String("new".into()),
        );

        let changes = normalize_legacy_config_keys(&mut config);

        assert_eq!(changes.len(), 1);
        assert_eq!(
            config.get("HEYBUDDY_MODEL").and_then(Value::as_str),
            Some("new")
        );
        assert!(!config.contains_key("GOOSE_MODEL"));
    }

    #[test]
    fn normalizes_only_top_level_keys() {
        let mut nested = Mapping::new();
        nested.insert(
            Value::String("GOOSE_MODEL".into()),
            Value::String("nested".into()),
        );

        let mut config = Mapping::new();
        config.insert(
            Value::String("GOOSE_MODEL".into()),
            Value::String("top".into()),
        );
        config.insert(Value::String("provider".into()), Value::Mapping(nested));

        normalize_legacy_config_keys(&mut config);

        assert_eq!(
            config.get("HEYBUDDY_MODEL").and_then(Value::as_str),
            Some("top")
        );
        assert_eq!(
            config
                .get("provider")
                .and_then(Value::as_mapping)
                .and_then(|mapping| mapping.get("GOOSE_MODEL"))
                .and_then(Value::as_str),
            Some("nested")
        );
    }

    #[test]
    fn allowlist_contains_only_real_renamed_names() {
        assert_eq!(LEGACY_ENV_ALIASES.len(), 159);
        assert_eq!(canonical_key("GOOSE_MODEL"), Some("HEYBUDDY_MODEL"));
        assert_eq!(canonical_key("GOOSE_API_KEY"), None);
        assert_eq!(canonical_key("GOOSE_BASE_URL"), None);
        assert_eq!(canonical_key("GOOSE_HOME"), None);
        assert_eq!(canonical_key("GOOSE_BUZZ_HOME"), None);
        assert_eq!(canonical_key("GOOSE_TEST_SYSTEM_CONFIG_PATH"), None);
    }

    #[test]
    fn canonical_environment_value_wins_over_legacy_value() {
        let _guard = lock_env([
            ("HEYBUDDY_MODEL", Some("new")),
            ("GOOSE_MODEL", Some("old")),
        ]);

        assert_eq!(env_value("HEYBUDDY_MODEL").as_deref(), Some("new"));
    }

    #[test]
    fn canonical_environment_value_falls_back_to_legacy_value() {
        let _guard = lock_env([
            ("HEYBUDDY_MODEL", None::<&str>),
            ("GOOSE_MODEL", Some("old")),
        ]);

        assert_eq!(env_value("HEYBUDDY_MODEL").as_deref(), Some("old"));
    }

    #[cfg(unix)]
    #[test]
    fn invalid_canonical_environment_value_does_not_fall_back_to_legacy() {
        use std::os::unix::ffi::OsStringExt;

        let _guard = lock_env([
            ("HEYBUDDY_MODEL", None::<&str>),
            ("GOOSE_MODEL", Some("old")),
        ]);
        env::set_var("HEYBUDDY_MODEL", OsString::from_vec(vec![0xff]));

        assert_eq!(env_value("HEYBUDDY_MODEL"), None);
    }

    #[test]
    fn bootstrap_copies_only_missing_canonical_environment_values() {
        let _guard = lock_env([
            ("HEYBUDDY_MODEL", None::<&str>),
            ("GOOSE_MODEL", Some("legacy-model")),
            ("HEYBUDDY_PROVIDER", Some("canonical-provider")),
            ("GOOSE_PROVIDER", Some("legacy-provider")),
        ]);

        assert_eq!(bootstrap_legacy_environment(), 1);
        assert_eq!(env::var("HEYBUDDY_MODEL").as_deref(), Ok("legacy-model"));
        assert_eq!(
            env::var("HEYBUDDY_PROVIDER").as_deref(),
            Ok("canonical-provider")
        );
    }

    #[test]
    fn migration_content_reports_keys_without_values() {
        let (migrated, changes) = migrate_config_content(
            "GOOSE_MODEL: secret-model\nprovider:\n  GOOSE_API_KEY: nested-secret\n",
        )
        .unwrap();

        assert_eq!(changes, vec![("GOOSE_MODEL", "HEYBUDDY_MODEL")]);
        assert!(migrated.contains("HEYBUDDY_MODEL: secret-model"));
        assert!(migrated.contains("GOOSE_API_KEY: nested-secret"));
        assert!(!migrated.contains("GOOSE_MODEL:"));
    }
}
