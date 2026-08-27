use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use crate::conversation::message::{Message, MessageContent};
use crate::utils::safe_truncate;
use goose_providers::conversation::token_usage::{ProviderUsage, Usage};
use goose_providers::errors::ProviderError;
use rmcp::model::Role;

pub(crate) fn extract_usage_tokens(usage_info: &Value) -> Usage {
    let get = |key: &str| {
        usage_info
            .get(key)
            .and_then(|v| v.as_i64())
            .and_then(|v| i32::try_from(v).ok())
    };
    Usage::from_cache_exclusive_input(
        get("input_tokens"),
        get("output_tokens"),
        get("total_tokens"),
        get("cache_read_input_tokens"),
        get("cache_creation_input_tokens"),
    )
}

pub(crate) fn error_from_event(provider_name: &str, parsed: &Value) -> ProviderError {
    let error_msg = parsed
        .get("error")
        .and_then(|e| e.as_str())
        .or_else(|| parsed.get("message").and_then(|m| m.as_str()))
        .unwrap_or("Unknown error");
    if error_msg.contains("context window exceeded") {
        ProviderError::ContextLengthExceeded(error_msg.to_string())
    } else {
        ProviderError::RequestFailed(format!("{provider_name} error: {error_msg}"))
    }
}

pub(crate) const SESSION_NAME_BEGIN_MARKER: &str = "---BEGIN USER MESSAGES---";
pub(crate) const SESSION_NAME_END_MARKER: &str = "---END USER MESSAGES---";
pub(crate) const SESSION_NAME_SUFFIX: &str = "Generate a short title for the above messages.";
const SEPARATED_CHINESE_SESSION_TITLE_CHAR_LIMIT: usize = 24;

pub(crate) fn is_session_description_request(system: &str) -> bool {
    system.contains("four words or less")
        || system.contains("4 words or less")
        || system.contains("简洁的中文")
        || system.contains("只输出标题")
}

// Only punctuation and whitespace provide reliable phrase boundaries here.
// Continuous Chinese is cleaned but not segmented.
fn normalize_chinese_session_description(description: &str) -> String {
    let has_chinese = description.chars().any(is_chinese_character);
    if !has_chinese {
        return description
            .split_whitespace()
            .take(4)
            .collect::<Vec<_>>()
            .join(" ");
    }

    let phrases: Vec<String> = description
        .split(|character: char| character.is_whitespace() || !character.is_alphanumeric())
        .filter_map(|part| {
            let phrase: String = part
                .chars()
                .filter(|&character| is_chinese_character(character))
                .collect();
            (!phrase.is_empty()).then_some(phrase)
        })
        .take(4)
        .collect();
    if phrases.len() > 1 {
        let mut remaining_characters = SEPARATED_CHINESE_SESSION_TITLE_CHAR_LIMIT;
        let mut bounded_phrases = Vec::new();
        for phrase in phrases {
            let phrase_length = phrase.chars().count();
            if phrase_length > remaining_characters {
                if bounded_phrases.is_empty() {
                    bounded_phrases.push(phrase);
                }
                break;
            }

            bounded_phrases.push(phrase);
            remaining_characters -= phrase_length;
            if remaining_characters == 0 {
                break;
            }
        }
        return bounded_phrases.join(" ");
    }

    phrases.into_iter().next().unwrap_or_default()
}

fn is_chinese_character(character: char) -> bool {
    ('\u{4e00}'..='\u{9fff}').contains(&character)
}

pub(crate) fn preserves_untruncated_chinese_title(title: &str) -> bool {
    static ALLOWED_TITLE_CHARACTERS: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^[\p{Han}\p{White_Space}\p{Punctuation}]+$").expect("valid title regex")
    });

    title.chars().any(is_chinese_character) && ALLOWED_TITLE_CHARACTERS.is_match(title)
}

pub(crate) fn generate_simple_session_description(
    model_name: &str,
    messages: &[Message],
) -> Result<(Message, ProviderUsage), ProviderError> {
    let description = messages
        .iter()
        .find(|m| m.role == Role::User)
        .and_then(|m| {
            m.content.iter().find_map(|c| match c {
                MessageContent::Text(text_content) => Some(&text_content.text),
                _ => None,
            })
        })
        .map(|text| {
            // Strip the wrapper added by generate_session_name so we get
            // the actual user content. First strip the optional background context section.
            let text = text
                .rfind(SESSION_NAME_BEGIN_MARKER)
                .and_then(|idx| text.get(idx..))
                .unwrap_or(text);
            let stripped = text
                .strip_prefix(SESSION_NAME_BEGIN_MARKER)
                .unwrap_or(text)
                .trim_start_matches(['\n', '\r']);
            let full_suffix = format!("{}\n\n{}", SESSION_NAME_END_MARKER, SESSION_NAME_SUFFIX);
            let stripped = stripped
                .strip_suffix(&full_suffix)
                .or_else(|| stripped.strip_suffix(SESSION_NAME_END_MARKER))
                .unwrap_or(stripped)
                .trim();

            let preserve_full_title = preserves_untruncated_chinese_title(stripped);
            let truncate_mixed_title = !preserve_full_title
                && stripped.chars().count() > 100
                && stripped.chars().any(is_chinese_character);
            let desc = normalize_chinese_session_description(stripped);
            if desc.is_empty() {
                "Simple task".to_string()
            } else if preserve_full_title {
                desc
            } else if truncate_mixed_title {
                safe_truncate(stripped, 100)
            } else {
                safe_truncate(&desc, 100)
            }
        })
        .unwrap_or_else(|| "Simple task".to_string());

    tracing::debug!(
        description = %description,
        "Generated simple session description, skipped subprocess"
    );

    let message = Message::new(
        Role::Assistant,
        chrono::Utc::now().timestamp(),
        vec![MessageContent::text(description)],
    );

    Ok((
        message,
        ProviderUsage::new(model_name.to_string(), Usage::default()),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_chinese_session_description_prompt() {
        assert!(is_session_description_request(
            "请生成简洁的中文标题，只输出标题。"
        ));
    }

    #[test]
    fn local_session_description_is_a_short_chinese_title() {
        let message = Message::user().with_text(format!(
            "{SESSION_NAME_BEGIN_MARKER}\n请 帮我 整理 项目 计划\n{SESSION_NAME_END_MARKER}\n\n{SESSION_NAME_SUFFIX}"
        ));

        let (result, _) = generate_simple_session_description("test", &[message]).unwrap();
        let title = result
            .content
            .iter()
            .find_map(|content| match content {
                MessageContent::Text(text) => Some(text.text.as_str()),
                _ => None,
            })
            .unwrap();

        assert_eq!(title, "请 帮我 整理 项目");
        assert_eq!(title.split_whitespace().count(), 4);
    }

    #[test]
    fn local_session_description_preserves_an_unspaced_chinese_phrase() {
        let message = Message::user().with_text(format!(
            "{SESSION_NAME_BEGIN_MARKER}\n请帮我制定下半年市场推广计划！\n{SESSION_NAME_END_MARKER}\n\n{SESSION_NAME_SUFFIX}"
        ));

        let (result, _) = generate_simple_session_description("test", &[message]).unwrap();
        let title = result
            .content
            .iter()
            .find_map(|content| match content {
                MessageContent::Text(text) => Some(text.text.as_str()),
                _ => None,
            })
            .unwrap();

        assert_eq!(title, "请帮我制定下半年市场推广计划");
    }

    #[test]
    fn local_session_description_keeps_first_four_non_chinese_tokens() {
        assert_eq!(
            normalize_chinese_session_description("List files in current folder now"),
            "List files in current"
        );
    }

    #[test]
    fn local_session_description_prioritizes_chinese_in_mixed_input() {
        assert_eq!(
            normalize_chinese_session_description(
                "Please help me fix 登录问题 and review 云服务 behavior"
            ),
            "登录问题 云服务"
        );
    }

    #[test]
    fn local_session_description_preserves_a_complete_chinese_phrase() {
        assert_eq!(
            normalize_chinese_session_description("登录问题"),
            "登录问题"
        );
    }

    #[test]
    fn local_session_description_preserves_complete_separated_chinese_phrases() {
        assert_eq!(
            normalize_chinese_session_description("配置，云服务；登录问题。多云平台！额外短语"),
            "配置 云服务 登录问题 多云平台"
        );
    }

    #[test]
    fn local_session_description_preserves_a_long_unseparated_chinese_phrase() {
        assert_eq!(
            normalize_chinese_session_description("一二三四五六七八九十一二三"),
            "一二三四五六七八九十一二三"
        );
    }

    #[test]
    fn local_session_description_preserves_over_100_continuous_chinese_characters() {
        let long_title = "这是一个用于验证本地命令行会话标题不会被机械截断的完整标题".repeat(5);
        assert!(long_title.chars().count() > 100);
        let message = Message::user().with_text(format!(
            "{SESSION_NAME_BEGIN_MARKER}\n{long_title}\n{SESSION_NAME_END_MARKER}\n\n{SESSION_NAME_SUFFIX}"
        ));

        let (result, _) = generate_simple_session_description("test", &[message]).unwrap();
        let title = result
            .content
            .iter()
            .find_map(|content| match content {
                MessageContent::Text(text) => Some(text.text.as_str()),
                _ => None,
            })
            .unwrap();

        assert_eq!(title, long_title);
    }

    #[test]
    fn local_session_description_truncates_over_100_mixed_language_characters() {
        let mixed_title = format!("{}中", "a".repeat(120));
        let message = Message::user().with_text(format!(
            "{SESSION_NAME_BEGIN_MARKER}\n{mixed_title}\n{SESSION_NAME_END_MARKER}\n\n{SESSION_NAME_SUFFIX}"
        ));

        let (result, _) = generate_simple_session_description("test", &[message]).unwrap();
        let title = result
            .content
            .iter()
            .find_map(|content| match content {
                MessageContent::Text(text) => Some(text.text.as_str()),
                _ => None,
            })
            .unwrap();

        assert_eq!(title, format!("{}...", "a".repeat(97)));
    }

    #[test]
    fn local_session_description_drops_a_phrase_that_does_not_fit() {
        assert_eq!(
            normalize_chinese_session_description(
                "这是一个已经占用大部分字符预算的完整标题短语，登录问题，云服务"
            ),
            "这是一个已经占用大部分字符预算的完整标题短语"
        );
    }

    #[test]
    fn local_session_description_keeps_the_first_complete_phrase_over_the_budget() {
        assert_eq!(
            normalize_chinese_session_description(
                "这是一个明显超过二十四字预算但仍然需要保持完整的中文标题短语，登录问题"
            ),
            "这是一个明显超过二十四字预算但仍然需要保持完整的中文标题短语"
        );
    }

    #[test]
    fn local_session_description_preserves_whitespace_separated_chinese_phrases() {
        assert_eq!(
            normalize_chinese_session_description("配置 云服务 登录问题 多云平台 额外短语"),
            "配置 云服务 登录问题 多云平台"
        );
    }

    #[test]
    fn local_session_description_preserves_chinese_after_english_tokens() {
        assert_eq!(
            normalize_chinese_session_description(
                "Please help me review the design before 修复会话标题生成过程 with 长段落内容需要截断"
            ),
            "修复会话标题生成过程 长段落内容需要截断"
        );
    }
}
