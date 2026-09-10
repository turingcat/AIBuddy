/**
 * @author: logic
 * @date: 2026-08-27
 * bump-build-version 单元测试：覆盖版本解析、patch 递增、目标校验、
 * package.json / Cargo.toml 内容改写与目标解析的全部分支
 */

const {
  parseVersion,
  nextPatchVersion,
  validateTargetVersion,
  applyPackageJsonVersion,
  applyCargoTomlVersion,
  resolveTarget,
  runCli,
} = require('./bump-build-version');

describe('parseVersion', () => {
  it('解析标准三段版本号', () => {
    expect(parseVersion('1.45.0')).toEqual({ major: 1, minor: 45, patch: 0, prerelease: '' });
  });

  it('解析带预发布后缀的版本号', () => {
    expect(parseVersion('1.45.0-canary.3')).toEqual({
      major: 1,
      minor: 45,
      patch: 0,
      prerelease: 'canary.3',
    });
  });

  it('拒绝非数字版本串', () => {
    expect(parseVersion('abc')).toBeNull();
  });

  it('拒绝两段版本号', () => {
    expect(parseVersion('1.45')).toBeNull();
  });

  it('拒绝四段版本号', () => {
    expect(parseVersion('1.45.0.1')).toBeNull();
  });

  it('拒绝 v 前缀', () => {
    expect(parseVersion('v1.45.0')).toBeNull();
  });

  it('拒绝空串', () => {
    expect(parseVersion('')).toBeNull();
  });
});

describe('nextPatchVersion', () => {
  it('标准三段 patch 加一', () => {
    expect(nextPatchVersion('1.45.0')).toBe('1.45.1');
  });

  it('patch 为 9 时不进位', () => {
    expect(nextPatchVersion('1.45.9')).toBe('1.45.10');
  });

  it('剥离预发布后缀后递增', () => {
    expect(nextPatchVersion('1.45.0-canary.3')).toBe('1.45.1');
  });

  it('非法版本返回 null', () => {
    expect(nextPatchVersion('not-a-version')).toBeNull();
  });
});

describe('validateTargetVersion', () => {
  it('合法且不同于当前版本时通过并原样返回', () => {
    expect(validateTargetVersion('1.46.0', '1.45.0')).toBe('1.46.0');
  });

  it('带预发布后缀的合法目标通过', () => {
    expect(validateTargetVersion('1.46.0-rc.1', '1.45.0')).toBe('1.46.0-rc.1');
  });

  it('等于当前版本时报错', () => {
    expect(() => validateTargetVersion('1.45.0', '1.45.0')).toThrow();
  });

  it('非 semver 目标报错', () => {
    expect(() => validateTargetVersion('abc', '1.45.0')).toThrow();
  });

  it('空目标报错', () => {
    expect(() => validateTargetVersion('', '1.45.0')).toThrow();
  });
});

describe('applyPackageJsonVersion', () => {
  const packageJsonContent = [
    '{',
    '  "name": "aibuddy-app",',
    '  "productName": "AIBuddy",',
    '  "version": "1.45.0",',
    '  "scripts": {',
    '    "print": "echo \\"version: 9.9.9\\""',
    '  },',
    '  "nested": {',
    '    "version": "0.0.1"',
    '  }',
    '}',
  ].join('\n');

  it('只替换首个 version 行，其余内容逐字节保持', () => {
    const result = applyPackageJsonVersion(packageJsonContent, '1.45.1');
    const expected = packageJsonContent.replace('"version": "1.45.0"', '"version": "1.45.1"');
    expect(result).toBe(expected);
    expect(result).toContain('"version": "1.45.1"');
    // 字符串字面量与嵌套对象中的 version 不受影响
    expect(result).toContain('echo \\"version: 9.9.9\\"');
    expect(result).toContain('"version": "0.0.1"');
  });

  it('保持 CRLF 换行不被破坏', () => {
    const crlf = '{\r\n  "name": "x",\r\n  "version": "1.0.0"\r\n}\r\n';
    const result = applyPackageJsonVersion(crlf, '1.0.1');
    expect(result).toBe('{\r\n  "name": "x",\r\n  "version": "1.0.1"\r\n}\r\n');
  });

  it('找不到 version 行时报错', () => {
    expect(() => applyPackageJsonVersion('{\n  "name": "x"\n}\n', '1.0.1')).toThrow();
  });
});

describe('applyCargoTomlVersion', () => {
  // 结构取自根 Cargo.toml 的等价片段
  const cargoContent = [
    '[workspace]',
    'members = ["crates/*"]',
    'resolver = "2"',
    '',
    '[workspace.package]',
    'edition = "2021"',
    'version = "1.45.0"',
    'rust-version = "1.94.1"',
    '',
    '[workspace.dependencies]',
    'anyhow = { version = "1.0", features = ["backtrace"] }',
    '',
    '[patch.crates-io]',
    'version = "should-not-touch"',
  ].join('\n');

  it('仅替换 workspace.package 段内的 version 行', () => {
    const result = applyCargoTomlVersion(cargoContent, '1.45.1');
    expect(result).toContain('[workspace.package]\nedition = "2021"\nversion = "1.45.1"');
    expect(result).not.toContain('"1.45.0"');
  });

  it('行内表与其他段中的 version 不受影响', () => {
    const result = applyCargoTomlVersion(cargoContent, '1.45.1');
    expect(result).toContain('anyhow = { version = "1.0", features = ["backtrace"] }');
    expect(result).toContain('[patch.crates-io]\nversion = "should-not-touch"');
  });

  it('缺少 workspace.package 段时报错', () => {
    const noSection = '[workspace]\nmembers = ["crates/*"]\n';
    expect(() => applyCargoTomlVersion(noSection, '1.45.1')).toThrow();
  });

  it('workspace.package 段内没有 version 行时报错', () => {
    const noVersion = '[workspace.package]\nedition = "2021"\n';
    expect(() => applyCargoTomlVersion(noVersion, '1.45.1')).toThrow();
  });
});

describe('resolveTarget', () => {
  it('未指定目标时基于 package.json 当前版本 patch 加一', () => {
    expect(resolveTarget('1.45.0', '1.45.0', '')).toEqual({
      target: '1.45.1',
      prereleaseStripped: false,
      versionMismatch: false,
    });
  });

  it('当前版本带预发布后缀时标记已剥离', () => {
    expect(resolveTarget('1.45.0-canary.3', '1.45.0', '')).toEqual({
      target: '1.45.1',
      prereleaseStripped: true,
      versionMismatch: true,
    });
  });

  it('当前版本非法时报错', () => {
    expect(() => resolveTarget('dev', '1.45.0', '')).toThrow();
  });

  it('指定合法目标时直接采用', () => {
    expect(resolveTarget('1.45.0', '1.45.0', '1.46.0')).toEqual({
      target: '1.46.0',
      prereleaseStripped: false,
      versionMismatch: false,
    });
  });

  it('指定目标等于当前版本时报错', () => {
    expect(() => resolveTarget('1.45.0', '1.45.0', '1.45.0')).toThrow();
  });

  it('package.json 与 Cargo.toml 版本不一致时标记 mismatch', () => {
    expect(resolveTarget('1.45.0', '1.44.9', '')).toEqual({
      target: '1.45.1',
      prereleaseStripped: false,
      versionMismatch: true,
    });
  });
});

describe('CLI 端到端', () => {
  const { spawnSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  const PACKAGE_FIXTURE = '{\n  "name": "aibuddy-app",\n  "version": "1.45.0"\n}\n';
  const CARGO_FIXTURE = '[workspace]\nmembers = ["crates/*"]\n\n[workspace.package]\nversion = "1.45.0"\n';

  // 在临时目录复刻脚本的相对布局：<root>/a/b/scripts/bump-build-version.js
  // （脚本经 __dirname 定位 <root>/a/b/package.json 与 <root>/Cargo.toml，与真实
  //  ui/desktop/scripts → ui/desktop/package.json、仓库根 Cargo.toml 的层级一致）
  function buildSandbox() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-ver-'));
    const scriptsDir = path.join(root, 'a', 'b', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'bump-build-version.js'), path.join(scriptsDir, 'bump-build-version.js'));
    fs.writeFileSync(path.join(root, 'a', 'b', 'package.json'), PACKAGE_FIXTURE);
    fs.writeFileSync(path.join(root, 'Cargo.toml'), CARGO_FIXTURE);
    return root;
  }

  function runCli(root, ...args) {
    return spawnSync(process.execPath, [path.join(root, 'a', 'b', 'scripts', 'bump-build-version.js'), ...args], {
      encoding: 'utf8',
    });
  }

  afterEach(() => {
    // 沙箱留在 os.tmpdir()，由系统临时目录清理机制回收，测试内不主动删除
  });

  it('--patch 递增两文件并输出单行 JSON', () => {
    const root = buildSandbox();
    const result = runCli(root, '--patch');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      oldVersion: '1.45.0',
      cargoOldVersion: '1.45.0',
      newVersion: '1.45.1',
      prereleaseStripped: false,
      versionMismatch: false,
    });
    expect(fs.readFileSync(path.join(root, 'a', 'b', 'package.json'), 'utf8')).toContain('"version": "1.45.1"');
    expect(fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8')).toContain('version = "1.45.1"');
  });

  it('--target 写入指定版本', () => {
    const root = buildSandbox();
    const result = runCli(root, '--target=1.46.0');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim()).newVersion).toBe('1.46.0');
    expect(fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8')).toContain('version = "1.46.0"');
  });

  it('--target 等于当前版本时失败', () => {
    const root = buildSandbox();
    const result = runCli(root, '--target=1.45.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('相同');
  });

  it('--target 非 semver 时失败', () => {
    const root = buildSandbox();
    const result = runCli(root, '--target=abc');
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).not.toBe('');
  });

  it('--patch 与 --target 同时给出时失败', () => {
    const root = buildSandbox();
    const result = runCli(root, '--patch', '--target=1.46.0');
    expect(result.status).toBe(1);
  });

  it('无参数时失败', () => {
    const root = buildSandbox();
    const result = runCli(root);
    expect(result.status).toBe(1);
  });
});

describe('runCli 注入式调用（进程内覆盖 CLI 分支）', () => {
  const PACKAGE_FIXTURE = '{\n  "name": "aibuddy-app",\n  "version": "1.45.0"\n}\n';
  const CARGO_FIXTURE = '[workspace.package]\nversion = "1.45.0"\n';

  // 构造内存 IO：files 为路径到内容的映射，记录输出与失败信息
  function buildIo(files) {
    const written = {};
    const outputs = [];
    const failures = [];
    return {
      io: {
        files,
        written,
        read: (file) => {
          if (!(file in files)) throw new Error(`ENOENT: ${file}`);
          return files[file];
        },
        write: (file, content) => {
          written[file] = content;
        },
        out: (line) => outputs.push(line),
        fail: (msg) => {
          failures.push(msg);
          throw new Error(msg);
        },
      },
      outputs,
      failures,
    };
  }

  const PATHS = { packageJson: 'pkg.json', cargoToml: 'Cargo.toml' };

  it('patch 模式写回两文件并输出结果 JSON', () => {
    const { io, outputs } = buildIo({ [PATHS.packageJson]: PACKAGE_FIXTURE, [PATHS.cargoToml]: CARGO_FIXTURE });
    runCli(true, '', io, PATHS);
    expect(io.written[PATHS.packageJson]).toContain('"version": "1.45.1"');
    expect(io.written[PATHS.cargoToml]).toContain('version = "1.45.1"');
    expect(JSON.parse(outputs[0]).newVersion).toBe('1.45.1');
  });

  it('两文件版本不一致时结果 JSON 标记 mismatch', () => {
    const { io, outputs } = buildIo({
      [PATHS.packageJson]: PACKAGE_FIXTURE,
      [PATHS.cargoToml]: '[workspace.package]\nversion = "1.44.9"\n',
    });
    runCli(true, '', io, PATHS);
    expect(JSON.parse(outputs[0]).versionMismatch).toBe(true);
  });

  it('参数互斥冲突时失败', () => {
    const { io, failures } = buildIo({ [PATHS.packageJson]: PACKAGE_FIXTURE, [PATHS.cargoToml]: CARGO_FIXTURE });
    expect(() => runCli(true, '1.46.0', io, PATHS)).toThrow('参数错误');
    expect(failures[0]).toContain('参数错误');
  });

  it('未给任何模式时失败', () => {
    const { io, failures } = buildIo({ [PATHS.packageJson]: PACKAGE_FIXTURE, [PATHS.cargoToml]: CARGO_FIXTURE });
    expect(() => runCli(false, '', io, PATHS)).toThrow('参数错误');
  });

  it('读取文件失败时失败', () => {
    const { io, failures } = buildIo({});
    expect(() => runCli(true, '', io, PATHS)).toThrow('读取版本文件失败');
    expect(failures[0]).toContain('读取版本文件失败');
  });

  it('package.json 内容非法时失败', () => {
    const { io, failures } = buildIo({
      [PATHS.packageJson]: '{ not valid json',
      [PATHS.cargoToml]: CARGO_FIXTURE,
    });
    expect(() => runCli(true, '', io, PATHS)).toThrow('package.json 解析失败');
    expect(failures[0]).toContain('package.json 解析失败');
  });

  it('Cargo.toml 缺少 version 字段时失败', () => {
    const { io, failures } = buildIo({
      [PATHS.packageJson]: PACKAGE_FIXTURE,
      [PATHS.cargoToml]: '[workspace.package]\nedition = "2021"\n',
    });
    expect(() => runCli(true, '', io, PATHS)).toThrow('未找到');
    expect(failures[0]).toContain('[workspace.package]');
  });

  it('target 等于当前版本时失败', () => {
    const { io, failures } = buildIo({ [PATHS.packageJson]: PACKAGE_FIXTURE, [PATHS.cargoToml]: CARGO_FIXTURE });
    expect(() => runCli(false, '1.45.0', io, PATHS)).toThrow('相同');
    expect(failures[0]).toContain('相同');
  });

  it('写回失败时失败', () => {
    const { io, failures } = buildIo({ [PATHS.packageJson]: PACKAGE_FIXTURE, [PATHS.cargoToml]: CARGO_FIXTURE });
    io.write = () => {
      throw new Error('disk full');
    };
    expect(() => runCli(true, '', io, PATHS)).toThrow('写回版本文件失败');
    expect(failures[0]).toContain('写回版本文件失败');
  });
});
