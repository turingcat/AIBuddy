export type SiteKind = 'oa' | 'sub2api';

export interface SiteAccountIdentity {
  email?: string;
}

export interface SiteTarget {
  id: string;
  name: string;
}

export interface GatewayCredentials {
  providerId: string;
  baseUrl: string;
  apiKey: string;
}
