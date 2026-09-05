export const GOOSE_NOSTR_PROTOCOL_PREFIX = 'goose://sessions/nostr';

export function isNostrSessionLink(link: string): boolean {
  try {
    const url = new URL(link);
    return (
      url.protocol === 'goose:' &&
      url.host.toLowerCase() === 'sessions' &&
      url.pathname === '/nostr' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export function getNostrImportPlaceholder(): string {
  return `${GOOSE_NOSTR_PROTOCOL_PREFIX}?nevent=...&key=...`;
}
