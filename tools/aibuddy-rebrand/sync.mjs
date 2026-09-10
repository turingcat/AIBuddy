import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applySnapshotSync, checkSyncHistory, prepareSnapshotSync, recordSnapshotSync } from './src/snapshot-sync.mjs';

const COMMANDS = {
  prepare: { '--previous': 'previousSnapshot', '--next': 'nextSnapshot', '--output': 'outputDir' },
  apply: { '--plan': 'planDir' },
  record: { '--plan': 'planDir' },
  'check-history': { '--base': 'base' },
};

export function parseSyncCommand(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) return { command: 'help' };
  const [command, ...rest] = args;
  if (!Object.hasOwn(COMMANDS, command)) throw new Error(`unknown sync command: ${command}`);
  if (rest.length === 1 && rest[0] === '--help') return { command: 'help' };
  const options = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!Object.hasOwn(COMMANDS[command], flag)) throw new Error(`unknown sync argument: ${flag}`);
    const name = COMMANDS[command][flag];
    const value = rest[index + 1];
    if (Object.hasOwn(options, name) || !value || value.startsWith('-')) throw new Error(`invalid sync argument: ${flag}`);
    options[name] = value;
  }
  for (const name of Object.values(COMMANDS[command])) {
    if (!Object.hasOwn(options, name)) throw new Error(`missing sync argument: ${name}`);
  }
  return options;
}

export async function main(args = process.argv.slice(2), cwd = process.cwd()) {
  const { command, ...options } = parseSyncCommand(args);
  if (command === 'help') {
    process.stdout.write([
      'Snapshot synchronization: trees and patches only; never imports upstream commit ancestry.',
      'node tools/aibuddy-rebrand/sync.mjs prepare --previous <verified-snapshot> --next <verified-snapshot> --output <new-external-directory>',
      'node tools/aibuddy-rebrand/sync.mjs apply --plan <review-directory>',
      'node tools/aibuddy-rebrand/sync.mjs record --plan <review-directory>',
      'node tools/aibuddy-rebrand/sync.mjs check-history --base <product-base>',
      '',
    ].join('\n'));
    return;
  }
  const handlers = { prepare: prepareSnapshotSync, apply: applySnapshotSync, record: recordSnapshotSync, 'check-history': checkSyncHistory };
  const result = await handlers[command]({ cwd, ...options });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status === 'conflicts') process.exitCode = 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
