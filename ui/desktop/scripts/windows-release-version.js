const RELEASE_VERSION_PATTERN =
  /^(\d+\.\d+\.\d+)-b(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])([0-5]\d)$/;

function resolveWindowsVersion(input, now = new Date()) {
  const version = input.replace(/^v/, '');
  if (RELEASE_VERSION_PATTERN.test(version) && !version.includes('\n')) return version;
  if (!/^\d+\.\d+\.\d+$/.test(version) || version.includes('\n')) {
    throw new Error(`Invalid Windows release version: ${JSON.stringify(input)}`);
  }
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const stamp = [
    shanghai.getUTCMonth() + 1,
    shanghai.getUTCDate(),
    shanghai.getUTCHours(),
    shanghai.getUTCMinutes(),
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join('');
  return `${version}-b${stamp}`;
}

if (require.main === module) {
  const fs = require('node:fs');
  const version = resolveWindowsVersion(
    process.env.INPUT_VERSION || require('../package.json').version
  );
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  fs.writeFileSync('README', `VERSION=V${version}`);
}

module.exports = { RELEASE_VERSION_PATTERN, resolveWindowsVersion };
