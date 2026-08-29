import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveBrand } = require('./scripts/brand.js');
const brand = resolveBrand(process.env.APP_EDITION || 'heybuddy');

// https://vitejs.dev/config
export default defineConfig({
  define: {
    'process.env.APP_EDITION': JSON.stringify(brand.edition),
    'process.env.GOOSE_TUNNEL': JSON.stringify(
      process.env.GOOSE_TUNNEL !== 'no' && process.env.GOOSE_TUNNEL !== 'none'
    ),
  },

  plugins: [tailwindcss()],

  // Vite caches a copy of @aaif/goose-sdk and doesn't notice when we rebuild it
  // locally, so it serves stale code until you clear node_modules/.vite by hand.
  // Excluding it makes Vite always read the latest ui/sdk/dist build.
  // Dev-server only — release builds ignore optimizeDeps.
  optimizeDeps: {
    exclude: ['@aaif/goose-sdk'],
  },

  build: {
    target: 'esnext',
  },
});
