; AIBuddy Windows installer script (Inno Setup)
; 取代 electron-forge 的 maker-squirrel：Squirrel 的 Update.exe 在安装收尾阶段
; 会从 GitHub 下载卸载图标，网络受限环境下安装窗口会滞留约 85 秒；
; Inno Setup 全程零网络请求，且安装图标/快捷方式/卸载项完全可控。
; 全部产品标识由 build-windows.ps1 经 scripts/windows-package.js 生成的 /D 参数注入，
; 本文件不保留任何版本默认值，避免误用某一版本的标识打出另一版本的安装包。
; @author logic
; @date 2026-08-15

#ifndef MyAppName
  #error MyAppName must be passed on the ISCC command line
#endif
#ifndef MyAppVersion
  #error MyAppVersion must be passed on the ISCC command line
#endif
#ifndef MyAppId
  #error MyAppId must be passed on the ISCC command line
#endif
#ifndef MyAppExeName
  #error MyAppExeName must be passed on the ISCC command line
#endif
#ifndef SourceDir
  #error SourceDir must be passed on the ISCC command line
#endif
#ifndef OutputDir
  #error OutputDir must be passed on the ISCC command line
#endif
#ifndef OutputBaseFilename
  #error OutputBaseFilename must be passed on the ISCC command line
#endif
#ifndef MyArchitecturesAllowed
  #error MyArchitecturesAllowed must be passed on the ISCC command line
#endif
#ifndef MyInstallIn64BitMode
  #error MyInstallIn64BitMode must be passed on the ISCC command line
#endif

[Setup]
; AppId 一经发布不可更改（Inno 依据它识别同一应用做升级安装），每个版本各用一个
AppId={{#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
; 安装/卸载图标直接用应用可执行文件内嵌图标（即 AIBuddy icon.ico 打进 exe 的图标）
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
; 安装器自身图标（资源管理器中看到的 Setup.exe 图标）
SetupIconFile=src\images\aibuddy\icon.ico
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed={#MyArchitecturesAllowed}
#if MyInstallIn64BitMode == "1"
ArchitecturesInstallIn64BitMode=x64compatible
#endif
PrivilegesRequired=admin
; 升级/卸载时自动关闭正在运行的应用（含其 heybuddy serve 子进程）
CloseApplications=yes

[Languages]
; 简体中文翻译（MIT，来源 kira-96/Inno-Setup-Chinese-Simplified-Translation，随仓库入库，
; 不依赖构建机安装；要求 Inno Setup 6.5.0+）
Name: "chinesesimplified"; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; SourceDir 为 build-windows.ps1 整理好的完整应用目录（electron + resources + heybuddy.exe）
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
