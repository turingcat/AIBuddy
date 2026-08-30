import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeRecipe as acpDecodeRecipe } from '../acp/recipe';
import { generateDeepLink, parseDeeplink } from './index';
import type { Recipe } from './index';

vi.mock('../acp/recipe', () => ({
  encodeRecipe: vi.fn(async () => 'ENCODED'),
  decodeRecipe: vi.fn(async () => ({ title: 'T', description: 'D', instructions: 'I' })),
  parseRecipe: vi.fn(),
  scanRecipe: vi.fn(),
}));

const recipe = { title: 'T', description: 'D' } as Recipe;

// Each edition registers only its own URL scheme with the OS, so emitting or
// accepting the other edition's scheme would hand the user's recipe to the
// wrong installed app.
describe.each([
  { edition: 'heybuddy', own: 'goose', foreign: 'aibuddy' },
  { edition: 'aibuddy', own: 'aibuddy', foreign: 'goose' },
])('recipe deeplinks for $edition', ({ edition, own, foreign }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_EDITION', edition);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('generates links on its own scheme', async () => {
    await expect(generateDeepLink(recipe)).resolves.toBe(`${own}://recipe?config=ENCODED`);
  });

  it('parses links on its own scheme', async () => {
    await expect(parseDeeplink(`${own}://recipe?config=ENCODED`)).resolves.toMatchObject({
      title: 'T',
    });
  });

  it('rejects links on the other edition scheme before decoding them', async () => {
    await expect(parseDeeplink(`${foreign}://recipe?config=ENCODED`)).resolves.toBeNull();
    expect(acpDecodeRecipe).not.toHaveBeenCalled();
  });
});
