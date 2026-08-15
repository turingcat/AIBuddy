<#
    @author: logic
    @date: 2026-08-13
    Windows 桌面一键构建脚本
    复刻 .github/workflows/bundle-windows.yml 的 standard 变体（不含代码签名）
    产物：ui/desktop/dist-windows/、项目根 HeyBuddy-win32-x64.zip 与 HeyBuddy-Setup.exe（安装包）
    运行：powershell -NoProfile -ExecutionPolicy Bypass -File .\build-windows.ps1
#>

[CmdletBinding()]
param(
    # HTTP 代理（默认本机代理，cargo/pnpm 下载走代理；其他环境用 -Proxy 覆盖，传空串则不走代理）
    [string]$Proxy = 'http://127.0.0.1:10809',
    # electron 二进制镜像（@electron/get 不读 HTTPS_PROXY，直连 GitHub 拉校验文件会卡死）
    [string]$ElectronMirror = 'https://npmmirror.com/mirrors/electron/',
    # node 目录（默认本机 node 24.10.0，规避 node 24.16 与 electron-packager 的 packaging 静默退出 bug）
    [string]$NodePath = 'C:\soft\node-v24.10.0-win-x64'
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

# 比较 node 版本是否 >= 最低要求，忽略预发布后缀
function Compare-NodeVersion {
    param([string]$Current, [string]$Minimum)
    $cur = [version](($Current -split '-')[0])
    $min = [version]$Minimum
    return $cur -ge $min
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

# 编译 goose.exe（release, x86_64-pc-windows-msvc）并复制到 ui/desktop/src/bin
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

# 整理 dist-windows 目录并打包 zip 到项目根
function Package-Distribution {
    Write-Step "整理 dist-windows 并打包 zip"
    $desktopDir = Join-Path $ProjectRoot 'ui\desktop'
    Set-Location $desktopDir

    $outDir = Join-Path $desktopDir 'out\HeyBuddy-win32-x64'
    if (-not (Test-Path $outDir)) {
        throw "未找到构建输出目录：$outDir（请确认 electron-forge make 成功）"
    }

    # 将 src/bin 注入到应用的 resources/bin
    $resBin = Join-Path $outDir 'resources\bin'
    if (-not (Test-Path $resBin)) { New-Item -ItemType Directory -Force $resBin | Out-Null }
    Copy-Item -Path "$desktopDir\src\bin\*" -Destination $resBin -Recurse -Force

    # 汇总为 dist-windows 扁平目录（dist-windows 为脚本生成的产物，构建前清理）
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

    # 用 Inno Setup 编译安装包（替代 Squirrel：其 Update.exe 安装收尾会连 GitHub 下载卸载图标，
    # 网络受限时安装窗口滞留约 85 秒；Inno 全程零网络请求）
    # @author logic
    # @date 2026-08-15
    $version = (Get-Content (Join-Path $desktopDir 'package.json') -Raw | ConvertFrom-Json).version
    & $IsccPath "/DMyAppVersion=$version" "/O$ProjectRoot" (Join-Path $desktopDir 'heybuddy-setup.iss')
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup 编译失败" }
    $setupDest = Join-Path $ProjectRoot 'HeyBuddy-Setup.exe'
    Write-Host "  安装包：$setupDest"

    Write-Host ""
    Write-Host "构建完成：" -ForegroundColor Green
    Write-Host "  目录：$distDir"
    Write-Host "  压缩包：$zipPath"
}

# 主流程
try {
    Assert-Toolchain
    Build-GooseBinary
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
