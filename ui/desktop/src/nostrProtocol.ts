export const AIBUDDY_NOSTR_PROTOCOL_PREFIX = 'aibuddy://sessions/nostr';

export function isNostrSessionLink(link: string): boolean {
  try {
    const url = new URL(link);
    return (
      url.protocol === 'aibuddy:' &&
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
  return `${AIBUDDY_NOSTR_PROTOCOL_PREFIX}?nevent=...&key=...`;
}
