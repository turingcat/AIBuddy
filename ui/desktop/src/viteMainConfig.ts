import { resolveAuthApiBaseUrl } from './authConfig';
import { appBrand } from './brand';

export function createMainViteConfig(environment: NodeJS.ProcessEnv) {
  const authApiBaseUrl = resolveAuthApiBaseUrl(environment, appBrand.authApiBaseUrl);

  return {
    define: {
      'process.env.GITHUB_OWNER': JSON.stringify(environment.GITHUB_OWNER || 'aaif-goose'),
      'process.env.GITHUB_REPO': JSON.stringify(environment.GITHUB_REPO || 'aibuddy'),
      'process.env.AIBUDDY_BUNDLE_NAME': JSON.stringify(environment.AIBUDDY_BUNDLE_NAME || 'AIBuddy'),
      __AUTH_MODE__: JSON.stringify(appBrand.authMode),
      __AUTH_API_BASE_URL__: JSON.stringify(authApiBaseUrl),
    },
  };
}
