import { describe, expect, it } from 'vitest';
import {
  findInboundProtocolUrl,
  getInboundProtocolSchemes,
  parseInboundProtocolUrl,
} from './protocolRouting';

describe('desktop inbound protocol routing', () => {
  it('registers the AIBuddy product scheme and AIBuddy Nostr compatibility scheme', () => {
    expect(getInboundProtocolSchemes()).toEqual(['aibuddy', 'aibuddy']);
  });

  it.each(['aibuddy://recipe?config=test', 'aibuddy://extension?name=test'])(
    'accepts product route %s',
    (url) => {
      expect(parseInboundProtocolUrl(url)?.url).toBe(url);
    }
  );

  it('canonicalizes the compatible AIBuddy Nostr route for the renderer', () => {
    expect(parseInboundProtocolUrl('GoOsE://SESSIONS/nostr?nevent=test&key=secret')?.url).toBe(
      'aibuddy://sessions/nostr?nevent=test&key=secret'
    );
  });

  it.each([
    'aibuddy://recipe?config=test',
    'aibuddy://extension?name=test',
    'aibuddy://sessions/nostr-extra?nevent=test',
    'aibuddy://sessions/nostr/extra?nevent=test',
    'https://sessions/nostr?nevent=test',
    'not a URL',
  ])('rejects non-Nostr compatibility route %s', (url) => {
    expect(parseInboundProtocolUrl(url)).toBeNull();
  });

  it.each(['win32', 'linux'])('finds accepted %s command-line routes', (_platform) => {
    expect(
      findInboundProtocolUrl([
        'AIBuddy',
        'aibuddy://recipe?config=ignored',
        'aibuddy://sessions/nostr?nevent=test&key=secret',
      ])?.url
    ).toBe('aibuddy://sessions/nostr?nevent=test&key=secret');
  });

  it('uses the same allowlist for macOS open-url input', () => {
    expect(parseInboundProtocolUrl('aibuddy://extension?name=ignored')).toBeNull();
    expect(parseInboundProtocolUrl('aibuddy://sessions/nostr?nevent=test')?.parsedUrl.pathname).toBe(
      '/nostr'
    );
  });
});
