import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGooseServeEnv } from './gooseServeEnv';

describe('buildGooseServeEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps AIBuddy credentials to only AIBuddy provider variables', () => {
    vi.stubEnv('GOOSE_PATH_ROOT', '/shared/heybuddy');

    expect(
      buildGooseServeEnv(
        {
          token: 'tflow-token',
          baseUrl: 'https://tflow.online/v1',
          apiKey: 'sk-aibuddy',
          authKind: 'sub2api',
        },
        '/tmp/Application Support/AIBuddy/goose'
      )
    ).toEqual({
      AIBUDDY_BASE_URL: 'https://tflow.online/v1',
      AIBUDDY_API_KEY: 'sk-aibuddy',
      GOOSE_PROVIDER: 'aibuddy',
      GOOSE_PATH_ROOT: '/tmp/Application Support/AIBuddy/goose',
    });
  });

  it('returns no provider variables when credentials are absent', () => {
    expect(buildGooseServeEnv(null, '/tmp/Application Support/AIBuddy/goose')).toEqual({
      GOOSE_PATH_ROOT: '/tmp/Application Support/AIBuddy/goose',
    });
  });
});
