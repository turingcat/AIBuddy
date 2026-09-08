<#
    @author: logic
    @date: 2026-08-24
    UI 开发模式一键启动脚本
    流程：准备 node/pnpm 环境 → 检查 ui/desktop 依赖 → 确保 heybuddy 二进制存在（默认缺才构建）→ pnpm run start-gui
    运行：powershell -NoProfile -ExecutionPolicy Bypass -File .\dev-ui.ps1
    可选：-RebuildBackend  先 cargo build（debug 增量）并复制 heybuddy.exe 到 ui/desktop/src/bin 再启动（改过 Rust 代码后用）
          -NoBuild         绝不构建，二进制缺失时直接报错退出（纯前端迭代最快路径）
          -AuthApiBaseUrl  登录服务地址（默认生产 https://tflow.online；传空串则用源码默认 localhost:3001）
#>

[CmdletBinding()]
param(
    # 强制先重建后端二进制（Rust 代码变更后使用）
    [switch]$RebuildBackend,
    # 绝不构建，缺二进制直接报错
    [switch]$NoBuild,
    # 登录服务地址：经 vite define 烘焙进主进程（vite.main.config.mts），子进程继承
    [string]$AuthApiBaseUrl = 'https://tflow.online',
    # HTTP 代理（cargo/pnpm 下载走代理；传空串则不走代理）
    [string]$Proxy = 'http://127.0.0.1:10809',
    # electron 二进制镜像（首次 forge start 下载 electron 用）
    [string]$ElectronMirror = 'https://npmmirror.com/mirrors/electron/',
    # node 目录（与 build-windows.ps1 相同理由固定版本，规避 node 24.16 的 electron-packager 问题）
    [string]$NodePath = 'C:\soft\node-v24.10.0-win-x64'
)

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$uiDir = Join-Path $repoRoot 'ui\desktop'
$binName = 'heybuddy.exe'
$srcBin = Join-Path $uiDir "src\bin\$binName"
$debugBin = Join-Path $repoRoot "target\debug\$binName"

function Assert-LastExit([string]$step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$step 失败（退出码 $LASTEXITCODE）"
    }
}

# ---------------- 1. 环境准备（与 build-windows.ps1 保持一致） ----------------
if ($Proxy) {
    $env:HTTP_PROXY = $Proxy
    $env:HTTPS_PROXY = $Proxy
    $env:npm_config_proxy = $Proxy
    $env:npm_config_https_proxy = $Proxy
}

if ($ElectronMirror) {
    $env:ELECTRON_MIRROR = $ElectronMirror
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = $ElectronMirror
}

if ($AuthApiBaseUrl) {
    $env:AIBUDDY_AUTH_API_BASE_URL = $AuthApiBaseUrl
    Write-Host "登录服务地址已设置：$AuthApiBaseUrl"
} else {
    Write-Host '未设置登录服务地址，使用源码默认 http://localhost:3001'
}

if ($NodePath) {
    if (-not (Test-Path (Join-Path $NodePath 'node.exe'))) {
        throw "NodePath 指定的目录下不存在 node.exe：$NodePath"
    }
    $env:PATH = "$NodePath;$env:PATH"
    Write-Host "使用指定 node：$(& node --version) @ $NodePath"
    & corepack enable 2>$null
    & corepack prepare pnpm@10.30.3 --activate
    if ($LASTEXITCODE -ne 0) { Write-Host "corepack 准备 pnpm 未成功，继续使用 PATH 中现有 pnpm" }
}

# ---------------- 2. ui/desktop 依赖 ----------------
Set-Location $uiDir
if (-not (Test-Path (Join-Path $uiDir 'node_modules'))) {
    Write-Host 'node_modules 缺失，执行 pnpm install ...'
    & pnpm install
    Assert-LastExit 'pnpm install'
}

# ---------------- 3. heybuddy 二进制保障 ----------------
# dev 模式解析顺序：src/bin → target/release → target/debug，任一存在即可启动
$binaryAvailable = (Test-Path $srcBin) -or
    (Test-Path (Join-Path $repoRoot "target\release\$binName")) -or
    (Test-Path $debugBin)

if ($NoBuild) {
    if (-not $binaryAvailable) {
        throw "heybuddy 二进制不存在（src/bin、target/release、target/debug 均未找到），且指定了 -NoBuild 不允许构建"
    }
    Write-Host '跳过构建（-NoBuild）'
} elseif ($RebuildBackend -or -not $binaryAvailable) {
    if (-not $binaryAvailable) {
        Write-Host '未找到 heybuddy 二进制，先构建 debug 版后端 ...'
    } else {
        Write-Host '-RebuildBackend：先重建 debug 版后端 ...'
    }
    Set-Location $repoRoot
    & cargo build
    Assert-LastExit 'cargo build'
    if (-not (Test-Path $debugBin)) {
        throw "cargo build 成功但未生成 $debugBin"
    }
    New-Item -ItemType Directory -Force (Split-Path $srcBin) | Out-Null
    Copy-Item $debugBin $srcBin -Force
    Write-Host "已复制 heybuddy.exe 到 $srcBin"
    Set-Location $uiDir
} else {
    Write-Host 'heybuddy 二进制已存在，跳过构建（改过 Rust 代码请用 -RebuildBackend）'
}

# ---------------- 4. 启动 UI 开发模式 ----------------
Write-Host '启动 UI 开发模式（build-heybuddy-sdk + i18n:compile + electron-forge start）...'
& pnpm run start-gui
exit $LASTEXITCODE
