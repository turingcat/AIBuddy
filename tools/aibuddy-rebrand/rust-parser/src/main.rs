use std::io::{self, Read};

use proc_macro2::{LineColumn, Span, TokenStream, TokenTree};
use rustc_lexer::{tokenize, TokenKind as LexerTokenKind};
use serde::Serialize;
use syn::{parse_file, spanned::Spanned, visit, visit::Visit, Member, Pat};

#[derive(Serialize)]
struct Response {
    ok: bool,
    tokens: Vec<Token>,
    comments: Vec<Token>,
    macros: Vec<MacroToken>,
    errors: Vec<Diagnostic>,
}

#[derive(Serialize)]
struct Token {
    kind: &'static str,
    start: usize,
    end: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    key: Option<String>,
}

#[derive(Serialize)]
struct MacroToken {
    start: usize,
    end: usize,
}

#[derive(Serialize)]
struct Diagnostic {
    start: Option<usize>,
    end: Option<usize>,
    message: String,
}

#[derive(Clone, Copy)]
struct PositionedToken {
    kind: TokenKind,
    start: usize,
    end: usize,
    is_macro_rules: bool,
}

#[derive(Clone)]
struct LiteralKeySpan {
    start: usize,
    end: usize,
    key: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum TokenKind {
    Identifier,
    Literal,
    Punctuation(char),
    Boundary,
}

fn main() {
    let mut source = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut source) {
        print_response(Response {
            ok: false,
            tokens: Vec::new(),
            comments: Vec::new(),
            macros: Vec::new(),
            errors: vec![Diagnostic {
                start: None,
                end: None,
                message: format!("could not read Rust source: {error}"),
            }],
        });
        return;
    }

    print_response(parse_source(&source));
}

fn parse_source(source: &str) -> Response {
    let line_starts = line_starts(source);
    let file = match parse_file(source) {
        Ok(file) => file,
        Err(error) => {
            return Response {
                ok: false,
                tokens: Vec::new(),
                comments: Vec::new(),
                macros: Vec::new(),
                errors: vec![diagnostic(
                    &error.to_string(),
                    error.span(),
                    source,
                    &line_starts,
                )],
            };
        }
    };
    let token_source = mask_shebang(source);
    let stream = match token_source.parse::<TokenStream>() {
        Ok(stream) => stream,
        Err(error) => {
            return Response {
                ok: false,
                tokens: Vec::new(),
                comments: Vec::new(),
                macros: Vec::new(),
                errors: vec![Diagnostic {
                    start: None,
                    end: None,
                    message: format!("could not tokenize parsed Rust source: {error}"),
                }],
            };
        }
    };

    let mut tokens = Vec::new();
    let comments = collect_comments(source);
    let mut macro_tokens = Vec::new();
    let literal_keys = collect_literal_keys(&file, source, &line_starts);
    collect_stream(
        stream,
        source,
        &line_starts,
        &literal_keys,
        &mut tokens,
        &mut macro_tokens,
    );
    tokens.sort_by_key(|token: &Token| (token.start, token.end));
    macro_tokens.sort_by_key(|token| (token.start, token.end));

    Response {
        ok: true,
        tokens,
        comments,
        macros: macro_tokens,
        errors: Vec::new(),
    }
}

fn collect_stream(
    stream: TokenStream,
    source: &str,
    line_starts: &[usize],
    literal_keys: &[LiteralKeySpan],
    tokens: &mut Vec<Token>,
    macro_tokens: &mut Vec<MacroToken>,
) {
    let mut positioned = Vec::new();
    for token in stream {
        match token {
            TokenTree::Ident(identifier) => {
                let (start, end) = span_range(identifier.span(), source, line_starts);
                positioned.push(PositionedToken {
                    kind: TokenKind::Identifier,
                    start,
                    end,
                    is_macro_rules: identifier == "macro_rules",
                });
                tokens.push(Token {
                    kind: "identifier",
                    start,
                    end,
                    key: None,
                });
            }
            TokenTree::Literal(literal) => {
                let (start, end) = span_range(literal.span(), source, line_starts);
                positioned.push(PositionedToken {
                    kind: TokenKind::Literal,
                    start,
                    end,
                    is_macro_rules: false,
                });
                tokens.push(Token {
                    kind: "literal",
                    start,
                    end,
                    key: literal_key_for_span(literal_keys, start, end),
                });
            }
            TokenTree::Punct(punctuation) => {
                let (start, end) = span_range(punctuation.span(), source, line_starts);
                positioned.push(PositionedToken {
                    kind: TokenKind::Punctuation(punctuation.as_char()),
                    start,
                    end,
                    is_macro_rules: false,
                });
            }
            TokenTree::Group(group) => {
                positioned.push(PositionedToken {
                    kind: TokenKind::Boundary,
                    start: 0,
                    end: 0,
                    is_macro_rules: false,
                });
                collect_stream(
                    group.stream(),
                    source,
                    line_starts,
                    literal_keys,
                    tokens,
                    macro_tokens,
                );
                positioned.push(PositionedToken {
                    kind: TokenKind::Boundary,
                    start: 0,
                    end: 0,
                    is_macro_rules: false,
                });
            }
        }
    }

    for index in 0..positioned.len() {
        if positioned[index].kind != TokenKind::Punctuation('!') {
            continue;
        }

        let previous = positioned.get(index.wrapping_sub(1));
        let next = positioned.get(index + 1);
        let macro_name = if previous.is_some_and(|token| token.is_macro_rules)
            && next.map(|token| token.kind) == Some(TokenKind::Identifier)
        {
            next
        } else if previous.map(|token| token.kind) == Some(TokenKind::Identifier) {
            previous
        } else {
            None
        };

        if let Some(macro_name) = macro_name {
            macro_tokens.push(MacroToken {
                start: macro_name.start,
                end: macro_name.end,
            });
        }
    }
}

fn collect_comments(source: &str) -> Vec<Token> {
    let mut comments = Vec::new();
    let mut start = 0;
    for token in tokenize(source) {
        let end = start + token.len;
        if matches!(
            token.kind,
            LexerTokenKind::LineComment | LexerTokenKind::BlockComment { .. }
        ) {
            comments.push(Token {
                kind: "comment",
                start,
                end,
                key: None,
            });
        }
        start = end;
    }
    comments
}

fn line_starts(source: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (offset, byte) in source.as_bytes().iter().enumerate() {
        if *byte == b'\n' {
            starts.push(offset + 1);
        }
    }
    starts
}

fn span_range(span: Span, source: &str, line_starts: &[usize]) -> (usize, usize) {
    (
        line_column_offset(span.start(), source, line_starts),
        line_column_offset(span.end(), source, line_starts),
    )
}

fn line_column_offset(position: LineColumn, source: &str, line_starts: &[usize]) -> usize {
    let line_start = line_starts
        .get(position.line.saturating_sub(1))
        .copied()
        .unwrap_or_default();
    let line_end = source[line_start..]
        .find('\n')
        .map(|offset| line_start + offset)
        .unwrap_or(source.len());
    line_start
        + source[line_start..line_end]
            .chars()
            .take(position.column)
            .map(char::len_utf8)
            .sum::<usize>()
}

fn collect_literal_keys(
    file: &syn::File,
    source: &str,
    line_starts: &[usize],
) -> Vec<LiteralKeySpan> {
    let mut visitor = RuntimeKeyVisitor {
        source,
        line_starts,
        literal_keys: Vec::new(),
    };
    visitor.visit_file(file);
    visitor.literal_keys
}

struct RuntimeKeyVisitor<'a> {
    source: &'a str,
    line_starts: &'a [usize],
    literal_keys: Vec<LiteralKeySpan>,
}

impl<'ast> Visit<'ast> for RuntimeKeyVisitor<'_> {
    fn visit_field_value(&mut self, field: &'ast syn::FieldValue) {
        if let Member::Named(member) = &field.member {
            self.collect_expr_key_range(&field.expr, member.to_string());
        }
        visit::visit_field_value(self, field);
    }

    fn visit_local(&mut self, local: &'ast syn::Local) {
        if let Some(key) = pattern_binding_key(&local.pat) {
            if let Some(init) = &local.init {
                self.collect_expr_key_range(&init.expr, key);
            }
        }
        visit::visit_local(self, local);
    }

    fn visit_item_const(&mut self, item: &'ast syn::ItemConst) {
        self.collect_expr_key_range(&item.expr, item.ident.to_string());
        visit::visit_item_const(self, item);
    }

    fn visit_item_static(&mut self, item: &'ast syn::ItemStatic) {
        self.collect_expr_key_range(&item.expr, item.ident.to_string());
        visit::visit_item_static(self, item);
    }
}

impl RuntimeKeyVisitor<'_> {
    fn collect_expr_key_range(&mut self, expr: &syn::Expr, key: String) {
        let (start, end) = span_range(expr.span(), self.source, self.line_starts);
        self.literal_keys.push(LiteralKeySpan { start, end, key });
    }
}

fn pattern_binding_key(pattern: &Pat) -> Option<String> {
    match pattern {
        Pat::Ident(pattern) => Some(pattern.ident.to_string()),
        Pat::Type(pattern) => pattern_binding_key(&pattern.pat),
        _ => None,
    }
}

fn literal_key_for_span(keys: &[LiteralKeySpan], start: usize, end: usize) -> Option<String> {
    keys.iter()
        .rev()
        .filter(|key| key.start <= start && key.end >= end)
        .min_by_key(|key| key.end - key.start)
        .map(|key| key.key.clone())
}

fn diagnostic(message: &str, span: Span, source: &str, line_starts: &[usize]) -> Diagnostic {
    let (start, end) = span_range(span, source, line_starts);
    Diagnostic {
        start: Some(start),
        end: Some(end),
        message: message.to_owned(),
    }
}

fn mask_shebang(source: &str) -> String {
    let Some(first_line_end) = source.find('\n') else {
        return source.to_owned();
    };
    let first_line = &source[..first_line_end];
    if !first_line.starts_with("#!") || first_line.starts_with("#![") {
        return source.to_owned();
    }

    let mut bytes = source.as_bytes().to_vec();
    for byte in &mut bytes[..first_line_end] {
        if *byte != b'\r' {
            *byte = b' ';
        }
    }
    String::from_utf8(bytes).expect("shebang masking preserves UTF-8")
}

fn print_response(response: Response) {
    println!("{}", response_json(&response));
}

fn response_json(response: &Response) -> String {
    serde_json::to_string(response).expect("Rust parser response must serialize")
}

#[cfg(test)]
mod tests {
    use super::{parse_source, response_json};

    #[test]
    fn rejects_invalid_rust_with_structured_diagnostics() {
        let response = parse_source("fn broken( { let goose = \"Goose\"; }\n");

        assert!(!response.ok);
        assert_eq!(response.tokens.len(), 0);
        assert_eq!(response.comments.len(), 0);
        assert!(!response.errors.is_empty());

        let json: serde_json::Value = serde_json::from_str(&response_json(&response)).unwrap();
        assert_eq!(json["ok"], false);
        assert!(json["errors"][0]["message"].is_string());
    }

    #[test]
    fn reports_unicode_raw_string_comment_and_macro_spans_in_source_bytes() {
        let source = concat!(
            "macro_rules! GeeseFactory { ($value:expr) => { $value }; }\n",
            "fn main() {\n",
            "    let _greeting = \"中文\";\n",
            "    let _raw = r###\"Goose\"###;\n",
            "    GeeseFactory!(\"Goose\");\n",
            "}\n",
            "// Geese comment\n",
        );
        let response = parse_source(source);

        assert!(response.ok);
        let unicode_start = source.find("\"中文\"").unwrap();
        let raw_start = source.find("r###\"Goose\"###").unwrap();
        let comment_start = source.find("// Geese comment").unwrap();
        assert!(response.tokens.iter().any(|token| {
            token.kind == "literal"
                && token.start == unicode_start
                && token.end == unicode_start + "\"中文\"".len()
        }));
        assert!(response.tokens.iter().any(|token| {
            token.kind == "literal"
                && token.start == raw_start
                && token.end == raw_start + "r###\"Goose\"###".len()
        }));
        assert!(response.comments.iter().any(|comment| {
            comment.start == comment_start
                && comment.end == comment_start + "// Geese comment".len()
        }));
        assert_eq!(response.macros.len(), 2);
        assert!(response.macros.iter().any(|macro_span| {
            macro_span.start == source.find("GeeseFactory").unwrap()
                && macro_span.end == source.find("GeeseFactory").unwrap() + "GeeseFactory".len()
        }));
    }

    #[test]
    fn serializes_success_response_as_structured_json() {
        let response = parse_source("fn main() { let app_name = r###\"Goose\"###; }\n");
        let json: serde_json::Value = serde_json::from_str(&response_json(&response)).unwrap();

        assert_eq!(json["ok"], true);
        assert!(json["tokens"].is_array());
        assert!(json["tokens"]
            .as_array()
            .unwrap()
            .iter()
            .any(|token| token["kind"] == "literal" && token["key"] == "app_name"));
        assert!(json["comments"].is_array());
        assert!(json["macros"].is_array());
        assert!(json["errors"].is_array());
        assert_eq!(json["errors"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn annotates_multiline_runtime_keys_for_fields_locals_and_constants() {
        let source = concat!(
            "const KEYRING_SERVICE: &str =\n",
            "    \"goose\";\n",
            "fn choose() {\n",
            "    let args = AppStrategyArgs {\n",
            "        app_name:\n",
            "            \"goose\".to_string(),\n",
            "        display_name:\n",
            "            \"goose\".to_string(),\n",
            "    };\n",
            "    let app_name =\n",
            "        \"goose\".to_string();\n",
            "    let name =\n",
            "        \"goose\".to_string();\n",
            "    let _ = (args, app_name, name, KEYRING_SERVICE);\n",
            "}\n",
        );
        let response = parse_source(source);

        assert!(response.ok);
        let keys = source
            .match_indices("\"goose\"")
            .map(|(start, _)| {
                response
                    .tokens
                    .iter()
                    .find(|token| token.kind == "literal" && token.start == start)
                    .and_then(|token| token.key.as_deref())
            })
            .collect::<Vec<_>>();
        assert_eq!(
            keys,
            vec![
                Some("KEYRING_SERVICE"),
                Some("app_name"),
                Some("display_name"),
                Some("app_name"),
                Some("name"),
            ]
        );
    }
}
