import { createRequire } from 'node:module';
import { defineConfig, loadEnv } from 'vite';
import { resolveAuthApiBaseUrl } from './src/authConfig';

const require = createRequire(import.meta.url);
const { resolveBrand } = require('./scripts/brand.js');

export function createMainViteConfig(environment: NodeJS.ProcessEnv, edition = 'heybuddy') {
  const brand = resolveBrand(edition);
  const authApiBaseUrl = resolveAuthApiBaseUrl(environment, brand.edition, brand.authApiBaseUrl);

  return {
    define: {
      'process.env.APP_EDITION': JSON.stringify(brand.edition),
      'process.env.GITHUB_OWNER': JSON.stringify(environment.GITHUB_OWNER || 'aaif-goose'),
      'process.env.GITHUB_REPO': JSON.stringify(environment.GITHUB_REPO || 'goose'),
      'process.env.GOOSE_BUNDLE_NAME': JSON.stringify(environment.GOOSE_BUNDLE_NAME || 'Goose'),
      __AUTH_MODE__: JSON.stringify(brand.authMode),
      __AUTH_API_BASE_URL__: JSON.stringify(authApiBaseUrl),
    },
  };
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const environment = { ...fileEnv, ...process.env };

  return createMainViteConfig(environment, process.env.APP_EDITION || 'heybuddy');
});
