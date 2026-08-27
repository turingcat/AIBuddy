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
const CHINESE_SESSION_TITLE_CHAR_LIMIT: usize = 12;
const CHINESE_TITLE_GROUP_SIZE: usize = 3;

pub(crate) fn is_session_description_request(system: &str) -> bool {
    system.contains("four words or less")
        || system.contains("4 words or less")
        || system.contains("简洁的中文")
        || system.contains("只输出标题")
}

// Chinese without separators is grouped into four fixed three-character phrases.
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
        return phrases.join(" ");
    }

    description
        .chars()
        .filter(|&character| is_chinese_character(character))
        .take(CHINESE_SESSION_TITLE_CHAR_LIMIT)
        .collect::<Vec<_>>()
        .chunks(CHINESE_TITLE_GROUP_SIZE)
        .map(String::from_iter)
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_chinese_character(character: char) -> bool {
    character >= '\u{4e00}' && character <= '\u{9fff}'
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

            let desc = normalize_chinese_session_description(stripped);
            if desc.is_empty() {
                "Simple task".to_string()
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
    fn local_session_description_handles_unspaced_punctuation_and_length() {
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

        assert_eq!(title, "请帮我 制定下 半年市 场推广");
        assert_eq!(title.split_whitespace().count(), 4);
        assert!(title
            .split_whitespace()
            .all(|phrase| phrase.chars().all(is_chinese_character)));
    }

    #[test]
    fn local_session_description_keeps_non_chinese_behavior_and_filters_mixed_input() {
        assert_eq!(
            normalize_chinese_session_description("List files now"),
            "List files now"
        );
        assert_eq!(
            normalize_chinese_session_description("Please help me fix 登录 failure"),
            "登录"
        );
    }

    #[test]
    fn local_session_description_keeps_four_chinese_phrases() {
        assert_eq!(
            normalize_chinese_session_description("配置，云服务；登录问题。多云平台"),
            "配置 云服务 登录问题 多云平台"
        );
        assert_eq!(
            normalize_chinese_session_description("一二三四五六七八九十一二三"),
            "一二三 四五六 七八九 十一二"
        );
    }
}
