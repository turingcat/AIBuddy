/**
 * Provider smoke tests — normal mode (direct tool calls).
 *
 * Each available provider/model pair gets its own test that spawns `aibuddy run`
 * with the developer builtin, asks the model to read files via the shell tool,
 * and validates the output.
 */

import { beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAIBuddy, discoverTestCases, runAIBuddy, providerTest } from './test_providers_lib';

const BUILTINS = 'developer';
const TEST_CONTENT = 'test-content-abc123';

let aibuddyBin: string;
let testFile: string;

beforeAll(() => {
  aibuddyBin = buildAIBuddy();

  const targetDir = path.resolve(process.cwd(), '..', '..', 'target');
  fs.mkdirSync(targetDir, { recursive: true });
  testFile = path.join(targetDir, 'test-content.txt');
  fs.writeFileSync(testFile, TEST_CONTENT + '\n');
});

const { testAgentic, testNonAgentic } = providerTest(discoverTestCases());

testNonAgentic('reads files via shell tool', async (tc, { expect }) => {
  const testdir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibuddy-test-'));
  try {
    const tokenA = `smoke-alpha-${Math.floor(Math.random() * 32768)}`;
    const tokenB = `smoke-bravo-${Math.floor(Math.random() * 32768)}`;
    fs.writeFileSync(path.join(testdir, 'part-a.txt'), tokenA + '\n');
    fs.writeFileSync(path.join(testdir, 'part-b.txt'), tokenB + '\n');

    const output = await runAIBuddy(
      aibuddyBin,
      testdir,
      'Use the shell tool to cat ./part-a.txt and ./part-b.txt, then reply with ONLY the contents of both files, one per line, nothing else.',
      BUILTINS,
      { AIBUDDY_PROVIDER: tc.provider, AIBUDDY_MODEL: tc.model },
      55_000,
      (output) => {
        const shellToolPattern = /(shell \| developer)|(▸.*shell)/;
        return shellToolPattern.test(output) && output.includes(tokenA) && output.includes(tokenB);
      }
    );

    const shellToolPattern = /(shell \| developer)|(▸.*shell)/;
    expect(
      shellToolPattern.test(output),
      `Expected model to use shell tool\n\nFull output:\n${output}`
    ).toBe(true);
    expect(
      output,
      `Expected output to contain token from part-a.txt (${tokenA})\n\nFull output:\n${output}`
    ).toContain(tokenA);
    expect(
      output,
      `Expected output to contain token from part-b.txt (${tokenB})\n\nFull output:\n${output}`
    ).toContain(tokenB);
  } finally {
    fs.rmSync(testdir, { recursive: true, force: true });
  }
});

testAgentic('reads file contents', async (tc, { expect }) => {
  const testdir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibuddy-test-'));
  try {
    fs.copyFileSync(testFile, path.join(testdir, 'test-content.txt'));

    const output = await runAIBuddy(
      aibuddyBin,
      testdir,
      'read ./test-content.txt and output its contents exactly',
      BUILTINS,
      { AIBUDDY_PROVIDER: tc.provider, AIBUDDY_MODEL: tc.model }
    );

    expect(
      output.toLowerCase(),
      `Expected model output to contain "${TEST_CONTENT}"\n\nFull output:\n${output}`
    ).toContain(TEST_CONTENT.toLowerCase());
  } finally {
    fs.rmSync(testdir, { recursive: true, force: true });
  }
});
