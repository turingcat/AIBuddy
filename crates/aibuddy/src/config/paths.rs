use crate::config::legacy::env_value_os;
use etcetera::{choose_app_strategy, AppStrategy, AppStrategyArgs};
use std::ffi::OsString;
use std::path::PathBuf;

pub struct Paths;

impl Paths {
    fn get_dir(dir_type: DirType) -> PathBuf {
        if let Some(base) = Self::path_root() {
            match dir_type {
                DirType::Config => base.join("config"),
                DirType::Data => base.join("data"),
                DirType::State => base.join("state"),
                DirType::Plugins => base.join(".agents").join("plugins"),
                DirType::Agents => base.join(".agents").join("agents"),
                DirType::AgentsHome => base.join(".agents"),
            }
        } else {
            // These historical upstream identifiers are part of the persisted
            // directory layout. Changing them would orphan existing installs.
            let strategy = choose_app_strategy(AppStrategyArgs {
                top_level_domain: "Block".to_string(),
                author: "Block".to_string(),
                app_name: "goose".to_string(),
            })
            .expect("aibuddy requires a home dir");

            match dir_type {
                DirType::Config => strategy.config_dir(),
                DirType::Data => strategy.data_dir(),
                DirType::State => strategy.state_dir().unwrap_or(strategy.data_dir()),
                DirType::Plugins => strategy.home_dir().join(".agents").join("plugins"),
                DirType::Agents => strategy.home_dir().join(".agents").join("agents"),
                DirType::AgentsHome => strategy.home_dir().join(".agents"),
            }
        }
    }

    pub(crate) fn path_root() -> Option<PathBuf> {
        Self::validated_path_root(env_value_os("AIBUDDY_PATH_ROOT"))
    }

    fn validated_path_root(value: Option<OsString>) -> Option<PathBuf> {
        value.map(PathBuf::from).filter(|path| path.is_absolute())
    }

    pub fn config_dir() -> PathBuf {
        Self::get_dir(DirType::Config)
    }

    pub fn data_dir() -> PathBuf {
        Self::get_dir(DirType::Data)
    }

    pub fn state_dir() -> PathBuf {
        Self::get_dir(DirType::State)
    }

    pub fn plugins_dir() -> PathBuf {
        Self::get_dir(DirType::Plugins)
    }

    pub fn agents_dir() -> PathBuf {
        Self::get_dir(DirType::Agents)
    }

    pub fn agents_home_dir() -> PathBuf {
        Self::get_dir(DirType::AgentsHome)
    }

    pub fn in_agents_home_dir(subpath: &str) -> PathBuf {
        Self::agents_home_dir().join(subpath)
    }

    pub fn in_state_dir(subpath: &str) -> PathBuf {
        Self::state_dir().join(subpath)
    }

    pub fn in_config_dir(subpath: &str) -> PathBuf {
        Self::config_dir().join(subpath)
    }

    pub fn in_data_dir(subpath: &str) -> PathBuf {
        Self::data_dir().join(subpath)
    }
}

enum DirType {
    Config,
    Data,
    State,
    Plugins,
    Agents,
    AgentsHome,
}

#[cfg(test)]
mod tests {
    use super::Paths;
    use std::ffi::OsString;

    #[test]
    fn path_root_requires_an_absolute_path() {
        assert_eq!(Paths::validated_path_root(None), None);
        assert_eq!(Paths::validated_path_root(Some(OsString::new())), None);
        assert_eq!(
            Paths::validated_path_root(Some(OsString::from("relative/root"))),
            None
        );

        let absolute = std::env::current_dir()
            .unwrap()
            .join("nonexistent-aibuddy-root");
        assert_eq!(
            Paths::validated_path_root(Some(absolute.clone().into_os_string())),
            Some(absolute)
        );
    }

    #[test]
    fn path_root_reads_legacy_environment_after_canonical_environment() {
        let root = std::env::current_dir().unwrap().join("legacy-aibuddy-root");
        let _guard = env_lock::lock_env([
            ("AIBUDDY_PATH_ROOT", None::<&str>),
            ("GOOSE_PATH_ROOT", Some(root.to_str().unwrap())),
        ]);

        assert_eq!(Paths::path_root(), Some(root));
    }
}
