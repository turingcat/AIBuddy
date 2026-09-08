<#
    @author: logic
    @date: 2026-08-13
    Windows 桌面一键构建脚本
    复刻 .github/workflows/bundle-windows.yml 的 standard 变体（不含代码签名）
    产物：ui/desktop/dist-windows/、项目根 <版本>-windows-x64-portable.zip 与 <版本>-windows-x64-setup.exe
  运行：powershell -NoProfile -ExecutionPolicy Bypass -File .\build-windows.ps1
#>

[CmdletBinding()]
param(
    # HTTP 代理（默认本机代理，cargo/pnpm 下载走代理；其他环境用 -Proxy 覆盖，传空串则不走代理）
    [string]$Proxy = 'http://127.0.0.1:10809',
    # electron 二进制镜像（@electron/get 不读 HTTPS_PROXY，直连 GitHub 拉校验文件会卡死）
    [string]$ElectronMirror = 'https://npmmirror.com/mirrors/electron/',
    # node 目录（默认本机 node 24.10.0，规避 node 24.16 与 electron-packager 的 packaging 静默退出 bug）
    [string]$NodePath = 'C:\soft\node-v24.10.0-win-x64',
    # 登录服务生产地址：烘焙进安装包主进程（开发模式 just run-ui 不经此脚本，仍默认 localhost:3001）
    [string]$AuthApiBaseUrl = 'https://tflow.online',
    # 目标版本号：留空则自动 patch+1（如 1.45.0 -> 1.45.1）；指定后直接写入该版本（对齐 CI bundle-windows 的 version 输入）
    [string]$Version = '',
    # 跳过版本递增：构建失败重试时使用，避免版本跳号；与 -Version 互斥
    [switch]$SkipVersionBump
)

$ErrorActionPreference = 'Stop'

# 设置代理环境变量，子进程（cargo/pnpm）继承
if ($Proxy) {
    $env:HTTP_PROXY = $Proxy
    $env:HTTPS_PROXY = $Proxy
    $env:npm_config_proxy = $Proxy
    $env:npm_config_https_proxy = $Proxy
    Write-Host "已启用代理：$Proxy"
}

# electron 二进制走国内镜像（@electron/get 常忽略代理直连 GitHub，拉 SHASUMS 时卡死）
if ($ElectronMirror) {
    $env:ELECTRON_MIRROR = $ElectronMirror
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = $ElectronMirror
    Write-Host "已设置 ELECTRON_MIRROR：$ElectronMirror"
}

# 登录服务地址：vite 构建时经 define 烘焙进主进程产物，子进程（build-main.js / forge make）继承
$env:AIBUDDY_AUTH_API_BASE_URL = $AuthApiBaseUrl
Write-Host "登录服务地址已设置：$AuthApiBaseUrl"

# 使用指定 node（前置到 PATH），并用其 corepack 准备 pnpm
if ($NodePath) {
    if (-not (Test-Path (Join-Path $NodePath 'node.exe'))) {
        throw "NodePath 指定的目录下不存在 node.exe：$NodePath"
    }
    $env:PATH = "$NodePath;$env:PATH"
    Write-Host "使用指定 node：$(& node --version) @ $NodePath"
    & corepack enable 2>$null
    & corepack prepare pnpm@10.30.3 --activate
    if ($LASTEXITCODE -ne 0) { Write-Host "corepack 准备 pnpm 未成功，将在工具链检测阶段处理" }
}

# 版本标识：forge / vite / 安装包脚本均按此解析品牌，子进程继承
Write-Host "构建版本：AIBuddy"

# 切换到项目根目录（脚本所在目录）
$ProjectRoot = $PSScriptRoot
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

# 检查并补齐构建工具链：cargo/node 仅提示，pnpm 自动安装
function Assert-Toolchain {
    Write-Step "检查构建工具链"

    if (-not (Test-CommandAvailable 'cargo')) {
        throw "未找到 cargo/rustup。请先安装 Rust 工具链：winget install Rustlang.Rustup 或访问 https://rustup.rs"
    }

    if (-not (Test-CommandAvailable 'node')) {
        throw "未找到 node。请安装 Node.js 24.x 后重试。"
    }
    & node (Join-Path $PSScriptRoot 'ui\desktop\scripts\check-node-version.js')
    if ($LASTEXITCODE -ne 0) { throw "node 版本不满足打包要求" }

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

    # Inno Setup 编译器（安装包构建用）：先查 PATH，再查常见安装位置
    # @author logic
    # @date 2026-08-15
    $script:IsccPath = Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if (-not $script:IsccPath) {
        foreach ($p in @(
            "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
            "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
            "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
        )) {
            if (Test-Path $p) { $script:IsccPath = $p; break }
        }
    }
    if (-not $script:IsccPath) {
        throw "未找到 Inno Setup 编译器 ISCC.exe。请安装：winget install JRSoftware.InnoSetup"
    }
    Write-Host "Inno Setup：$IsccPath"
}

# 构建前递增版本号：ui/desktop/package.json patch+1 并同步 Cargo.toml workspace 版本
# 回写文件但不自动提交，构建成功后由用户手动提交（Cargo.lock 由后续 cargo build 自动刷新）
# @author: logic
# @date: 2026-08-27
function Update-BuildVersion {
    if ($SkipVersionBump) {
        Write-Host "跳过版本递增（-SkipVersionBump），沿用当前版本构建"
        return
    }

    # 检测版本相关文件是否有未提交变更（git 不可用时静默跳过检测）
    try {
        $dirtyFiles = & git -C $ProjectRoot status --porcelain -- Cargo.toml Cargo.lock ui/desktop/package.json 2>$null
        if ($dirtyFiles) {
            Write-Host "提醒：版本相关文件存在未提交变更（上次递增未提交？）。若为构建失败重试，请用 -SkipVersionBump 避免版本跳号" -ForegroundColor Yellow
        }
    } catch {}

    Write-Step "递增构建版本"
    $bumpScript = Join-Path $ProjectRoot 'ui\desktop\scripts\bump-build-version.js'
    if ($Version) {
        $bumpOutput = & node $bumpScript "--target=$Version"
    } else {
        $bumpOutput = & node $bumpScript --patch
    }
    if ($LASTEXITCODE -ne 0) { throw "版本递增失败" }

    $bump = $bumpOutput | ConvertFrom-Json
    if ($bump.prereleaseStripped) {
        Write-Host "当前版本带预发布后缀，已剥离后缀后递增"
    }
    if ($bump.versionMismatch) {
        Write-Host "提醒：package.json 与 Cargo.toml 版本不一致（cargo=$($bump.cargoOldVersion)），已以 package.json 为基准递增" -ForegroundColor Yellow
    }
    Write-Host "  ui/desktop/package.json : $($bump.oldVersion) -> $($bump.newVersion)"
    Write-Host "  Cargo.toml [workspace.package] : $($bump.cargoOldVersion) -> $($bump.newVersion)"
    Write-Host "  提示：版本变更未提交 git，请在构建成功后手动提交（Cargo.lock 会被本次构建一并刷新）："
    Write-Host "    git add Cargo.toml Cargo.lock ui/desktop/package.json"
}

# 编译 aibuddy.exe（release, x86_64-pc-windows-msvc）并复制到 ui/desktop/src/bin
function Build-AIBuddyBinary {
    Write-Step "编译 Rust 后端 aibuddy.exe（release）"
    Set-Location $ProjectRoot

    & rustup target add x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { throw "rustup target add 失败" }

    Write-Host "首次编译依赖较多，可能耗时较长，请耐心等待..."
    # 禁用 local-inference 以跳过 llama.cpp 的 C++ 编译（本地无需本地推理，且其构建依赖易缺失）
    & cargo build --release --target x86_64-pc-windows-msvc -p aibuddy-cli --bin aibuddy --no-default-features --features code-mode,aws-providers,nostr,otel,rustls-tls,system-keyring,update
    if ($LASTEXITCODE -ne 0) { throw "cargo build 失败" }

    $aibuddyExe = Join-Path $ProjectRoot 'target\x86_64-pc-windows-msvc\release\aibuddy.exe'
    if (-not (Test-Path $aibuddyExe)) {
        throw "未找到构建产物：$aibuddyExe"
    }

    $srcBin = Join-Path $ProjectRoot 'ui\desktop\src\bin'
    if (-not (Test-Path $srcBin)) { New-Item -ItemType Directory -Force $srcBin | Out-Null }
    # 仅覆盖构建产物 aibuddy.exe，不删除 git 跟踪的源文件（jbang/node/npx/uvx 等）。
    # 正在运行的 exe 无法被删除但可以改名，先移开再写入，避免覆写活动二进制
    $destExe = Join-Path $srcBin 'aibuddy.exe'
    if (Test-Path $destExe) {
        $stale = "$destExe.old"
        if (Test-Path $stale) { Remove-Item -Path $stale -Force -ErrorAction SilentlyContinue }
        Move-Item -Path $destExe -Destination $stale -Force
        Remove-Item -Path $stale -Force -ErrorAction SilentlyContinue
    }
    Copy-Item -Path $aibuddyExe -Destination $destExe
    Write-Host "已复制 aibuddy.exe 到 ui\desktop\src\bin"
}

# 安装依赖并用 electron-forge 打包 win32 x64 桌面应用
function Build-DesktopApp {
    Write-Step "构建桌面 UI（electron-forge package, win32 x64）"
    $desktopDir = Join-Path $ProjectRoot 'ui\desktop'
    Set-Location $desktopDir

    & pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败" }

    & node scripts\build-main.js
    if ($LASTEXITCODE -ne 0) { throw "build-main.js 失败" }

    $env:ELECTRON_PLATFORM = 'win32'
    & node scripts\prepare-platform-binaries.js
    if ($LASTEXITCODE -ne 0) { throw "prepare-platform-binaries.js 失败" }

    # 用 electron-forge package 而非 make：forge.config.ts 的 makers 已精简为仅 darwin
    # （Windows 产物由 Package-Distribution 以 7z + Inno Setup 生成），make 找不到 win32 target 会失败
    # @author: logic
    # @date: 2026-09-03
    & pnpm run package:windows
    if ($LASTEXITCODE -ne 0) { throw "electron-forge package 失败" }
}

# 整理 dist-windows 目录，打包便携版 zip 与 Inno 安装包到项目根
function Package-Distribution {
    Write-Step "整理 dist-windows 并打包发布产物"
    $desktopDir = Join-Path $ProjectRoot 'ui\desktop'
    Set-Location $desktopDir

    # 版本产物名与 Inno 定义统一由 windows-package.js 生成，避免脚本内硬编码品牌
    $version = (Get-Content (Join-Path $desktopDir 'package.json') -Raw | ConvertFrom-Json).version
    $distDir = Join-Path $desktopDir 'dist-windows'
    $pkgJson = & node (Join-Path $desktopDir 'scripts\windows-package.js') x64 $version $distDir $ProjectRoot
    if ($LASTEXITCODE -ne 0) { throw "解析 Windows 打包参数失败" }
    $pkg = $pkgJson | ConvertFrom-Json

    $outDir = Join-Path $desktopDir "out\$($pkg.packagedDirName)"
    if (-not (Test-Path $outDir)) {
        throw "未找到构建输出目录：$outDir（请确认 electron-forge package 成功）"
    }

    # 将 src/bin 注入到应用的 resources/bin
    $resBin = Join-Path $outDir 'resources\bin'
    if (-not (Test-Path $resBin)) { New-Item -ItemType Directory -Force $resBin | Out-Null }
    Copy-Item -Path "$desktopDir\src\bin\*" -Destination $resBin -Recurse -Force

    # 汇总为 dist-windows 扁平目录（dist-windows 为脚本生成的产物，构建前清理）
    if (Test-Path $distDir) { Remove-Item -Path $distDir -Recurse -Force }
    New-Item -ItemType Directory -Force $distDir | Out-Null
    Copy-Item -Path "$outDir\*" -Destination $distDir -Recurse -Force

    # 便携版：解包目录原样压缩，不写注册表也不留卸载项
    $zipPath = Join-Path $ProjectRoot $pkg.portableFileName
    if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force }

    if (Test-CommandAvailable '7z') {
        & 7z a -tzip $zipPath "$distDir\*"
        if ($LASTEXITCODE -ne 0) { throw "7z 打包失败" }
    } else {
        Compress-Archive -Path "$distDir\*" -DestinationPath $zipPath -Force
    }

    # 用 Inno Setup 编译安装包（替代 Squirrel：其 Update.exe 安装收尾会连 GitHub 下载卸载图标，
    # 网络受限时安装窗口滞留约 85 秒；Inno 全程零网络请求）
    # @author logic
    # @date 2026-08-15
    & $IsccPath @($pkg.isccArgs) (Join-Path $desktopDir 'desktop-setup.iss')
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup 编译失败" }

    Write-Host ""
    Write-Host "构建完成：" -ForegroundColor Green
    Write-Host "  目录：$distDir"
    Write-Host "  便携版：$zipPath"
    Write-Host "  安装包：$(Join-Path $ProjectRoot $pkg.setupFileName)"
}

# 主流程
try {
    if ($Version -and $SkipVersionBump) {
        throw "-Version 与 -SkipVersionBump 互斥，请只指定其一"
    }
    Assert-Toolchain
    Update-BuildVersion
    Build-AIBuddyBinary
    Build-DesktopApp
    Package-Distribution
    Set-Location $ProjectRoot
    Write-Host ""
    Write-Host "全部构建步骤完成。" -ForegroundColor Green
} catch {
    Set-Location $ProjectRoot
    Write-Host ""
    Write-Host "构建失败：$($_.Exception.Message)" -ForegroundColor Red
    throw
}
