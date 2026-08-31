import { describe, expect, it, vi } from 'vitest';
import { fetchSub2apiAccount, fetchSub2apiModels } from './sub2apiAdapter';

describe('sub2apiAdapter', () => {
  it('derives the displayed account name from the TFlow email and returns its USD balance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, data: { email: 'alice@example.com', balance: 12.34 } }),
          { status: 200 }
        )
      );

    await expect(fetchSub2apiAccount('https://tflow.online', 'jwt', fetchMock)).resolves.toEqual({
      displayName: 'alice',
      balance: 12.34,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tflow.online/api/v1/auth/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer jwt' } })
    );
  });

  it('reads a non-empty OpenAI-compatible TFlow model catalog', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'glm-5' }, { id: 'qwen3' }] }), { status: 200 })
      );

    await expect(fetchSub2apiModels('https://tflow.online/v1', 'sk', fetchMock)).resolves.toEqual([
      { id: 'glm-5', providerId: 'aibuddy' },
      { id: 'qwen3', providerId: 'aibuddy' },
    ]);
  });
});
