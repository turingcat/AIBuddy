const semver = require('semver');
const { engines } = require('../package.json');

function checkNodeVersion(version = process.version, range = engines.node) {
  if (!semver.valid(semver.coerce(version))) {
    throw new Error(`Unrecognized Node version ${version}`);
  }

  if (!semver.satisfies(version, range)) {
    throw new Error(
      `Node ${version} cannot build this app; ${range} is required.\n` +
        `Node 26 exits silently while unpacking Electron and deletes the previous package.\n` +
        `Use the pinned toolchain, e.g. \`source bin/activate-hermit\` from the repo root.`
    );
  }
}

if (require.main === module) {
  try {
    checkNodeVersion();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { checkNodeVersion };
