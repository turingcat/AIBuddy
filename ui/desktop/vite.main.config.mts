import { defineConfig, loadEnv } from 'vite';
import { createMainViteConfig } from './src/viteMainConfig';

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const environment = { ...fileEnv, ...process.env };

  return createMainViteConfig(environment);
});
