use indoc::indoc;
use rmcp::model::{Tool, ToolAnnotations};
use rmcp::object;
pub const MANAGE_SCHEDULE_TOOL_NAME: &str = "manage_schedule";

pub fn manage_schedule_tool() -> Tool {
    Tool::new(
        MANAGE_SCHEDULE_TOOL_NAME.to_string(),
        indoc! {r#"
            Manage heybuddy's internal scheduled recipe execution.

            Actions:
            - "list": List all heybuddy scheduled jobs
            - "create": Create a new heybuddy scheduled job from a recipe file
            - "run_now": Execute a heybuddy scheduled job immediately
            - "pause": Pause a heybuddy scheduled job
            - "unpause": Resume a paused heybuddy scheduled job
            - "delete": Remove a heybuddy scheduled job
            - "kill": Terminate a currently running heybuddy scheduled job
            - "inspect": Get details about a running heybuddy scheduled job
            - "sessions": List execution history for a heybuddy scheduled job
            - "session_content": Get the full content (messages) of a specific session
        "#}
        .to_string(),
        object!({
            "type": "object",
            "required": ["action"],
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "create", "run_now", "pause", "unpause", "delete", "kill", "inspect", "sessions", "session_content"]
                },
                "job_id": {"type": "string", "description": "Job identifier for operations on existing jobs"},
                "recipe_path": {"type": "string", "description": "Path to recipe file for create action"},
                "cron_expression": {"type": "string", "description": "A cron expression for create action. Supports both 5-field (minute hour day month weekday) and 6-field (second minute hour day month weekday) formats. 5-field expressions are automatically converted to 6-field by prepending '0' for seconds."},
                "limit": {"type": "integer", "description": "Limit for sessions list", "default": 50},
                "session_id": {"type": "string", "description": "Session identifier for session_content action"}
            }
        }),
    ).annotate(ToolAnnotations::with_title("Manage scheduled recipes".to_string()).read_only(false).destructive(true).idempotent(false).open_world(false))
}
