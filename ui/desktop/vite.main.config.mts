import { defineConfig, loadEnv } from 'vite';
import { createRequire } from 'node:module';
import { PRODUCTION_AUTH_API_BASE_URL, resolveAuthApiBaseUrl } from './src/authConfig';

const require = createRequire(import.meta.url);
const { resolveBrand } = require('./scripts/brand.js');

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const environment = { ...fileEnv, ...process.env };

  const brand = resolveBrand();

  return {
    define: {
      'process.env.APP_EDITION': JSON.stringify(brand.edition),
      'process.env.GITHUB_OWNER': JSON.stringify(process.env.GITHUB_OWNER || 'aaif-goose'),
      'process.env.GITHUB_REPO': JSON.stringify(process.env.GITHUB_REPO || 'goose'),
      'process.env.GOOSE_BUNDLE_NAME': JSON.stringify(process.env.GOOSE_BUNDLE_NAME || 'Goose'),
      __HEYBUDDY_AUTH_API_BASE_URL__: JSON.stringify(
        resolveAuthApiBaseUrl(environment, PRODUCTION_AUTH_API_BASE_URL)
      ),
      'process.env.HEYBUDDY_AUTH_API_BASE_URL': JSON.stringify(
        resolveAuthApiBaseUrl(environment, PRODUCTION_AUTH_API_BASE_URL)
      ),
    },
  };
});
