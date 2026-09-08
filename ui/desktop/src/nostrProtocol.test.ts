import { describe, expect, it } from 'vitest';
import {
  getNostrImportPlaceholder,
  GOOSE_NOSTR_PROTOCOL_PREFIX,
  isNostrSessionLink,
} from './nostrProtocol';

describe('Nostr session protocol', () => {
  it('uses the generic Goose session prefix', () => {
    expect(GOOSE_NOSTR_PROTOCOL_PREFIX).toBe('goose://sessions/nostr');
    expect(getNostrImportPlaceholder()).toBe('goose://sessions/nostr?nevent=...&key=...');
  });

  it.each([
    ['goose://sessions/nostr?nevent=test&key=secret', true],
    ['aibuddy://sessions/nostr?nevent=test&key=secret', false],
    ['goose://recipe?url=https://example.com/recipe.yaml', false],
    ['goose://sessions/nostr-extra?nevent=test&key=secret', false],
    ['goose://sessions/nostr/extra?nevent=test&key=secret', false],
  ])('classifies %s', (link, expected) => {
    expect(isNostrSessionLink(link)).toBe(expected);
  });
});
