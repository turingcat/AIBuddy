/**
 * Provider smoke tests — code execution mode (JS batching).
 *
 * Each available (non-agentic) provider/model pair gets its own test that
 * spawns `heybuddy run` with the memory + code_execution builtins and validates
 * that the code_execution tool was invoked.
 */

import { beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHeyBuddy, discoverTestCases, runHeyBuddy, providerTest } from './test_providers_lib';

const BUILTINS = 'memory,code_execution';

let heybuddyBin: string;

beforeAll(() => {
  heybuddyBin = buildHeyBuddy();
});

const { testAll } = providerTest(discoverTestCases({ skipAgentic: true }));

// Matches: "execute_typescript | code_execution", "get_function_details | code_execution",
//           "tool call | execute", "tool calls | execute" (old format)
//           "▸ execute N tool call" (new format with tool_graph)
//           "▸ execute_typescript" (plain tool name in output)
const codeExecPattern =
  /(execute_typescript \| code_execution)|(get_function_details \| code_execution)|(tool calls? \| execute)|(▸.*execute.*tool call)|(▸ execute_typescript)/;

testAll('invokes code_execution tool', async (tc, { expect }) => {
  const testdir = fs.mkdtempSync(path.join(os.tmpdir(), 'heybuddy-codeexec-'));
  try {
    const output = await runHeyBuddy(
      heybuddyBin,
      testdir,
      "Store a memory with category 'test' and data 'hello world', then retrieve all memories from category 'test'.",
      BUILTINS,
      { HEYBUDDY_PROVIDER: tc.provider, HEYBUDDY_MODEL: tc.model },
      55_000,
      (output) => codeExecPattern.test(output)
    );

    expect(
      codeExecPattern.test(output),
      `Expected code_execution tool to be called\n\nFull output:\n${output}`
    ).toBe(true);
  } finally {
    fs.rmSync(testdir, { recursive: true, force: true });
  }
});
