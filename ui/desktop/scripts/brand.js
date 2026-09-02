const brands = require('../branding/brands.json');

const supportedEditions = Object.keys(brands);
const resolvedBrands = Object.fromEntries(
  Object.entries(brands).map(([edition, brand]) => [edition, Object.freeze({ ...brand })])
);

function resolveBrand(edition = process.env.APP_EDITION) {
  if (!edition || !Object.hasOwn(resolvedBrands, edition)) {
    throw new Error(
      `Invalid APP_EDITION ${JSON.stringify(edition)}; expected one of: ${supportedEditions.join(', ')}`
    );
  }

  return resolvedBrands[edition];
}

function runCli([edition, field]) {
  const brand = resolveBrand(edition);
  const value = brand[field];
  if (typeof value !== 'string') {
    throw new Error(`Unknown brand field ${JSON.stringify(field)}`);
  }
  process.stdout.write(`${value}\n`);
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { resolveBrand, runCli };
