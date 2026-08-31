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
  /** 该 API Key 所属分组；订阅型分组据此匹配日限额，缺失时按计量余额展示 */
  groupId?: string;
}
