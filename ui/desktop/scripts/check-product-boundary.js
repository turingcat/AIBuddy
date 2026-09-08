const fs = require('node:fs');
const path = require('node:path');

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'snapshots',
  'target',
  '__snapshots__',
]);

const ROOT_PRODUCT_FILES = ['Justfile', 'build-windows.ps1', 'dev-ui.ps1'];
const DESKTOP_PRODUCT_FILES = ['desktop-setup.iss', 'index.html'];
const REPOSITORY_CONTRACT_FILES = [
  '.github/workflows/bundle-macos.yml',
  '.github/workflows/bundle-windows.yml',
  '.github/workflows/canary.yml',
  '.github/workflows/publish-existing-release.yml',
  '.github/workflows/release-branches.yml',
  '.github/workflows/release.yml',
  'crates/aibuddy/src/agents/prompt_manager.rs',
  'scripts/test-release-workflows.rb',
  'scripts/test-supported-build-architectures.py',
];

const ALLOWED_VIOLATIONS = new Map([
  [
    'ui/desktop/scripts/check-product-boundary.js',
    new Set([
      'ai.linyeyun.cn',
      'AIBUDDY_AUTH_API_BASE_URL',
      'AIBuddy provider credential variable',
      'AIBuddy provider selection',
      'AIBuddy login copy',
      'AIBuddy welcome copy',
      'AIBuddy visible identity',
      'AIBuddy login component',
      'OA login route',
      'Company OA copy',
      'AIBuddy product identity',
      'OA login implementation or IPC identifier',
      'AIBuddy legacy migration identifier',
      'APP_EDITION active usage',
      'AIBuddy artifact or release name',
      'legacy installer icon',
      'AIBuddy prompt fallback identity',
    ]),
  ],
  [
    'ui/desktop/scripts/check-product-boundary.test.js',
    new Set([
      'ai.linyeyun.cn',
      'AIBUDDY_AUTH_API_BASE_URL',
      'AIBuddy provider credential variable',
      'AIBuddy provider selection',
      'AIBuddy login copy',
      'AIBuddy welcome copy',
      'AIBuddy visible identity',
      'AIBuddy login component',
      'OA login route',
      'Company OA copy',
      'AIBuddy product identity',
      'OA login implementation or IPC identifier',
      'AIBuddy legacy migration identifier',
      'APP_EDITION active usage',
      'AIBuddy artifact or release name',
      'legacy installer icon',
      'AIBuddy prompt fallback identity',
    ]),
  ],
  ['ui/desktop/scripts/brand.test.js', new Set(['APP_EDITION active usage'])],
  ['ui/desktop/scripts/bump-build-version.test.js', new Set(['AIBuddy product identity'])],
  ['ui/desktop/src/App.test.tsx', new Set(['AIBuddy product identity', 'AIBuddy welcome copy'])],
  ['ui/desktop/src/viteMainConfig.test.ts', new Set(['APP_EDITION active usage'])],
]);

const PRODUCT_PATTERNS = [
  { pattern: 'ai.linyeyun.cn', matches: (content) => content.includes('ai.linyeyun.cn') },
  {
    pattern: 'AIBUDDY_AUTH_API_BASE_URL',
    matches: (content) => content.includes('AIBUDDY_AUTH_API_BASE_URL'),
  },
  {
    pattern: 'AIBuddy provider credential variable',
    matches: (content) => /\bAIBUDDY_(?:API_KEY|BASE_URL)\b/.test(content),
  },
  {
    pattern: 'AIBuddy provider selection',
    matches: isAIBuddyProviderSelection,
  },
  {
    pattern: 'AIBuddy login copy',
    matches: (content) => /登录\s*AIBuddy|AIBuddy\s*(?:登录|login)\b/i.test(content),
  },
  {
    pattern: 'AIBuddy welcome copy',
    matches: (content) => /Welcome to\s+AIBuddy\b/i.test(content),
  },
  { pattern: 'AIBuddy visible identity', matches: isAIBuddyVisibleIdentity },
  {
    pattern: 'AIBuddy login component',
    matches: (content) => /\bAIBuddy(?:LoginForm|Login|Auth)\b/.test(content),
  },
  { pattern: 'OA login route', matches: (content) => /\blogin-via-oa\b/i.test(content) },
  { pattern: 'Company OA copy', matches: (content) => /公司\s*OA/i.test(content) },
  {
    pattern: 'AIBuddy product identity',
    matches: (content) =>
      /(?:^|[\s{,;:])['"]?(?:productName|product_name|appName|app_name|displayName|display_name)['"]?\s*(?::|=)\s*['"]?AIBuddy\b['"]?/im.test(
        content
      ),
  },
  {
    pattern: 'OA login implementation or IPC identifier',
    matches: (content) =>
      /\b(?:oaLogin|performOaLogin|runOaLogin|loginViaOA|OaLoginResult)\b/.test(content),
  },
  {
    pattern: 'AIBuddy legacy migration identifier',
    matches: (content) => /\b(?:migrateLegacyAIBuddyData|aibuddyDataMigration)\b/.test(content),
  },
  {
    pattern: 'AIBuddy artifact or release name',
    matches: (content) =>
      /(?:AIBuddy(?:\*|[-_][^\s"'`]*)?\.(?:zip|exe|app)\b|name:\s*AIBuddy(?:\s|\$))/i.test(
        content
      ),
  },
  {
    pattern: 'legacy installer icon',
    matches: (content) => /SetupIconFile\s*=\s*src[\\/]images[\\/]icon\.ico\b/i.test(content),
  },
  {
    pattern: 'AIBuddy prompt fallback identity',
    matches: (content) => /(?:You are|你是)\s*AIBuddy\b/i.test(content),
  },
  { pattern: 'APP_EDITION active usage', matches: isActiveEditionUsage },
];

function isIgnoredPath(file) {
  return file.split(path.sep).some((part) => IGNORED_DIRECTORIES.has(part));
}

function isAllowedViolation(relativeFile, pattern) {
  return ALLOWED_VIOLATIONS.get(relativeFile)?.has(pattern) ?? false;
}

function isAIBuddyProviderSelection(content) {
  return (
    /(?:^|[\s{,;:])['"]?AIBUDDY_PROVIDER['"]?\s*(?::|=)\s*['"]?aibuddy\b['"]?/im.test(content) ||
    /process\.env(?:\.AIBUDDY_PROVIDER|\[['"]AIBUDDY_PROVIDER['"]\])\s*=\s*['"]?aibuddy\b['"]?/i.test(
      content
    )
  );
}

function isAIBuddyVisibleIdentity(content) {
  return (
    /<(?:h[1-6]|title|span|p|div|button)\b[^>]*>\s*AIBuddy\s*</i.test(content) ||
    /(?:^|[\s{,;:])['"]?(?:assistantName|assistant_name)['"]?\s*(?::|=)\s*['"]?AIBuddy\b['"]?/im.test(
      content
    )
  );
}

function listFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files = [];
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (isIgnoredPath(file)) {
        continue;
      }
      if (entry.isDirectory()) {
        pending.push(file);
      } else if (entry.isFile()) {
        files.push(file);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function isActiveEditionUsage(content, file) {
  if (!/\.(?:[cm]?[jt]sx?|json)$/.test(file)) {
    return false;
  }

  const executableContent = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return /\bprocess\.env\.APP_EDITION\b|\$\{?APP_EDITION\}?/.test(executableContent);
}

function isDesktopConfigurationFile(file) {
  const normalizedFile = file.replace(/\\/g, '/');
  return /(^|\/)(package\.json|.*\.config\.[^.]+|.*\.env(?:\.[^.]+)?|.*\.d\.ts)$/.test(
    normalizedFile
  );
}

function desktopConfigurationFiles(repositoryRoot) {
  const desktopRoot = path.join(repositoryRoot, 'ui', 'desktop');
  if (!fs.existsSync(desktopRoot)) {
    return [];
  }

  return fs
    .readdirSync(desktopRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(desktopRoot, entry.name))
    .filter(isDesktopConfigurationFile)
    .sort((left, right) => left.localeCompare(right));
}

function rootProductFiles(repositoryRoot) {
  return ROOT_PRODUCT_FILES.map((file) => path.join(repositoryRoot, file)).filter((file) =>
    fs.existsSync(file)
  );
}

function desktopProductFiles(repositoryRoot) {
  const desktopRoot = path.join(repositoryRoot, 'ui', 'desktop');
  return DESKTOP_PRODUCT_FILES.map((file) => path.join(desktopRoot, file)).filter((file) =>
    fs.existsSync(file)
  );
}

function repositoryContractFiles(repositoryRoot) {
  return REPOSITORY_CONTRACT_FILES.map((file) => path.join(repositoryRoot, file)).filter((file) =>
    fs.existsSync(file)
  );
}

function activeProductFiles(repositoryRoot) {
  const roots = [
    path.join(repositoryRoot, 'ui', 'desktop', 'src'),
    path.join(repositoryRoot, 'ui', 'desktop', 'scripts'),
    path.join(repositoryRoot, 'ui', 'desktop', 'branding'),
    path.join(repositoryRoot, 'ui', 'desktop', 'announcements'),
    path.join(repositoryRoot, 'branding'),
    path.join(repositoryRoot, 'crates', 'aibuddy', 'src', 'prompts'),
    path.join(repositoryRoot, 'crates', 'aibuddy-providers'),
  ];

  return [
    ...new Set([
      ...roots.flatMap(listFiles),
      ...desktopConfigurationFiles(repositoryRoot),
      ...desktopProductFiles(repositoryRoot),
      ...rootProductFiles(repositoryRoot),
      ...repositoryContractFiles(repositoryRoot),
    ]),
  ].sort((left, right) => left.localeCompare(right));
}

function findProductBoundaryViolations(rootDir) {
  const repositoryRoot = path.resolve(rootDir);

  return activeProductFiles(repositoryRoot)
    .flatMap((file) => {
      const relativeFile = path.relative(repositoryRoot, file).split(path.sep).join('/');
      const content = fs.readFileSync(file, 'utf8');
      const violations = PRODUCT_PATTERNS.filter(({ matches }) => matches(content, file))
        .filter(({ pattern }) => !isAllowedViolation(relativeFile, pattern))
        .map(({ pattern }) => ({ file: relativeFile, pattern }));

      if (relativeFile === 'crates/aibuddy-providers/src/declarative/definitions/aibuddy.json') {
        violations.push({ file: relativeFile, pattern: 'bundled aibuddy provider definition' });
      }

      return violations;
    })
    .sort(
      (left, right) =>
        left.file.localeCompare(right.file) || left.pattern.localeCompare(right.pattern)
    );
}

if (require.main === module) {
  const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  const violations = findProductBoundaryViolations(repositoryRoot);
  if (violations.length > 0) {
    process.stderr.write(
      `${violations.map(({ file, pattern }) => `${file}: ${pattern}`).join('\n')}\n`
    );
    process.exitCode = 1;
  }
}

module.exports = { findProductBoundaryViolations, isDesktopConfigurationFile };
