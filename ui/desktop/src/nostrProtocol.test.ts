import { describe, expect, it } from 'vitest';
import {
  getNostrImportPlaceholder,
  AIBUDDY_NOSTR_PROTOCOL_PREFIX,
  isNostrSessionLink,
} from './nostrProtocol';

describe('Nostr session protocol', () => {
  it('uses the generic AIBuddy session prefix', () => {
    expect(AIBUDDY_NOSTR_PROTOCOL_PREFIX).toBe('aibuddy://sessions/nostr');
    expect(getNostrImportPlaceholder()).toBe('aibuddy://sessions/nostr?nevent=...&key=...');
  });

  it.each([
    ['aibuddy://sessions/nostr?nevent=test&key=secret', true],
    ['aibuddy://sessions/nostr?nevent=test&key=secret', false],
    ['aibuddy://recipe?url=https://example.com/recipe.yaml', false],
    ['aibuddy://sessions/nostr-extra?nevent=test&key=secret', false],
    ['aibuddy://sessions/nostr/extra?nevent=test&key=secret', false],
  ])('classifies %s', (link, expected) => {
    expect(isNostrSessionLink(link)).toBe(expected);
  });
});
