import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAIBuddyServeEnv } from './aibuddyServeEnv';

describe('buildAIBuddyServeEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps AIBuddy credentials to only AIBuddy provider variables', () => {
    vi.stubEnv('AIBUDDY_PATH_ROOT', '/shared/aibuddy');

    expect(
      buildAIBuddyServeEnv(
        {
          token: 'tflow-token',
          baseUrl: 'https://tflow.online/v1',
          apiKey: 'sk-aibuddy',
          authKind: 'sub2api',
        },
        '/tmp/Application Support/AIBuddy/aibuddy'
      )
    ).toEqual({
      AIBUDDY_BASE_URL: 'https://tflow.online/v1',
      AIBUDDY_API_KEY: 'sk-aibuddy',
      AIBUDDY_PROVIDER: 'aibuddy',
      AIBUDDY_PATH_ROOT: '/tmp/Application Support/AIBuddy/aibuddy',
    });
  });

  it('selects the AIBuddy provider when credentials are absent', () => {
    expect(buildAIBuddyServeEnv(null, '/tmp/Application Support/AIBuddy/aibuddy')).toEqual({
      AIBUDDY_PROVIDER: 'aibuddy',
      AIBUDDY_PATH_ROOT: '/tmp/Application Support/AIBuddy/aibuddy',
    });
  });
});
