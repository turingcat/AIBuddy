; HeyBuddy Windows 安装包脚本（Inno Setup）
; 取代 electron-forge 的 maker-squirrel：Squirrel 的 Update.exe 在安装收尾阶段
; 会从 GitHub 下载卸载图标，网络受限环境下安装窗口会滞留约 85 秒；
; Inno Setup 全程零网络请求，且安装图标/快捷方式/卸载项完全可控。
; 由 build-windows.ps1 调用 ISCC 编译：ISCC /DMyAppVersion=x.y.z /O<输出目录> 本文件
; 也可在 ui/desktop 目录下手动运行：ISCC heybuddy-setup.iss
; @author logic
; @date 2026-08-15

; 版本号由命令行 /DMyAppVersion 注入（取自 package.json），手动运行时可用默认值
#ifndef MyAppVersion
#define MyAppVersion "0.0.0"
#endif

#define MyAppName "HeyBuddy"
#define MyAppExeName "HeyBuddy.exe"

[Setup]
; AppId 一经发布不可更改（Inno 依据它识别同一应用做升级安装）
AppId={{FDA43817-EFCC-42D0-AB69-D414B629E300}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
; 安装/卸载图标直接用应用可执行文件内嵌图标（即 src/images/icon.ico 打进 exe 的图标）
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
; 安装器自身图标（资源管理器中看到的 Setup.exe 图标）
SetupIconFile=src\images\icon.ico
; 输出到项目根目录（build-windows.ps1 会用 /O 覆盖为绝对路径）
OutputDir=..\..
OutputBaseFilename=HeyBuddy-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
; 升级/卸载时自动关闭正在运行的 HeyBuddy（含其 goose serve 子进程）
CloseApplications=yes

[Languages]
; 简体中文翻译（MIT，来源 kira-96/Inno-Setup-Chinese-Simplified-Translation，随仓库入库，
; 不依赖构建机安装；要求 Inno Setup 6.5.0+）
Name: "chinesesimplified"; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; dist-windows 为 build-windows.ps1 整理好的完整应用目录（electron + resources + goose.exe）
Source: "dist-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
