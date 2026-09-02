export const GOOSE_NOSTR_PROTOCOL_PREFIX = 'goose://sessions/nostr';

export function isNostrSessionLink(link: string): boolean {
  return link.startsWith(GOOSE_NOSTR_PROTOCOL_PREFIX);
}

export function getNostrImportPlaceholder(): string {
  return `${GOOSE_NOSTR_PROTOCOL_PREFIX}?nevent=...&key=...`;
}
