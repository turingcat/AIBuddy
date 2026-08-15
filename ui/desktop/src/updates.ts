// 暂时禁用应用内更新功能：启动自动检测、设置页更新区块一并关闭。
// 更新源目前指向上游 aaif-goose/goose 而非 HeyBuddy 自有发布渠道，
// 后续需要时改回 true 即可整体恢复。
// @author logic
// @date 2026-08-14
export const UPDATES_ENABLED = false;
export const COST_TRACKING_ENABLED = true;
export const ANNOUNCEMENTS_ENABLED = false;
export const CONFIGURATION_ENABLED = true;
export const TELEMETRY_UI_ENABLED = true;
export const DICTATION_ALLOWED_PROVIDERS: string[] | null = null;
