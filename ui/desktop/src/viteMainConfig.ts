import brands from '../branding/brands.json';
import { resolveAuthApiBaseUrl } from './authConfig';
import type { AppEdition } from './brand';

export function createMainViteConfig(
  environment: Record<string, string | undefined>,
  edition: AppEdition
) {
  const brand = brands[edition];
  const authApiBaseUrl = resolveAuthApiBaseUrl(environment, edition, brand.authApiBaseUrl);

  return {
    define: {
      'process.env.APP_EDITION': JSON.stringify(brand.edition),
      'process.env.GITHUB_OWNER': JSON.stringify(environment.GITHUB_OWNER || 'aaif-aibuddy'),
      'process.env.GITHUB_REPO': JSON.stringify(environment.GITHUB_REPO || 'aibuddy'),
      'process.env.AIBUDDY_BUNDLE_NAME': JSON.stringify(environment.AIBUDDY_BUNDLE_NAME || 'AIBuddy'),
      __AUTH_MODE__: JSON.stringify(brand.authMode),
      __AUTH_API_BASE_URL__: JSON.stringify(authApiBaseUrl),
    },
  };
}
