import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAIBuddyServe } from './aibuddyServe';
import { buildAIBuddyServeEnv } from './aibuddyServeEnv';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibuddy-provider-boundary-'));
  tempDirs.push(tempDir);
  return tempDir;
}

async function readFileWhenReady(filePath: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8').trim();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

describe('embedded AIBuddy provider process boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')(
    'overwrites a hostile inherited provider without credentials or parent mutation',
    async () => {
      const tempDir = makeTempDir();
      const providerFile = path.join(tempDir, 'provider.txt');
      const aibuddyPath = path.join(tempDir, 'aibuddy');
      fs.writeFileSync(
        aibuddyPath,
        [
          '#!/usr/bin/env sh',
          'printf "%s\\n" "$AIBUDDY_PROVIDER" > "$TEST_PROVIDER_FILE"',
          'while true; do sleep 1; done',
          '',
        ].join('\n')
      );
      fs.chmodSync(aibuddyPath, 0o755);
      vi.stubEnv('AIBUDDY_BINARY', aibuddyPath);
      vi.stubEnv('AIBUDDY_PROVIDER', 'aibuddy');

      const result = await startAIBuddyServe({
        serverSecret: 'test-secret',
        dir: tempDir,
        env: {
          ...buildAIBuddyServeEnv(null, '/tmp/Application Support/AIBuddy/aibuddy'),
          TEST_PROVIDER_FILE: providerFile,
        },
        readinessFetch: vi.fn(async () => new Response(null, { status: 200 })),
      });

      try {
        expect(await readFileWhenReady(providerFile)).toBe('aibuddy');
        expect(process.env.AIBUDDY_PROVIDER).toBe('aibuddy');
      } finally {
        await result.cleanup();
      }
    }
  );
});
