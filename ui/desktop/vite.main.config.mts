import { defineConfig, loadEnv } from 'vite';
import { LOCAL_AUTH_API_BASE_URL, resolveAuthApiBaseUrl } from './src/authConfig';

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const environment = { ...fileEnv, ...process.env };

  return {
    define: {
      'process.env.GITHUB_OWNER': JSON.stringify(process.env.GITHUB_OWNER || 'aaif-goose'),
      'process.env.GITHUB_REPO': JSON.stringify(process.env.GITHUB_REPO || 'goose'),
      'process.env.GOOSE_BUNDLE_NAME': JSON.stringify(process.env.GOOSE_BUNDLE_NAME || 'Goose'),
      __HEYBUDDY_AUTH_API_BASE_URL__: JSON.stringify(
        resolveAuthApiBaseUrl(environment, LOCAL_AUTH_API_BASE_URL)
      ),
      'process.env.HEYBUDDY_AUTH_API_BASE_URL': JSON.stringify(
        resolveAuthApiBaseUrl(environment, LOCAL_AUTH_API_BASE_URL)
      ),
    },
  };
});
