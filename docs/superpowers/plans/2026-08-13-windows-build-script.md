# Windows 桌面一键构建脚本 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在项目根目录创建 `build-windows.ps1`，一键复刻 CI 的 Windows 桌面 `standard` 构建（无签名），产出 `ui/desktop/dist-windows/` 与 `HeyBuddy-win32-x64.zip`。

**Architecture:** 单文件 PowerShell 脚本，内部分阶段函数（工具链检测 → Rust 构建 → 桌面打包 → 分发整理），主流程串行调用并以 `$ErrorActionPreference='Stop'` + 手动 `$LASTEXITCODE` 检查保障原生命令失败即终止。

**Tech Stack:** PowerShell 5.1（Windows 自带）、cargo/rustup、Node 24.10.0、pnpm 10.30.3、electron-forge。

## Global Constraints

- 脚本路径：项目根 `C:\zb\HeyBuddy\build-windows.ps1`。
- PowerShell 5.1 兼容（不使用 `??`、`?.`、三元等 PS6+ 语法）。
- 工具版本基线：`node >= 24.10.0`、`pnpm 10.30.3`、Rust target `x86_64-pc-windows-msvc`。
- 顶部注释含 `@author: logic` 与 `@date: 2026-08-13`（日期已由 `date` 命令获取）。
- 全程中文注释与进度输出，**禁止 emoji**。
- **不删除** `ui/desktop/src/bin` 下 git 跟踪的源文件（jbang/node/npx/uvx 等），仅覆盖写入 `goose.exe`；`dist-windows` 与 zip 为脚本产物，构建前清理。
- 脚本文件须保存为 **UTF-8 with BOM**（PowerShell 5.1 对无 BOM 的 .ps1 按 GBK 解码，中文注释会乱码并导致解析失败）。
- **测试策略**：编排脚本的正确性以端到端运行验证为准；不引入 Pester 单元测试框架（项目无既有 PS 测试设施，引入属过度工程）。每个任务用 PowerShell 语法解析做静态校验。
- **Git**：遵循用户全局规则，**不主动 commit**；计划中的 commit 步骤仅在获得用户明确授权后执行。

---

## File Structure

仅创建一个新文件，无既有文件修改：

- Create: `build-windows.ps1` — 项目根。内含辅助函数与阶段函数，全部集中在该文件。
  - 辅助：`Write-Step`、`Test-CommandAvailable`、`Compare-NodeVersion`
  - 阶段：`Assert-Toolchain`、`Build-GooseBinary`、`Build-DesktopApp`、`Package-Distribution`
  - 主流程：`try/catch` 串行调用

> 单文件的原因：这是构建编排脚本，各阶段共享同一组路径与状态变量，拆分会引入不必要的跨文件耦合。文件预计 ~150 行，远低于"应拆分"的阈值。

---

## Task 1: 脚本骨架与辅助函数

**Files:**
- Create: `build-windows.ps1`

**Interfaces:**
- Produces: `Write-Step`、`Test-CommandAvailable`、`Compare-NodeVersion`，后续任务复用。

- [ ] **Step 1: 创建脚本骨架与辅助函数**

将以下完整内容写入 `build-windows.ps1`：

```powershell
<#
    @author: logic
    @date: 2026-08-13
    Windows 桌面一键构建脚本
    复刻 .github/workflows/bundle-windows.yml 的 standard 变体（不含代码签名）
    产物：ui/desktop/dist-windows/ 与项目根 HeyBuddy-win32-x64.zip
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# 切换到项目根目录（脚本所在目录）
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

# 打印分阶段进度
function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "====> $Message" -ForegroundColor Cyan
}

# 判断命令是否可用
function Test-CommandAvailable {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# 比较 node 版本是否 >= 最低要求，忽略预发布后缀
function Compare-NodeVersion {
    param([string]$Current, [string]$Minimum)
    $cur = [version]::new(($Current -split '-')[0])
    $min = [version]::new($Minimum)
    return $cur -ge $min
}
```

- [ ] **Step 2: 语法校验**

Run:
```powershell
$null = [System.Management.Automation.Language.Parser]::ParseFile("$PWD\build-windows.ps1", [ref]$null, [ref]$errs); $errs.Count
```
Expected: 输出 `0`（无语法错误）。

---

## Task 2: 工具链检测与补齐

**Files:**
- Modify: `build-windows.ps1`（在 Task 1 内容末尾追加）

**Interfaces:**
- Consumes: `Test-CommandAvailable`、`Compare-NodeVersion`
- Produces: `Assert-Toolchain`

- [ ] **Step 1: 追加工具链检测函数**

在 `build-windows.ps1` 末尾追加：

```powershell
# 检查并补齐构建工具链：cargo/node 仅提示，pnpm 自动安装
function Assert-Toolchain {
    Write-Step "检查构建工具链"

    if (-not (Test-CommandAvailable 'cargo')) {
        throw "未找到 cargo/rustup。请先安装 Rust 工具链：winget install Rustlang.Rustup 或访问 https://rustup.rs"
    }

    if (-not (Test-CommandAvailable 'node')) {
        throw "未找到 node。请安装 Node.js 24.x 后重试。"
    }
    $nodeVer = (& node --version) -replace '^v', ''
    if (-not (Compare-NodeVersion -Current $nodeVer -Minimum '24.10.0')) {
        throw "node 版本过低：$nodeVer，需要 >= 24.10.0。"
    }

    if (-not (Test-CommandAvailable 'pnpm')) {
        Write-Step "未找到 pnpm，自动安装 pnpm@10.30.3"
        if (Test-CommandAvailable 'corepack') {
            & corepack prepare pnpm@10.30.3 --activate
        } else {
            & npm install -g pnpm@10.30.3
        }
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm 自动安装失败。请手动执行：npm install -g pnpm@10.30.3"
        }
    }
}
```

- [ ] **Step 2: 语法校验**

Run:
```powershell
$null = [System.Management.Automation.Language.Parser]::ParseFile("$PWD\build-windows.ps1", [ref]$null, [ref]$errs); $errs.Count
```
Expected: `0`。

---

## Task 3: Rust 后端构建

**Files:**
- Modify: `build-windows.ps1`（末尾追加）

**Interfaces:**
- Consumes: `$ProjectRoot`、`Write-Step`
- Produces: `Build-GooseBinary`（产出 `target/.../goose.exe` 并复制到 `ui/desktop/src/bin/`）

- [ ] **Step 1: 追加 Rust 构建函数**

在 `build-windows.ps1` 末尾追加：

```powershell
# 编译 goose.exe（release, x86_64-pc-windows-msvc）并放入 ui/desktop/src/bin
function Build-GooseBinary {
    Write-Step "编译 Rust 后端 goose.exe（release）"
    Set-Location $ProjectRoot

    & rustup target add x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { throw "rustup target add 失败" }

    Write-Host "首次编译依赖较多，可能耗时较长，请耐心等待..."
    # 禁用 local-inference 以跳过 llama.cpp 的 C++ 编译（本地无需本地推理，且其构建依赖易缺失）
    & cargo build --release --target x86_64-pc-windows-msvc -p goose-cli --bin goose --no-default-features --features code-mode,tui,aws-providers,telemetry,nostr,otel,rustls-tls,system-keyring,update
    if ($LASTEXITCODE -ne 0) { throw "cargo build 失败" }

    $gooseExe = Join-Path $ProjectRoot 'target\x86_64-pc-windows-msvc\release\goose.exe'
    if (-not (Test-Path $gooseExe)) {
        throw "未找到构建产物：$gooseExe"
    }

    $srcBin = Join-Path $ProjectRoot 'ui\desktop\src\bin'
    if (-not (Test-Path $srcBin)) { New-Item -ItemType Directory -Force $srcBin | Out-Null }
    # 仅覆盖构建产物 goose.exe，不删除 git 跟踪的源文件（jbang/node/npx/uvx 等）
    Copy-Item -Path $gooseExe -Destination $srcBin -Force
    Write-Host "已复制 goose.exe 到 ui\desktop\src\bin"
}
```

- [ ] **Step 2: 语法校验**

Run:
```powershell
$null = [System.Management.Automation.Language.Parser]::ParseFile("$PWD\build-windows.ps1", [ref]$null, [ref]$errs); $errs.Count
```
Expected: `0`。

---

## Task 4: 桌面 UI 构建

**Files:**
- Modify: `build-windows.ps1`（末尾追加）

**Interfaces:**
- Consumes: `$ProjectRoot`、`Write-Step`
- Produces: `Build-DesktopApp`（产出 `ui/desktop/out/HeyBuddy-win32-x64/`）

- [ ] **Step 1: 追加桌面构建函数**

在 `build-windows.ps1` 末尾追加：

```powershell
# 安装依赖并用 electron-forge 打包 win32 x64 桌面应用
function Build-DesktopApp {
    Write-Step "构建桌面 UI（electron-forge make, win32 x64）"
    $desktopDir = Join-Path $ProjectRoot 'ui\desktop'
    Set-Location $desktopDir

    & pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败" }

    & node scripts\build-main.js
    if ($LASTEXITCODE -ne 0) { throw "build-main.js 失败" }

    $env:ELECTRON_PLATFORM = 'win32'
    & node scripts\prepare-platform-binaries.js
    if ($LASTEXITCODE -ne 0) { throw "prepare-platform-binaries.js 失败" }

    & pnpm run make --platform=win32 --arch=x64
    if ($LASTEXITCODE -ne 0) { throw "electron-forge make 失败" }
}
```

> 注：`pnpm run make --platform=win32 --arch=x64` 与 CI / `Justfile make-ui-windows` 写法一致（不加 `--` 分隔）。

- [ ] **Step 2: 语法校验**

Run:
```powershell
$null = [System.Management.Automation.Language.Parser]::ParseFile("$PWD\build-windows.ps1", [ref]$null, [ref]$errs); $errs.Count
```
Expected: `0`。

---

## Task 5: 分发整理、打包 zip、主流程编排与端到端验证

**Files:**
- Modify: `build-windows.ps1`（末尾追加主流程）
- No other files modified.

**Interfaces:**
- Consumes: `Assert-Toolchain`、`Build-GooseBinary`、`Build-DesktopApp`
- Produces: 完整可运行脚本，端到端产出 `dist-windows/` 与 zip。

- [ ] **Step 1: 追加分发打包函数**

在 `build-windows.ps1` 末尾追加：

```powershell
# 整理 dist-windows 目录并打包 zip 到项目根
function Package-Distribution {
    Write-Step "整理 dist-windows 并打包 zip"
    $desktopDir = Join-Path $ProjectRoot 'ui\desktop'
    Set-Location $desktopDir

    $outDir = Join-Path $desktopDir 'out\HeyBuddy-win32-x64'
    if (-not (Test-Path $outDir)) {
        throw "未找到构建输出目录：$outDir"
    }

    # 将 src/bin 注入到应用的 resources/bin
    $resBin = Join-Path $outDir 'resources\bin'
    if (-not (Test-Path $resBin)) { New-Item -ItemType Directory -Force $resBin | Out-Null }
    Copy-Item -Path "$desktopDir\src\bin\*" -Destination $resBin -Recurse -Force

    # 汇总为 dist-windows 扁平目录
    $distDir = Join-Path $desktopDir 'dist-windows'
    if (Test-Path $distDir) { Remove-Item -Path $distDir -Recurse -Force }
    New-Item -ItemType Directory -Force $distDir | Out-Null
    Copy-Item -Path "$outDir\*" -Destination $distDir -Recurse -Force

    # 打包 zip：优先 7z，回退 Compress-Archive
    $zipPath = Join-Path $ProjectRoot 'HeyBuddy-win32-x64.zip'
    if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force }

    if (Test-CommandAvailable '7z') {
        & 7z a -tzip $zipPath "$distDir\*"
        if ($LASTEXITCODE -ne 0) { throw "7z 打包失败" }
    } else {
        Compress-Archive -Path "$distDir\*" -DestinationPath $zipPath -Force
    }

    Write-Host ""
    Write-Host "构建完成：" -ForegroundColor Green
    Write-Host "  目录：$distDir"
    Write-Host "  压缩包：$zipPath"
}
```

- [ ] **Step 2: 追加主流程编排**

在 `build-windows.ps1` 最末尾追加：

```powershell
# 主流程
try {
    Assert-Toolchain
    Build-GooseBinary
    Build-DesktopApp
    Package-Distribution
} catch {
    Write-Host ""
    Write-Host "构建失败：$($_.Exception.Message)" -ForegroundColor Red
    Set-Location $ProjectRoot
    exit 1
}

Set-Location $ProjectRoot
exit 0
```

- [ ] **Step 3: 语法校验**

Run:
```powershell
$null = [System.Management.Automation.Language.Parser]::ParseFile("$PWD\build-windows.ps1", [ref]$null, [ref]$errs); $errs.Count
```
Expected: `0`。

- [ ] **Step 4: 端到端运行验证**

Run（在项目根）:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-windows.ps1
```
Expected: 脚本依次打印各阶段进度，最终输出"构建完成"，退出码 `0`。
并验证产物存在：
```powershell
Test-Path 'ui\desktop\dist-windows\HeyBuddy.exe'
Test-Path 'HeyBuddy-win32-x64.zip'
```
Expected: 两者均为 `True`。

> 首次运行 `cargo build --release` 与 `pnpm install` 耗时较长，属正常。

- [ ] **Step 5: 提交（需用户授权）**

```bash
git add build-windows.ps1 docs/superpowers/specs/2026-08-13-windows-build-script-design.md docs/superpowers/plans/2026-08-13-windows-build-script.md
git commit -m "build: add windows one-click desktop build script"
```
> 遵循用户全局规则，此步骤仅在用户明确同意后执行；commit 信息不含 emoji。

---

## Self-Review

**1. Spec 覆盖：**
- 工具链检测与补齐（spec 4.1）→ Task 2 ✓
- rustup target + cargo build + 校验 + 复制 goose.exe（spec 4.2 step 3-4）→ Task 3 ✓
- pnpm install + build-main + prepare-platform-binaries + make（spec 4.2 step 6）→ Task 4 ✓
- dist-windows 整理 + zip（spec 4.2 step 7-8）→ Task 5 ✓
- 脚本规范（@author/@date、中文、无 emoji、保留 .gitkeep）（spec 4.4）→ 各 Task ✓
- 主流程编排与错误处理 → Task 5 Step 2 ✓

**2. 占位符扫描：** 无 TBD/TODO；每个代码步骤均给出完整可执行代码。✓

**3. 类型/命名一致性：**
- `Write-Step`、`Test-CommandAvailable`、`Compare-NodeVersion`、`Assert-Toolchain`、`Build-GooseBinary`、`Build-DesktopApp`、`Package-Distribution` 在定义与调用处命名一致 ✓
- `$ProjectRoot` 全程复用 ✓
- `$LASTEXITCODE` 检查在每个原生命令后一致 ✓

无遗留问题。
