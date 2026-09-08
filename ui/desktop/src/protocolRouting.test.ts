import { describe, expect, it } from 'vitest';
import {
  findInboundProtocolUrl,
  getInboundProtocolSchemes,
  parseInboundProtocolUrl,
} from './protocolRouting';

describe('desktop inbound protocol routing', () => {
  it('registers the AIBuddy product scheme and Goose Nostr compatibility scheme', () => {
    expect(getInboundProtocolSchemes()).toEqual(['aibuddy', 'goose']);
  });

  it.each(['aibuddy://recipe?config=test', 'aibuddy://extension?name=test'])(
    'accepts product route %s',
    (url) => {
      expect(parseInboundProtocolUrl(url)?.url).toBe(url);
    }
  );

  it('canonicalizes the compatible Goose Nostr route for the renderer', () => {
    expect(parseInboundProtocolUrl('GoOsE://SESSIONS/nostr?nevent=test&key=secret')?.url).toBe(
      'goose://sessions/nostr?nevent=test&key=secret'
    );
  });

  it.each([
    'goose://recipe?config=test',
    'goose://extension?name=test',
    'goose://sessions/nostr-extra?nevent=test',
    'goose://sessions/nostr/extra?nevent=test',
    'https://sessions/nostr?nevent=test',
    'not a URL',
  ])('rejects non-Nostr compatibility route %s', (url) => {
    expect(parseInboundProtocolUrl(url)).toBeNull();
  });

  it.each(['win32', 'linux'])('finds accepted %s command-line routes', (_platform) => {
    expect(
      findInboundProtocolUrl([
        'AIBuddy',
        'goose://recipe?config=ignored',
        'goose://sessions/nostr?nevent=test&key=secret',
      ])?.url
    ).toBe('goose://sessions/nostr?nevent=test&key=secret');
  });

  it('uses the same allowlist for macOS open-url input', () => {
    expect(parseInboundProtocolUrl('goose://extension?name=ignored')).toBeNull();
    expect(parseInboundProtocolUrl('goose://sessions/nostr?nevent=test')?.parsedUrl.pathname).toBe(
      '/nostr'
    );
  });
});
