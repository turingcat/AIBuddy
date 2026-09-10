# Task 8 验证与 macOS 打包报告

## 状态

完成。任务要求的默认 feature 与 `code-mode` prompt 命令均通过；既有 `navigation.itemApps` zh-CN extra key 按任务简报只记录。feature-specific snapshots 已逐项审阅，不含本机路径或临时环境输出。未修改 `Justfile` 或 `ui/desktop/src/api`，未合并、未推送。

功能与构建修复提交：`9ba81dd49431a7f83d97dde4aa60b698d9f18c89`（`fix(build): unblock macOS 27 verification`）。

## RED 与根因

初始 RED 命令：

```bash
source bin/activate-hermit && cargo test -p heybuddy prompt_manager
```

退出 101。`sqlx_macros` host-side proc-macro dylib 被 dyld 拒绝，错误为 `mis-aligned LINKEDIT string pool`。Homebrew rustc 1.97.1、项目锁定 rustc 1.96.1 和全新 target 均可稳定复现；异常 dylib 的 `LC_SYMTAB.stroff` 为 `4 mod 8`。

根因是现有 `[profile.dev.package."*"] debug = false` 对依赖发出 `-C strip=debuginfo`，触发 macOS 27 / Command Line Tools ld-27037.1 的 strip 回归。Cargo profile 优先级使 package wildcard 覆盖 `build-override`，因此仅设置 dev build override 不能保护依赖中的 proc-macro。`-ld_classic` 被当前 linker 明确忽略；检查 aaif-heybuddy/main 和相关 issue 未发现可拉取的上游修复。

## 修改

- `Cargo.toml`：在 `[profile.dev.package."*"]` 添加 `strip = "none"`，覆盖 dev 依赖的破坏性 `strip=debuginfo`；在 `[profile.release.build-override]` 添加 `strip = "none"`，只保护 release 的 host-side proc-macro/build-script，保持目标 release 二进制策略不变。注释只解释 macOS 27 原因和 Cargo 优先级。
- `crates/heybuddy/src/session/session_naming.rs`：用 `Ok(render_template(...)?)` 恢复模板错误到 `anyhow::Result` 的转换，修复当前分支真实编译错误。
- Rust 1.96/1.97 clippy：逐项移除 6 处 needless borrow、将手写中文字符范围比较改为 `RangeInclusive::contains`、简化 1 处无用结构体字段匹配。涉及 `print_recipe.rs`、CLI session、MCP record、`tetrate_auth.rs`、code execution、`cli_common.rs`、ACP common tests 和 MCP integration test。未运行 `cargo clippy --fix`，未做依赖升级或无关重构。
- `test_all_platform_extensions`：按编译 feature 显式选择 `all_platform_extensions_default` 或 `all_platform_extensions_code_mode` snapshot，并断言 HeyBuddy、默认中文以及 `code_execution` 的 feature-specific 存在性。原 snapshot 原字节重命名为 code-mode snapshot；default 候选经完整 diff 确认只缺少 `code_execution` block，并移除 Insta pending 的行号元数据后纳入。没有盲目接受自动 snapshot。
- 本地签名：未修改 Forge 源配置。无 `APPLE_TEAM_ID` 的本地 package 会保留被 HeyBuddy plist 改写后失效的 Electron ad-hoc 签名；对生成的 app 执行一次 ad-hoc 深度重签，之后严格验证通过，包内 HeyBuddy 哈希未变化。

## 验证结果

所有 UI 命令均使用 Node `v24.19.0` 和 `CI=true`。所有 Rust 命令均使用 Hermit 锁定的 rustc `1.96.1`。

| 命令 | 退出结果 | 结果摘要 |
| --- | ---: | --- |
| `cargo fmt --all -- --check` | 0 | 格式通过 |
| `git diff --check` | 0 | 无 whitespace 错误 |
| `cd ui && pnpm --filter heybuddy-app typecheck` | 0 | `tsc --noEmit` 通过 |
| `cd ui && pnpm --filter heybuddy-app test:run` | 0 | 91 files、728 tests 全部通过，0 failed |
| `cd ui/desktop && pnpm run i18n:check` | 1 | 仅既有 extra key `navigation.itemApps`，按简报只记录 |
| `cargo test -p heybuddy prompt_manager` | 0 | default feature，15 passed、0 failed；使用 default-specific snapshot |
| `cargo test -p heybuddy --features code-mode prompt_manager` | 0 | 15 passed、0 failed；使用 code-mode-specific snapshot |
| `cargo test -p heybuddy session_naming` | 0 | 3 passed、0 failed |
| `cargo clippy --all-targets -- -D warnings` | 0 | all targets 通过，无 warning，无 `--fix` |
| `just release-binary` | 0 | release profile 完成；从当前 HEAD 构建并安全准备 `src/bin/heybuddy`，12m02s |
| `HEYBUDDY_AUTH_API_BASE_URL=https://ai.linyeyun.cn pnpm run package` | 0 | Electron Forge arm64 package 完成 |
| 初次 `codesign --verify --deep --strict HeyBuddy.app` | 1 | 定位到本地未重签造成的 `invalid Info.plist`，plist 本身 `plutil -lint` 通过 |
| `codesign --force --deep --sign - HeyBuddy.app` | 0 | 对生成产物执行本地 ad-hoc 重签 |
| 最终 `codesign --verify --deep --strict --verbose=2 HeyBuddy.app` | 0 | app valid on disk，满足 designated requirement |
| 禁改路径与快照 diff 检查 | 0 | `Justfile`、`ui/desktop/src/api` 无差异；仅有预期 feature-specific snapshots，`.snap.new` 不存在 |

首次从仓库根目录执行 UI filter 命令因根目录没有 `package.json` 退出 1；确认 workspace 根为 `ui/` 后按上表重跑通过。沙箱内首次激活 Hermit 因用户缓存权限打印错误；授权读取 Hermit 缓存后所有最终 Rust 命令按项目锁定工具链重跑。

## 包与内容校验

包路径：

```text
/Users/turingcat/Project/HeyBuddy/.worktrees/heybuddy-chinese-ui/ui/desktop/out/HeyBuddy-darwin-arm64/HeyBuddy.app
```

release/package 的 production source 构建提交为 `9ba81dd49431a7f83d97dde4aa60b698d9f18c89`。`target/release/heybuddy`、`ui/desktop/src/bin/heybuddy` 和包内 `Contents/Resources/bin/heybuddy` 均为 arm64 Mach-O，大小 `267083264` bytes，SHA-256 完全一致：

```text
e3f158755266877ff098784c7fa75def8f4cd2e2b184c5746904008fb9a2cfd2
```

包内 HeyBuddy 的二进制扫描分别命中：

```text
HeyBuddy
默认使用中文
简洁的中文
```

生产认证 URL `https://ai.linyeyun.cn` 同时在 `ui/desktop/.vite/build/main.js` 和包内 `Contents/Resources/app.asar` 命中。`authConfig.test.ts` 覆盖显式 `HEYBUDDY_AUTH_API_BASE_URL` 值及 fallback，完整 UI suite 已执行该测试。

## 仓库状态与提交

初次写报告前 `git status --short --branch` 仅输出分支头 `## feat/heybuddy-chinese-ui`，tracked worktree clean；`ui/desktop/src/bin/heybuddy` 和 `ui/desktop/out/` 均按现有 `.gitignore` 忽略。Task 8 功能/构建修复为 `9ba81dd49431a7f83d97dde4aa60b698d9f18c89`，初次报告提交为 `8507a24c4d8ef29ce88aadb2147fe75f64ad795c`。review fix round 1 的最终提交哈希在交付回复和分支日志中记录。

## 残余担忧

- `navigation.itemApps` 是既有 zh-CN extra key，导致 `i18n:check` 退出 1；简报明确只记录，不做无关修改。
- 产物仅为本机 ad-hoc 签名，没有 Developer ID 签名或 notarization。发布给其他用户前仍需在有 `APPLE_TEAM_ID` 和 Apple 凭据的正式流水线完成发布签名与公证。
- Cargo strip workaround 针对 macOS 27 / ld-27037.1，应在 Apple linker 或 Rust/Cargo 上游明确修复后重新评估并移除，避免永久保留环境 workaround。

## Review fix round 1/5

### RED

review 前的 required default-feature command：

```bash
source bin/activate-hermit && cargo test -p heybuddy prompt_manager
```

退出 101：14 passed、1 failed。`test_all_platform_extensions` 固定读取包含 `## code_execution` 的单一 snapshot，但 `PLATFORM_EXTENSIONS` 只在 `code-mode` feature 启用时注册该 extension。该差异由编译 feature 决定，与本机扩展可用性无关。

测试改为 feature-specific snapshot 名后，首次 default RED 仍退出 101（14 passed、1 failed），只因为新的 default snapshot 尚未纳入。生成候选与原 code-mode snapshot 的完整 diff 只有 `code_execution` block；候选不含 `/Users`、`/private`、临时目录或 session 值。候选的 Insta pending 元数据 `assertion_line: 605` 被明确移除，未运行 snapshot auto-accept。

### GREEN

```text
cargo test -p heybuddy prompt_manager
exit 0; 15 passed, 0 failed

cargo test -p heybuddy --features code-mode prompt_manager
exit 0; 15 passed, 0 failed

cargo test -p heybuddy session_naming
exit 0; 3 passed, 0 failed

cargo clippy --all-targets -- -D warnings
exit 0

cargo fmt --all -- --check
exit 0

git diff --check
exit 0
```

code-mode snapshot 的 SHA-256 与 review 前原 snapshot 完全相同：`3c6615caf1627dbf3ca04016a01d4c30ca300b8530ab4d7a7eda81947dae5b8c`。两份 snapshots 的正文 diff 严格只有 `code_execution` block。

本轮源码改动全部位于 `prompt_manager.rs` 的 `#[cfg(test)]` 模块，另有测试 snapshots，不进入 production release 编译，因此没有进行无意义的完整 release/package 重建。已有包重新执行内容与签名校验：三份 HeyBuddy SHA-256 仍同为 `e3f158755266877ff098784c7fa75def8f4cd2e2b184c5746904008fb9a2cfd2`，`.vite/build/main.js` 与包内 `app.asar` 均命中 `https://ai.linyeyun.cn`，包内 HeyBuddy 命中 `HeyBuddy`、`默认使用中文`、`简洁的中文`，`codesign --verify --deep --strict --verbose=2` 退出 0。
