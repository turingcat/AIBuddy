import { getAppProtocol } from './brand';
import { isNostrSessionLink } from './nostrProtocol';

export interface InboundProtocolUrl {
  url: string;
  parsedUrl: URL;
}

export function getInboundProtocolSchemes(): string[] {
  return [getAppProtocol(), 'goose'];
}

export function parseInboundProtocolUrl(value: string): InboundProtocolUrl | null {
  try {
    const parsedUrl = new URL(value);
    const isProductRoute =
      parsedUrl.protocol === `${getAppProtocol()}:` && parsedUrl.host.length > 0;
    if (!isProductRoute && !isNostrSessionLink(value)) return null;

    const url = `${parsedUrl.protocol.toLowerCase()}//${parsedUrl.host.toLowerCase()}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    return { url, parsedUrl: new URL(url) };
  } catch {
    return null;
  }
}

export function findInboundProtocolUrl(commandLine: readonly string[]): InboundProtocolUrl | null {
  for (const argument of commandLine) {
    const protocolUrl = parseInboundProtocolUrl(argument);
    if (protocolUrl) return protocolUrl;
  }
  return null;
}
