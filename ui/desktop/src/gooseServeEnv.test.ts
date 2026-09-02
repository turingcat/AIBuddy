import { describe, expect, it } from 'vitest';
import { buildGooseServeEnv } from './gooseServeEnv';

describe('buildGooseServeEnv', () => {
  it('maps AIBuddy credentials to only AIBuddy provider variables', () => {
    expect(
      buildGooseServeEnv({
        token: 'tflow-token',
        baseUrl: 'https://tflow.online/v1',
        apiKey: 'sk-aibuddy',
        authKind: 'sub2api',
      })
    ).toEqual({
      AIBUDDY_BASE_URL: 'https://tflow.online/v1',
      AIBUDDY_API_KEY: 'sk-aibuddy',
      GOOSE_PROVIDER: 'aibuddy',
    });
  });

  it('returns no provider variables when credentials are absent', () => {
    expect(buildGooseServeEnv(null)).toEqual({});
  });
});
