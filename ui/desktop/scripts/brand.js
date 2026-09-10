const brand = Object.freeze({ ...require('../branding/brands.json') });

function resolveBrand() {
  return brand;
}

function runCli([field]) {
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
