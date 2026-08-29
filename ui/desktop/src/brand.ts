import brands from '../branding/brands.json';

export type AppEdition = keyof typeof brands;

export function getAppEdition(): AppEdition {
  const edition = process.env.APP_EDITION;
  if (!edition || !Object.hasOwn(brands, edition)) {
    throw new Error(`Invalid APP_EDITION ${JSON.stringify(edition)}`);
  }
  return edition as AppEdition;
}
