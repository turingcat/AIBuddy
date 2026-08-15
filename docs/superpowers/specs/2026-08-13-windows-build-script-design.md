# Windows 桌面一键构建脚本设计

- 日期：2026-08-13
- 作者：logic
- 状态：已批准（待实现）

## 1. 背景与目标

项目在 `.github/workflows/bundle-windows.yml` 中定义了 Windows 桌面应用的 CI 构建流程，
但本地开发者缺少一个等价的、可直接执行的脚本。本设计的目标是：

> 在项目根目录提供一个 PowerShell 脚本，执行后即可一键构建出可运行的 Windows 桌面应用，
> 行为对齐 CI 的 `standard` 变体（不含代码签名）。

## 2. 范围

### 2.1 纳入范围

- 根目录脚本 `build-windows.ps1`（单一 PowerShell 脚本，无 .bat 包装）。
- 工具链检测与自动补齐（pnpm 自动，rust/node 仅提示）。
- 完整构建链：Rust 后端编译 → 桌面 UI 打包 → dist-windows 整理 → 最终 zip。
- 产出物：`ui/desktop/dist-windows/` 与项目根 `HeyBuddy-win32-x64.zip`。

### 2.2 不纳入范围（YAGNI）

- cuda 变体（GPU 构建）。
- Azure Trusted Signing 代码签名（需云凭据）。
- 版本号 bump、npm/GitHub 发布。
- macOS / Linux 构建。
- `.bat` 双击入口（用户选择仅 .ps1）。
- rustup / Node 的全自动安装（仅检测并提示）。

## 3. CI 流程摘要（脚本复刻的依据）

来源：`.github/workflows/bundle-windows.yml`，`standard` 变体，无签名。

1. `rustup target add x86_64-pc-windows-msvc`
2. `cargo build --release --target x86_64-pc-windows-msvc -p goose-cli --bin goose`
   - 产物：`target/x86_64-pc-windows-msvc/release/goose.exe`
3. 将 `goose.exe` 放入 `ui/desktop/src/bin/`；platform 脚本与 uv 由
   `ui/desktop/scripts/prepare-platform-binaries.js` 负责（下载 pinned uv 0.11.11、复制 .cmd）。
4. `cd ui/desktop`：
   - `pnpm install`（CI 用 `--frozen-lockfile`，本地见权衡）
   - `node scripts/build-main.js`
   - `ELECTRON_PLATFORM=win32 node scripts/prepare-platform-binaries.js`
   - `pnpm run make -- --platform=win32 --arch=x64`
5. 整理 `ui/desktop/out/HeyBuddy-win32-x64/` → `ui/desktop/dist-windows/`
   （拷贝 `src/bin/*` 到 `out/HeyBuddy-win32-x64/resources/bin/`）。
6. 打包为 `HeyBuddy-win32-x64.zip`。

### 3.1 关键观察

- **CI 在 Windows runner 上不使用 hermit**：直接 `setup-node@24.10.0` +
  `npm i -g pnpm@10.30.3` + `rustup`。`bin/activate-hermit` 是 bash `source` 脚本，
  无法在 PowerShell 中激活。因此本地脚本基于**系统级工具链**，而非 hermit。
- `Justfile` 中的 `make-ui-windows` 缺少 `build-main.js`、`pnpm install`、
  `dist-windows` 整理与 zip，不如 CI 完整，故不直接复用。

## 4. 详细设计

### 4.1 工具链检测与补齐

| 工具   | 要求             | 缺失时处理                                                              |
| ------ | ---------------- | ----------------------------------------------------------------------- |
| cargo  | 可用（含 rustup）| 报错退出，提示 `winget install Rustlang.Rustup` 或 https://rustup.rs    |
| node   | >= 24.10.0       | 报错退出，提示安装 Node 24.x                                            |
| pnpm   | 可用             | 自动补齐：`corepack prepare pnpm@10.30.3 --activate`，回退 `npm i -g pnpm@10.30.3` |

### 4.2 脚本执行流程

1. 切换工作目录到脚本所在的项目根目录；`$ErrorActionPreference = 'Stop'`。
2. 工具链检测与补齐（见 4.1）。
3. `rustup target add x86_64-pc-windows-msvc`。
4. `cargo build --release --target x86_64-pc-windows-msvc -p goose-cli --bin goose
   --no-default-features --features code-mode,tui,aws-providers,telemetry,nostr,otel,rustls-tls,system-keyring,update`
   （禁用 `local-inference`，跳过 llama.cpp 编译）；构建后校验 `goose.exe` 存在。
5. 复制 `goose.exe` 到 `ui/desktop/src/bin`（覆盖同名产物）；**不删除**该目录下 git 跟踪的源文件（`jbang`/`node`/`npx`/`uvx`/`node-setup-common.sh`）。
6. 进入 `ui/desktop`：
   - `pnpm install`
   - `node scripts/build-main.js`
   - `$env:ELECTRON_PLATFORM='win32'; node scripts/prepare-platform-binaries.js`
   - `pnpm run make -- --platform=win32 --arch=x64`
7. 整理 dist-windows：确保 `out/HeyBuddy-win32-x64/resources/bin` → 拷入 `src/bin/*`；
   建 `dist-windows/` 拷入 `out/HeyBuddy-win32-x64/*`。
8. 打包 zip：检测到 `7z` 则用之，否则 `Compress-Archive`；
   输出到项目根 `HeyBuddy-win32-x64.zip`。

### 4.3 关键决策与备选

- **`pnpm install` 不带 `--frozen-lockfile`**：本地 lock 漂移时 frozen 会直接失败，
  普通模式更宽容。CI 用 frozen 仅为可复现。
- **zip 工具**：优先 `7z`（快），回退内置 `Compress-Archive`（零依赖）。
- **platform 文件注入**：交给 `prepare-platform-binaries.js`，避免逻辑重复。
- **`git config ...insteadOf`（CI 的 HTTPS 强制）**：默认不执行（会改全局 git 配置），
  脚本内保留注释掉的版本，遇 git+ssh 报错时手动启用。
- **签名 / cuda**：均不实现。

### 4.4 脚本规范

- 顶部注释含 `@author: logic` 与 `@date:`（日期由 `date` 命令获取）。
- 全程中文注释与进度输出，不使用 emoji。
- 失败时打印清晰中文错误并返回非零退出码。
- **不删除** `ui/desktop/src/bin` 下 git 跟踪的源文件，仅覆盖写入 `goose.exe`；
  `dist-windows` 与 `HeyBuddy-win32-x64.zip` 为脚本生成的产物，构建前清理。
- 脚本须保存为 **UTF-8 with BOM**（PS 5.1 对无 BOM 文件按 GBK 解码，中文注释会乱码）。

## 5. 验证方式

- 在干净的 Windows 环境（已装 rust、node）执行 `.\build-windows.ps1`。
- 成功标志：`ui/desktop/dist-windows/HeyBuddy.exe` 可启动；
  `HeyBuddy-win32-x64.zip` 生成于项目根且可解压运行。
- 故障路径：分别缺 pnpm（应自动补齐）、缺 cargo（应清晰报错退出）验证提示文案。

## 6. 风险与备注

- 产物未签名，Windows SmartScreen 会拦截首次运行，属预期行为。
- `cargo build --release` 首次较慢（依赖编译量大），脚本会在该步骤前给出提示。
- 若用户用 SSH 方式克隆仓库且 npm 依赖含 git+ssh，`pnpm install` 可能失败，
  届时启用注释中的 git config HTTPS 段。
