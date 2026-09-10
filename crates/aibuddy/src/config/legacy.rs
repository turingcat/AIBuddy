use serde_yaml::{Mapping, Value};
use std::env;
use std::ffi::OsString;

/// Historical environment/config names that were renamed during the rebrand.
/// The explicit table avoids treating every `AIBUDDY_*` identifier as a setting.
pub const LEGACY_ENV_ALIASES: &[(&str, &str)] = &[
    (
        "GOOSE_ADDITIONAL_CONFIG_FILES",
        "AIBUDDY_ADDITIONAL_CONFIG_FILES",
    ),
    ("GOOSE_ALLOWLIST", "AIBUDDY_ALLOWLIST"),
    ("GOOSE_ALLOWLIST_BYPASS", "AIBUDDY_ALLOWLIST_BYPASS"),
    ("GOOSE_ALLOWLIST_WARNING", "AIBUDDY_ALLOWLIST_WARNING"),
    ("GOOSE_APP_TYPE", "AIBUDDY_APP_TYPE"),
    (
        "GOOSE_AUTO_COMPACT_THRESHOLD",
        "AIBUDDY_AUTO_COMPACT_THRESHOLD",
    ),
    ("GOOSE_BIN", "AIBUDDY_BIN"),
    ("GOOSE_BINARY", "AIBUDDY_BINARY"),
    ("GOOSE_BIN_DIR", "AIBUDDY_BIN_DIR"),
    ("GOOSE_BUNDLE_HOST", "AIBUDDY_BUNDLE_HOST"),
    ("GOOSE_BUNDLE_MODEL", "AIBUDDY_BUNDLE_MODEL"),
    ("GOOSE_BUNDLE_NAME", "AIBUDDY_BUNDLE_NAME"),
    ("GOOSE_BUNDLE_TYPE", "AIBUDDY_BUNDLE_TYPE"),
    ("GOOSE_CACHE_TTL", "AIBUDDY_CACHE_TTL"),
    ("GOOSE_CA_CERT_PATH", "AIBUDDY_CA_CERT_PATH"),
    ("GOOSE_CLI", "AIBUDDY_CLI"),
    ("GOOSE_CLIENT_CERT_PATH", "AIBUDDY_CLIENT_CERT_PATH"),
    ("GOOSE_CLIENT_KEY_PATH", "AIBUDDY_CLIENT_KEY_PATH"),
    ("GOOSE_CLI_DARK_THEME", "AIBUDDY_CLI_DARK_THEME"),
    ("GOOSE_CLI_LIGHT_THEME", "AIBUDDY_CLI_LIGHT_THEME"),
    ("GOOSE_CLI_MIN_PRIORITY", "AIBUDDY_CLI_MIN_PRIORITY"),
    ("GOOSE_CLI_NEWLINE_KEY", "AIBUDDY_CLI_NEWLINE_KEY"),
    ("GOOSE_CLI_SHOW_COST", "AIBUDDY_CLI_SHOW_COST"),
    ("GOOSE_CLI_SHOW_THINKING", "AIBUDDY_CLI_SHOW_THINKING"),
    ("GOOSE_CLI_THEME", "AIBUDDY_CLI_THEME"),
    ("GOOSE_CMD", "AIBUDDY_CMD"),
    (
        "GOOSE_CODEX_ACP_EXPECT_CONFIG_ERROR",
        "AIBUDDY_CODEX_ACP_EXPECT_CONFIG_ERROR",
    ),
    ("GOOSE_CODEX_ACP_MARKER", "AIBUDDY_CODEX_ACP_MARKER"),
    (
        "GOOSE_CODEX_ACP_MODE_TEST_CHILD",
        "AIBUDDY_CODEX_ACP_MODE_TEST_CHILD",
    ),
    ("GOOSE_CODEX_DEBUG", "AIBUDDY_CODEX_DEBUG"),
    ("GOOSE_CODE_REVIEW_MODEL", "AIBUDDY_CODE_REVIEW_MODEL"),
    (
        "GOOSE_COMPLETED_TASK_TTL_SECS",
        "AIBUDDY_COMPLETED_TASK_TTL_SECS",
    ),
    ("GOOSE_CONFIG_DIR", "AIBUDDY_CONFIG_DIR"),
    ("GOOSE_CONFIG_PREFIX", "AIBUDDY_CONFIG_PREFIX"),
    ("GOOSE_CONTEXT_LIMIT", "AIBUDDY_CONTEXT_LIMIT"),
    ("GOOSE_CONTEXT_STRATEGY", "AIBUDDY_CONTEXT_STRATEGY"),
    ("GOOSE_CURSOR_AGENT_DEBUG", "AIBUDDY_CURSOR_AGENT_DEBUG"),
    (
        "GOOSE_DATABRICKS_CLIENT_REQUEST_ID",
        "AIBUDDY_DATABRICKS_CLIENT_REQUEST_ID",
    ),
    ("GOOSE_DEBUG", "AIBUDDY_DEBUG"),
    (
        "GOOSE_DEFAULT_EXTENSION_TIMEOUT",
        "AIBUDDY_DEFAULT_EXTENSION_TIMEOUT",
    ),
    ("GOOSE_DEFAULT_MODEL", "AIBUDDY_DEFAULT_MODEL"),
    ("GOOSE_DEFAULT_PROVIDER", "AIBUDDY_DEFAULT_PROVIDER"),
    ("GOOSE_DISABLE_KEYRING", "AIBUDDY_DISABLE_KEYRING"),
    (
        "GOOSE_DISABLE_NOSTR_SHARING",
        "AIBUDDY_DISABLE_NOSTR_SHARING",
    ),
    (
        "GOOSE_DISABLE_SESSION_NAMING",
        "AIBUDDY_DISABLE_SESSION_NAMING",
    ),
    ("GOOSE_DOCS_ROOT", "AIBUDDY_DOCS_ROOT"),
    (
        "GOOSE_DOCS_ROOT_PLACEHOLDER",
        "AIBUDDY_DOCS_ROOT_PLACEHOLDER",
    ),
    ("GOOSE_ENABLE_ROUTER", "AIBUDDY_ENABLE_ROUTER"),
    ("GOOSE_EXTERNAL_BACKEND", "AIBUDDY_EXTERNAL_BACKEND"),
    (
        "GOOSE_EXTERNAL_BACKEND_SOURCE",
        "AIBUDDY_EXTERNAL_BACKEND_SOURCE",
    ),
    ("GOOSE_EXTERNAL_BACKEND_URL", "AIBUDDY_EXTERNAL_BACKEND_URL"),
    ("GOOSE_EXT_AGENT_REQUESTS", "AIBUDDY_EXT_AGENT_REQUESTS"),
    ("GOOSE_EXT_METHODS", "AIBUDDY_EXT_METHODS"),
    ("GOOSE_EXT_NOTIFICATIONS", "AIBUDDY_EXT_NOTIFICATIONS"),
    ("GOOSE_FAST_MODEL", "AIBUDDY_FAST_MODEL"),
    ("GOOSE_GATEWAY_MAX_TURNS", "AIBUDDY_GATEWAY_MAX_TURNS"),
    ("GOOSE_GITHUB_REPO", "AIBUDDY_GITHUB_REPO"),
    ("GOOSE_HINTS_FILENAME", "AIBUDDY_HINTS_FILENAME"),
    (
        "GOOSE_HUGGINGFACE_OAUTH_CLIENT_ID",
        "AIBUDDY_HUGGINGFACE_OAUTH_CLIENT_ID",
    ),
    ("GOOSE_INPUT_LIMIT", "AIBUDDY_INPUT_LIMIT"),
    ("GOOSE_JBANG_REGISTRY", "AIBUDDY_JBANG_REGISTRY"),
    ("GOOSE_LINUX_VARIANT", "AIBUDDY_LINUX_VARIANT"),
    ("GOOSE_LOCALE", "AIBUDDY_LOCALE"),
    ("GOOSE_LOCAL_DRAFT_MODEL", "AIBUDDY_LOCAL_DRAFT_MODEL"),
    (
        "GOOSE_LOCAL_ENABLE_THINKING",
        "AIBUDDY_LOCAL_ENABLE_THINKING",
    ),
    ("GOOSE_MAX_ACTIVE_AGENTS", "AIBUDDY_MAX_ACTIVE_AGENTS"),
    ("GOOSE_MAX_BACKGROUND_TASKS", "AIBUDDY_MAX_BACKGROUND_TASKS"),
    ("GOOSE_MAX_CODE_BLOCK_LINES", "AIBUDDY_MAX_CODE_BLOCK_LINES"),
    ("GOOSE_MAX_TOKENS", "AIBUDDY_MAX_TOKENS"),
    (
        "GOOSE_MAX_TOOL_RESPONSE_SIZE",
        "AIBUDDY_MAX_TOOL_RESPONSE_SIZE",
    ),
    ("GOOSE_MAX_TURNS", "AIBUDDY_MAX_TURNS"),
    ("GOOSE_MCP_CLIENT_VERSION", "AIBUDDY_MCP_CLIENT_VERSION"),
    (
        "GOOSE_MCP_HOST_CAPABILITIES",
        "AIBUDDY_MCP_HOST_CAPABILITIES",
    ),
    ("GOOSE_MCP_OAUTH_CLIENT_ID", "AIBUDDY_MCP_OAUTH_CLIENT_ID"),
    (
        "GOOSE_MCP_OAUTH_CLIENT_METADATA_URL",
        "AIBUDDY_MCP_OAUTH_CLIENT_METADATA_URL",
    ),
    (
        "GOOSE_MCP_OAUTH_CLIENT_SECRET",
        "AIBUDDY_MCP_OAUTH_CLIENT_SECRET",
    ),
    ("GOOSE_MCP_UI_EXTENSION_ID", "AIBUDDY_MCP_UI_EXTENSION_ID"),
    ("GOOSE_MODE", "AIBUDDY_MODE"),
    ("GOOSE_MODEL", "AIBUDDY_MODEL"),
    ("GOOSE_MOIM_MESSAGE_FILE", "AIBUDDY_MOIM_MESSAGE_FILE"),
    ("GOOSE_MOIM_MESSAGE_TEXT", "AIBUDDY_MOIM_MESSAGE_TEXT"),
    ("GOOSE_NODE_DIR", "AIBUDDY_NODE_DIR"),
    ("GOOSE_NOSTR_RELAYS", "AIBUDDY_NOSTR_RELAYS"),
    ("GOOSE_NOTIFICATIONS", "AIBUDDY_NOTIFICATIONS"),
    ("GOOSE_NO_CODE_TRUNCATION", "AIBUDDY_NO_CODE_TRUNCATION"),
    ("GOOSE_NPM_CERT", "AIBUDDY_NPM_CERT"),
    ("GOOSE_NPM_REGISTRY", "AIBUDDY_NPM_REGISTRY"),
    ("GOOSE_NU_PREEXEC_INSTALLED", "AIBUDDY_NU_PREEXEC_INSTALLED"),
    (
        "GOOSE_OAUTH_AUTOMATIC_CALLBACK",
        "AIBUDDY_OAUTH_AUTOMATIC_CALLBACK",
    ),
    ("GOOSE_OAUTH_CALLBACK_PORT", "AIBUDDY_OAUTH_CALLBACK_PORT"),
    (
        "GOOSE_OAUTH_CALLBACK_TIMEOUT_SECONDS",
        "AIBUDDY_OAUTH_CALLBACK_TIMEOUT_SECONDS",
    ),
    ("GOOSE_PATH_ROOT", "AIBUDDY_PATH_ROOT"),
    ("GOOSE_PLANNER_MODEL", "AIBUDDY_PLANNER_MODEL"),
    ("GOOSE_PLANNER_PROVIDER", "AIBUDDY_PLANNER_PROVIDER"),
    ("GOOSE_PORT", "AIBUDDY_PORT"),
    ("GOOSE_PREDEFINED_MODELS", "AIBUDDY_PREDEFINED_MODELS"),
    ("GOOSE_PROMPT_EDITOR", "AIBUDDY_PROMPT_EDITOR"),
    ("GOOSE_PROMPT_EDITOR_ALWAYS", "AIBUDDY_PROMPT_EDITOR_ALWAYS"),
    ("GOOSE_PROVIDER", "AIBUDDY_PROVIDER"),
    (
        "GOOSE_PROVIDER_SKIP_BACKOFF",
        "AIBUDDY_PROVIDER_SKIP_BACKOFF",
    ),
    ("GOOSE_PROVIDER__API_KEY", "AIBUDDY_PROVIDER__API_KEY"),
    ("GOOSE_PROVIDER__HOST", "AIBUDDY_PROVIDER__HOST"),
    ("GOOSE_PROVIDER__MODEL", "AIBUDDY_PROVIDER__MODEL"),
    ("GOOSE_PROVIDER__TYPE", "AIBUDDY_PROVIDER__TYPE"),
    (
        "GOOSE_RANDOM_THINKING_MESSAGES",
        "AIBUDDY_RANDOM_THINKING_MESSAGES",
    ),
    ("GOOSE_RECIPE", "AIBUDDY_RECIPE"),
    ("GOOSE_RECIPE_GITHUB_REPO", "AIBUDDY_RECIPE_GITHUB_REPO"),
    (
        "GOOSE_RECIPE_GITHUB_REPO_CONFIG_KEY",
        "AIBUDDY_RECIPE_GITHUB_REPO_CONFIG_KEY",
    ),
    (
        "GOOSE_RECIPE_ON_FAILURE_TIMEOUT_SECONDS",
        "AIBUDDY_RECIPE_ON_FAILURE_TIMEOUT_SECONDS",
    ),
    ("GOOSE_RECIPE_PATH", "AIBUDDY_RECIPE_PATH"),
    ("GOOSE_RECIPE_PATH_ENV_VAR", "AIBUDDY_RECIPE_PATH_ENV_VAR"),
    (
        "GOOSE_RECIPE_RETRY_TIMEOUT_SECONDS",
        "AIBUDDY_RECIPE_RETRY_TIMEOUT_SECONDS",
    ),
    ("GOOSE_RECORD_MCP", "AIBUDDY_RECORD_MCP"),
    ("GOOSE_REPO", "AIBUDDY_REPO"),
    ("GOOSE_ROAM_RELAYS", "AIBUDDY_ROAM_RELAYS"),
    ("GOOSE_ROAM_RELAY_TOKEN", "AIBUDDY_ROAM_RELAY_TOKEN"),
    ("GOOSE_SCHEMA_CONTEXT", "AIBUDDY_SCHEMA_CONTEXT"),
    ("GOOSE_SEARCH_PATHS", "AIBUDDY_SEARCH_PATHS"),
    (
        "GOOSE_SERVER_SECRET_KEY_ENV",
        "AIBUDDY_SERVER_SECRET_KEY_ENV",
    ),
    ("GOOSE_SERVER__SECRET_KEY", "AIBUDDY_SERVER__SECRET_KEY"),
    (
        "GOOSE_SERVE_EXITED_USER_MESSAGE",
        "AIBUDDY_SERVE_EXITED_USER_MESSAGE",
    ),
    ("GOOSE_SHELL", "AIBUDDY_SHELL"),
    ("GOOSE_SHOW_FULL_OUTPUT", "AIBUDDY_SHOW_FULL_OUTPUT"),
    ("GOOSE_STATE_MACHINE", "AIBUDDY_STATE_MACHINE"),
    ("GOOSE_STATUS", "AIBUDDY_STATUS"),
    ("GOOSE_STATUS_HOOK", "AIBUDDY_STATUS_HOOK"),
    ("GOOSE_STOP_HOOK_BLOCK_CAP", "AIBUDDY_STOP_HOOK_BLOCK_CAP"),
    ("GOOSE_STREAM_TIMEOUT", "AIBUDDY_STREAM_TIMEOUT"),
    ("GOOSE_SUBAGENT_MAX_TURNS", "AIBUDDY_SUBAGENT_MAX_TURNS"),
    ("GOOSE_SUBAGENT_MODEL", "AIBUDDY_SUBAGENT_MODEL"),
    ("GOOSE_SUBAGENT_PROVIDER", "AIBUDDY_SUBAGENT_PROVIDER"),
    (
        "GOOSE_SUBPROCESS_PARENT_DEATH_HELPER",
        "AIBUDDY_SUBPROCESS_PARENT_DEATH_HELPER",
    ),
    (
        "GOOSE_SUBPROCESS_THREAD_DEATH_HELPER",
        "AIBUDDY_SUBPROCESS_THREAD_DEATH_HELPER",
    ),
    (
        "GOOSE_SYSTEM_PROMPT_FILE_PATH",
        "AIBUDDY_SYSTEM_PROMPT_FILE_PATH",
    ),
    ("GOOSE_TELEMETRY_ENABLED", "AIBUDDY_TELEMETRY_ENABLED"),
    ("GOOSE_TELEMETRY_OFF", "AIBUDDY_TELEMETRY_OFF"),
    ("GOOSE_TEMPERATURE", "AIBUDDY_TEMPERATURE"),
    ("GOOSE_TERMINAL", "AIBUDDY_TERMINAL"),
    ("GOOSE_TEST_ERROR", "AIBUDDY_TEST_ERROR"),
    ("GOOSE_TEST_PROVIDER", "AIBUDDY_TEST_PROVIDER"),
    ("GOOSE_THINKING_EFFORT", "AIBUDDY_THINKING_EFFORT"),
    ("GOOSE_TLS", "AIBUDDY_TLS"),
    ("GOOSE_TLS_CERT_PATH", "AIBUDDY_TLS_CERT_PATH"),
    ("GOOSE_TLS_KEY_PATH", "AIBUDDY_TLS_KEY_PATH"),
    ("GOOSE_TODO_MAX_CHARS", "AIBUDDY_TODO_MAX_CHARS"),
    ("GOOSE_TOOLSHIM", "AIBUDDY_TOOLSHIM"),
    ("GOOSE_TOOLSHIM_BACKEND", "AIBUDDY_TOOLSHIM_BACKEND"),
    ("GOOSE_TOOLSHIM_MODEL", "AIBUDDY_TOOLSHIM_MODEL"),
    (
        "GOOSE_TOOLSHIM_OLLAMA_MODEL",
        "AIBUDDY_TOOLSHIM_OLLAMA_MODEL",
    ),
    ("GOOSE_TOOL_CALL_CUTOFF", "AIBUDDY_TOOL_CALL_CUTOFF"),
    ("GOOSE_TOOL_CALL_OK", "AIBUDDY_TOOL_CALL_OK"),
    (
        "GOOSE_TOOL_PAIR_SUMMARIZATION",
        "AIBUDDY_TOOL_PAIR_SUMMARIZATION",
    ),
    ("GOOSE_TRUNCATED_SHOW_LINES", "AIBUDDY_TRUNCATED_SHOW_LINES"),
    ("GOOSE_TUNNEL", "AIBUDDY_TUNNEL"),
    ("GOOSE_USER_AGENT", "AIBUDDY_USER_AGENT"),
    ("GOOSE_UV_REGISTRY", "AIBUDDY_UV_REGISTRY"),
    ("GOOSE_VERSION", "AIBUDDY_VERSION"),
    ("GOOSE_WINDOWS_VARIANT", "AIBUDDY_WINDOWS_VARIANT"),
    ("GOOSE_WORKING_DIR", "AIBUDDY_WORKING_DIR"),
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
            Value::String("AIBUDDY_MODEL".into()),
            Value::String("new".into()),
        );

        let changes = normalize_legacy_config_keys(&mut config);

        assert_eq!(changes.len(), 1);
        assert_eq!(
            config.get("AIBUDDY_MODEL").and_then(Value::as_str),
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
            config.get("AIBUDDY_MODEL").and_then(Value::as_str),
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
        assert_eq!(canonical_key("GOOSE_MODEL"), Some("AIBUDDY_MODEL"));
        assert_eq!(canonical_key("GOOSE_API_KEY"), None);
        assert_eq!(canonical_key("GOOSE_BASE_URL"), None);
        assert_eq!(canonical_key("GOOSE_HOME"), None);
        assert_eq!(canonical_key("GOOSE_BUZZ_HOME"), None);
        assert_eq!(canonical_key("GOOSE_TEST_SYSTEM_CONFIG_PATH"), None);
    }

    #[test]
    fn canonical_environment_value_wins_over_legacy_value() {
        let _guard = lock_env([("AIBUDDY_MODEL", Some("new")), ("GOOSE_MODEL", Some("old"))]);

        assert_eq!(env_value("AIBUDDY_MODEL").as_deref(), Some("new"));
    }

    #[test]
    fn canonical_environment_value_falls_back_to_legacy_value() {
        let _guard = lock_env([
            ("AIBUDDY_MODEL", None::<&str>),
            ("GOOSE_MODEL", Some("old")),
        ]);

        assert_eq!(env_value("AIBUDDY_MODEL").as_deref(), Some("old"));
    }

    #[cfg(unix)]
    #[test]
    fn invalid_canonical_environment_value_does_not_fall_back_to_legacy() {
        use std::os::unix::ffi::OsStringExt;

        let _guard = lock_env([
            ("AIBUDDY_MODEL", None::<&str>),
            ("GOOSE_MODEL", Some("old")),
        ]);
        env::set_var("AIBUDDY_MODEL", OsString::from_vec(vec![0xff]));

        assert_eq!(env_value("AIBUDDY_MODEL"), None);
    }

    #[test]
    fn bootstrap_copies_only_missing_canonical_environment_values() {
        let _guard = lock_env([
            ("AIBUDDY_MODEL", None::<&str>),
            ("GOOSE_MODEL", Some("legacy-model")),
            ("AIBUDDY_PROVIDER", Some("canonical-provider")),
            ("GOOSE_PROVIDER", Some("legacy-provider")),
        ]);

        assert_eq!(bootstrap_legacy_environment(), 1);
        assert_eq!(env::var("AIBUDDY_MODEL").as_deref(), Ok("legacy-model"));
        assert_eq!(
            env::var("AIBUDDY_PROVIDER").as_deref(),
            Ok("canonical-provider")
        );
    }

    #[test]
    fn migration_content_reports_keys_without_values() {
        let (migrated, changes) = migrate_config_content(
            "GOOSE_MODEL: secret-model\nprovider:\n  GOOSE_API_KEY: nested-secret\n",
        )
        .unwrap();

        assert_eq!(changes, vec![("GOOSE_MODEL", "AIBUDDY_MODEL")]);
        assert!(migrated.contains("AIBUDDY_MODEL: secret-model"));
        assert!(migrated.contains("GOOSE_API_KEY: nested-secret"));
        assert!(!migrated.contains("GOOSE_MODEL:"));
    }
}
