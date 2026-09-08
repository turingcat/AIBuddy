import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { gitRepositoryRoot, inventoryGitTree, writeInventoryReport } from './src/inventory.mjs';

const COMMANDS = {
  inventory: { '--source-ref': 'sourceRef', '--report-dir': 'reportDir' },
  generate: { '--source-ref': 'sourceRef', '--output': 'outputDir', '--input': 'input' },
  verify: { '--output': 'outputDir' },
};

export function parseCommand(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) return { command: 'help' };
  const [command, ...rest] = args;
  if (!Object.hasOwn(COMMANDS, command)) throw new Error(`unknown command: ${command}`);
  if (rest.length === 1 && rest[0] === '--help') return { command: 'help' };
  const options = { command };
  for (let i = 0; i < rest.length; i += 2) {
    if (!Object.hasOwn(COMMANDS[command], rest[i])) throw new Error(`unknown argument: ${rest[i]}`);
    const key = COMMANDS[command][rest[i]];
    const value = rest[i + 1];
    if (!key || Object.hasOwn(options, key)) throw new Error(`unknown or repeated argument: ${rest[i]}`);
    if (!value || value.startsWith('-')) throw new Error(`missing value: ${rest[i]}`);
    options[key] = value;
  }
  for (const key of Object.values(COMMANDS[command])) {
    if (key !== 'input' && !options[key]) throw new Error(`${command} requires ${key}`);
  }
  if (command === 'generate') {
    options.input ??= 'product';
    if (!['product', 'upstream'].includes(options.input)) throw new Error('input must be product or upstream');
  }
  return options;
}

export function snapshotSummary({ outputDir, provenance, valid }) {
  return {
    outputDir, valid, source: provenance.source,
    inputDigest: provenance.inputDigest, outputDigest: provenance.outputDigest,
    entryCount: provenance.entries.length,
    provenanceFile: resolve(outputDir, '.aibuddy-rebrand.json'),
  };
}

export async function main(args = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseCommand(args);
  if (options.command === 'help') {
    process.stdout.write([
      'Usage:',
      '  node tools/aibuddy-rebrand/cli.mjs inventory --source-ref <ref> --report-dir <directory>',
      '  node tools/aibuddy-rebrand/cli.mjs generate --source-ref <ref> --output <new-directory> [--input product|upstream]',
      '  node tools/aibuddy-rebrand/cli.mjs verify --output <generated-directory>',
      '',
    ].join('\n'));
    return;
  }
  if (options.command === 'inventory') {
    const report = inventoryGitTree({ cwd, sourceRef: options.sourceRef });
    const reportPath = writeInventoryReport(resolve(cwd, options.reportDir), report, { sourceRoot: gitRepositoryRoot(cwd) });
    process.stdout.write(`${reportPath}\n`);
    return;
  }
  if (options.command === 'verify') {
    const { verifySnapshot } = await import('./src/verify.mjs');
    const result = await verifySnapshot(resolve(cwd, options.outputDir));
    process.stdout.write(`${JSON.stringify(snapshotSummary(result), null, 2)}\n`);
    return;
  }
  const { generateSnapshot } = await import('./src/generate.mjs');
  const { transformSnapshot } = await import('./src/transform.mjs');
  const { formatSnapshot } = await import('./src/format.mjs');
  const { toolIdentity } = await import('./src/tool-identity.mjs');
  const result = await generateSnapshot({
    cwd,
    sourceRef: options.sourceRef,
    outputDir: resolve(cwd, options.outputDir),
    transformIdentity: await toolIdentity(options.input),
    transform: async (entries) => {
      const transformed = await transformSnapshot(entries, { input: options.input });
      if (!Array.isArray(transformed.report?.unresolved)) throw new Error('transform must report unresolved entries explicitly');
      if (transformed.report.unresolved.length > 0) {
        throw new Error(`conversion blocked by unresolved entries: ${JSON.stringify(transformed.report.unresolved)}`);
      }
      const formatted = formatSnapshot(transformed.entries, {
        paths: transformed.report.entries
          .filter((entry) => entry.adapter === 'rust' && entry.disposition === 'transformed')
          .map((entry) => entry.outputPath),
      });
      return {
        entries: formatted.entries,
        report: { ...transformed.report, formatting: formatted.report },
      };
    },
  });
  const { verifySnapshot } = await import('./src/verify.mjs');
  process.stdout.write(`${JSON.stringify(snapshotSummary(await verifySnapshot(result.outputDir)), null, 2)}\n`);
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
