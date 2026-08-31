import { describe, expect, it, vi } from 'vitest';
import { AIBuddyPendingLoginStore } from './aibuddyPendingLogin';

describe('AIBuddyPendingLoginStore', () => {
  it('exposes only an opaque id and consumes a pending login once', () => {
    const store = new AIBuddyPendingLoginStore(() => 'pending-id');
    const pendingLoginId = store.create({
      accessToken: 'panel-jwt',
      settings: {
        aliyunCaptchaEnabled: true,
        aliyunCaptchaSceneId: 'scene',
        aliyunCaptchaPrefix: 'prefix',
        aliyunCaptchaRegion: 'cn',
        apiBaseUrl: 'https://tflow.online/v1',
      },
      groups: [{ id: 'team-a', name: 'Team A' }],
    });

    expect(pendingLoginId).toBe('pending-id');
    expect(store.consume('pending-id')).toMatchObject({
      accessToken: 'panel-jwt',
      groups: [{ id: 'team-a', name: 'Team A' }],
    });
    expect(store.consume('pending-id')).toBeNull();
  });

  it('expires pending logins before they can provision a group', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100);
    const store = new AIBuddyPendingLoginStore(() => 'pending-id', 1_000);
    store.create({
      accessToken: 'panel-jwt',
      settings: {
        aliyunCaptchaEnabled: true,
        aliyunCaptchaSceneId: 'scene',
        aliyunCaptchaPrefix: 'prefix',
        aliyunCaptchaRegion: 'cn',
        apiBaseUrl: 'https://tflow.online/v1',
      },
      groups: [],
    });

    now.mockReturnValue(1_101);
    expect(store.consume('pending-id')).toBeNull();
    now.mockRestore();
  });
});
