import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('AIBuddy recipe deeplinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates the AIBuddy scheme', async () => {
    await expect(generateDeepLink(recipe)).resolves.toBe('aibuddy://recipe?config=ENCODED');
  });

  it('accepts the AIBuddy scheme', async () => {
    await expect(parseDeeplink('aibuddy://recipe?config=ENCODED')).resolves.toMatchObject({
      title: 'T',
    });
  });

  it('rejects the legacy Goose scheme before decoding it', async () => {
    await expect(parseDeeplink('goose://recipe?config=ENCODED')).resolves.toBeNull();
    expect(acpDecodeRecipe).not.toHaveBeenCalled();
  });
});
