/**
 * @author: logic
 * @date: 2026-08-27
 * 构建版本递增脚本：仅由本地根目录 build-windows.ps1 在构建前调用（CI 不使用）。
 * 将 ui/desktop/package.json 的 version patch+1（或写入 --target 指定版本），
 * 并同步根 Cargo.toml 的 [workspace.package] version。写回文件但不做任何 git 操作，
 * 版本变更由用户在构建成功后手动提交。
 * 纯函数部分由同目录 bump-build-version.test.js 覆盖；CLI 成功时向 stdout 输出
 * 单行 JSON 供构建脚本解析，失败时向 stderr 输出中文原因并以退出码 1 结束。
 */

// 与 justfile validate 一致的版本形态：三段数字，可选 "-" 预发布后缀
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-(.*))?$/;
const PACKAGE_JSON_VERSION_LINE = /^(\s*"version":\s*")[^"]*(")/;
const TOML_SECTION_LINE = /^\s*\[.*\]\s*$/;
const TOML_WORKSPACE_PACKAGE_SECTION = /^\s*\[workspace\.package\]\s*$/;
const TOML_VERSION_LINE = /^(\s*version\s*=\s*")[^"]*(")/;
const fs = require('node:fs');
const path = require('node:path');

function parseVersion(str) {
  if (typeof str !== 'string') return null;
  const matched = str.trim().match(SEMVER_PATTERN);
  if (!matched) return null;
  return {
    major: Number(matched[1]),
    minor: Number(matched[2]),
    patch: Number(matched[3]),
    prerelease: matched[4] ?? '',
  };
}

function nextPatchVersion(str) {
  const parsed = parseVersion(str);
  if (!parsed) return null;
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function validateTargetVersion(target, current) {
  if (!parseVersion(target)) {
    throw new Error(`目标版本号不合法：${target ?? ''}（应为 x.y.z 或 x.y.z-后缀）`);
  }
  if (target === current) {
    throw new Error(`目标版本 ${target} 与当前版本相同，请指定不同的版本号`);
  }
  return target;
}

// 行级替换首个 "version" 行，避免 JSON.parse/stringify 回写导致整文件格式重排
function applyPackageJsonVersion(content, newVersion) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (PACKAGE_JSON_VERSION_LINE.test(lines[i])) {
      lines[i] = lines[i].replace(PACKAGE_JSON_VERSION_LINE, `$1${newVersion}$2`);
      return lines.join('\n');
    }
  }
  throw new Error('package.json 中未找到 "version" 字段');
}

// 逐行跟踪 [section]，仅替换 [workspace.package] 段内的 version 行，段外同名键不误伤
function applyCargoTomlVersion(content, newVersion) {
  const lines = content.split('\n');
  let inWorkspacePackage = false;
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TOML_SECTION_LINE.test(line)) {
      inWorkspacePackage = TOML_WORKSPACE_PACKAGE_SECTION.test(line);
    } else if (inWorkspacePackage && TOML_VERSION_LINE.test(line)) {
      lines[i] = line.replace(TOML_VERSION_LINE, `$1${newVersion}$2`);
      replaced = true;
    }
  }
  if (!replaced) {
    throw new Error('Cargo.toml 中未找到 [workspace.package] 段的 version 字段');
  }
  return lines.join('\n');
}

// 依据 package.json 当前版本与可选的显式目标，解析本次要写入的版本及提醒标记
function resolveTarget(currentVersion, cargoVersion, targetArg) {
  const versionMismatch = currentVersion !== cargoVersion;
  if (targetArg) {
    validateTargetVersion(targetArg, currentVersion);
    return { target: targetArg, prereleaseStripped: false, versionMismatch };
  }
  const next = nextPatchVersion(currentVersion);
  if (!next) {
    throw new Error(`当前版本号不合法，无法自动递增：${currentVersion}`);
  }
  return {
    target: next,
    prereleaseStripped: parseVersion(currentVersion).prerelease !== '',
    versionMismatch,
  };
}

function readCargoTomlVersion(content) {
  let inWorkspacePackage = false;
  for (const line of content.split('\n')) {
    if (TOML_SECTION_LINE.test(line)) {
      inWorkspacePackage = TOML_WORKSPACE_PACKAGE_SECTION.test(line);
    } else if (inWorkspacePackage) {
      const matched = line.match(/^\s*version\s*=\s*"([^"]*)"/);
      if (matched) return matched[1];
    }
  }
  return null;
}

// CLI 主流程；io/paths 参数仅供测试注入内存实现，缺省绑定真实文件系统与进程输出
function runCli(patchMode, targetArg, io, paths) {
  const deps =
    io ?? {
      read: (file) => fs.readFileSync(file, 'utf8'),
      write: (file, content) => fs.writeFileSync(file, content),
      out: (line) => console.log(line),
      fail: (msg) => {
        console.error(msg);
        process.exit(1);
      },
    };
  const filePaths =
    paths ?? {
      // 经 __dirname 定位（ui/desktop/scripts → 仓库根），不依赖调用方 cwd
      packageJson: path.join(__dirname, '..', 'package.json'),
      cargoToml: path.join(__dirname, '..', '..', '..', 'Cargo.toml'),
    };

  if ((patchMode && targetArg) || (!patchMode && !targetArg)) {
    deps.fail('参数错误：需且仅需 --patch（自动 patch+1）或 --target=x.y.z（显式指定）其一');
    return;
  }

  let packageContent;
  let cargoContent;
  try {
    packageContent = deps.read(filePaths.packageJson);
    cargoContent = deps.read(filePaths.cargoToml);
  } catch (err) {
    deps.fail(`读取版本文件失败：${err.message}`);
    return;
  }

  let currentVersion;
  try {
    currentVersion = JSON.parse(packageContent).version;
  } catch {
    deps.fail('package.json 解析失败，无法读取 version 字段');
    return;
  }
  const cargoOldVersion = readCargoTomlVersion(cargoContent);
  if (cargoOldVersion === null) {
    deps.fail('Cargo.toml 中未找到 [workspace.package] 段的 version 字段');
    return;
  }

  let resolved;
  try {
    resolved = resolveTarget(currentVersion, cargoOldVersion, targetArg);
  } catch (err) {
    deps.fail(err.message);
    return;
  }

  try {
    deps.write(filePaths.packageJson, applyPackageJsonVersion(packageContent, resolved.target));
    deps.write(filePaths.cargoToml, applyCargoTomlVersion(cargoContent, resolved.target));
  } catch (err) {
    deps.fail(`写回版本文件失败：${err.message}`);
    return;
  }

  deps.out(
    JSON.stringify({
      oldVersion: currentVersion,
      cargoOldVersion,
      newVersion: resolved.target,
      prereleaseStripped: resolved.prereleaseStripped,
      versionMismatch: resolved.versionMismatch,
    })
  );
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const patchMode = args.includes('--patch');
  const targetArg = (args.find((arg) => arg.startsWith('--target=')) ?? '').slice('--target='.length);
  runCli(patchMode, targetArg.trim());
}

module.exports = {
  parseVersion,
  nextPatchVersion,
  validateTargetVersion,
  applyPackageJsonVersion,
  applyCargoTomlVersion,
  resolveTarget,
  runCli,
};
