import manifest from '../branding/brands.json';

export const appBrand = Object.freeze({ ...manifest });

export function getAppDisplayName(): string {
  return appBrand.productName;
}

export function getAppIconStem(): string {
  return appBrand.iconStem;
}

export function getAppTrayIconStem(): string {
  return `${getAppIconStem()}Template`;
}

export function getAppProtocol(): string {
  return appBrand.protocol;
}

export function getAppProtocolPrefix(): string {
  return `${getAppProtocol()}://`;
}
