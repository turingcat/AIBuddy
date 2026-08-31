import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeAppIdentity } from './appIdentity';

describe('initializeAppIdentity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets AIBuddy name before userData', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');
    const calls: string[] = [];
    const app = {
      setName: (name: string) => calls.push(`setName:${name}`),
      getPath: (name: 'userData') => {
        calls.push(`getPath:${name}`);
        return '/tmp/Application Support/AIBuddy';
      },
    };

    expect(initializeAppIdentity(app)).toMatchObject({
      settingsFile: '/tmp/Application Support/AIBuddy/settings.json',
      credentialsFile: '/tmp/Application Support/AIBuddy/credentials.json',
    });
    expect(calls.slice(0, 2)).toEqual(['setName:AIBuddy', 'getPath:userData']);
  });

  it('uses HeyBuddy without changing its path family', () => {
    vi.stubEnv('APP_EDITION', 'heybuddy');
    const calls: string[] = [];
    const app = {
      setName: (name: string) => calls.push(`setName:${name}`),
      getPath: (name: 'userData') => {
        calls.push(`getPath:${name}`);
        return '/tmp/Application Support/HeyBuddy';
      },
    };

    expect(initializeAppIdentity(app).userDataDir).toBe(
      '/tmp/Application Support/HeyBuddy',
    );
    expect(calls.slice(0, 2)).toEqual(['setName:HeyBuddy', 'getPath:userData']);
  });
});
