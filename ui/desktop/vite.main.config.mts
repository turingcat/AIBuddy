import { createRequire } from 'node:module';
import { defineConfig, loadEnv } from 'vite';
import { createMainViteConfig } from './src/viteMainConfig';

const require = createRequire(import.meta.url);
const { resolveBrand } = require('./scripts/brand.js');

export default defineConfig(({ mode }) => {
  const brand = resolveBrand(process.env.APP_EDITION || 'heybuddy');
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const environment = { ...fileEnv, ...process.env };

  return createMainViteConfig(environment, brand.edition);
});
