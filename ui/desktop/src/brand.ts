import brands from '../branding/brands.json';

export type AppEdition = keyof typeof brands;

export function getAppEdition(): AppEdition {
  const edition = process.env.APP_EDITION;
  if (!edition || !Object.hasOwn(brands, edition)) {
    throw new Error(`Invalid APP_EDITION ${JSON.stringify(edition)}`);
  }
  return edition as AppEdition;
}

export function getAppDisplayName(): string {
  return brands[getAppEdition()].productName;
}

export function getAppIconStem(): string {
  return brands[getAppEdition()].iconStem;
}

export function getAppProtocol(): string {
  return brands[getAppEdition()].protocol;
}

export function getAppProtocolPrefix(): string {
  return `${getAppProtocol()}://`;
}
