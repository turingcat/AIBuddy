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
  'test',
  '__snapshots__',
  '__tests__',
]);

const PRODUCT_PATTERNS = [
  { pattern: 'ai.linyeyun.cn', matches: (content) => content.includes('ai.linyeyun.cn') },
  { pattern: 'HEYBUDDY_AUTH_API_BASE_URL', matches: (content) => content.includes('HEYBUDDY_AUTH_API_BASE_URL') },
  { pattern: 'APP_EDITION conditional', matches: (content) => content.includes('APP_EDITION') },
];

function isIgnoredPath(file) {
  return file.split(path.sep).some((part) => IGNORED_DIRECTORIES.has(part))
    || path.basename(file) === 'check-product-boundary.js'
    || /\.(test|spec)\.[^.]+$/.test(file);
}

function listFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files = [];
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
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

function desktopConfigurationFiles(repositoryRoot) {
  const desktopRoot = path.join(repositoryRoot, 'ui', 'desktop');
  if (!fs.existsSync(desktopRoot)) {
    return [];
  }

  return fs.readdirSync(desktopRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(desktopRoot, entry.name))
    .filter((file) => /(^|\/)(package\.json|.*\.config\.[^.]+|.*\.env(?:\.[^.]+)?|.*\.d\.ts)$/.test(file))
    .sort((left, right) => left.localeCompare(right));
}

function activeProductFiles(repositoryRoot) {
  const roots = [
    path.join(repositoryRoot, 'ui', 'desktop', 'src'),
    path.join(repositoryRoot, 'ui', 'desktop', 'scripts'),
    path.join(repositoryRoot, 'ui', 'desktop', 'branding'),
    path.join(repositoryRoot, 'branding'),
    path.join(repositoryRoot, 'crates', 'goose-providers'),
  ];

  return [...new Set([
    ...roots.flatMap(listFiles),
    ...desktopConfigurationFiles(repositoryRoot),
  ])].sort((left, right) => left.localeCompare(right));
}

function findProductBoundaryViolations(rootDir) {
  const repositoryRoot = path.resolve(rootDir);

  return activeProductFiles(repositoryRoot).flatMap((file) => {
    const relativeFile = path.relative(repositoryRoot, file).split(path.sep).join('/');
    const content = fs.readFileSync(file, 'utf8');
    const violations = PRODUCT_PATTERNS
      .filter(({ matches }) => matches(content))
      .map(({ pattern }) => ({ file: relativeFile, pattern }));

    if (relativeFile === 'crates/goose-providers/src/declarative/definitions/heybuddy.json') {
      violations.push({ file: relativeFile, pattern: 'bundled heybuddy provider definition' });
    }

    return violations;
  }).sort((left, right) => left.file.localeCompare(right.file) || left.pattern.localeCompare(right.pattern));
}

if (require.main === module) {
  const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  const violations = findProductBoundaryViolations(repositoryRoot);
  if (violations.length > 0) {
    process.stderr.write(`${violations.map(({ file, pattern }) => `${file}: ${pattern}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}

module.exports = { findProductBoundaryViolations };
