import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    'process.env.AIBUDDY_TUNNEL': JSON.stringify(
      process.env.AIBUDDY_TUNNEL !== 'no' && process.env.AIBUDDY_TUNNEL !== 'none'
    ),
  },

  plugins: [tailwindcss()],

  // Vite caches a copy of @aibuddy/aibuddy-acp-client and doesn't notice when we rebuild it
  // locally, so it serves stale code until you clear node_modules/.vite by hand.
  // Excluding it makes Vite always read the latest ui/aibuddy-acp-client/dist build.
  // Dev-server only — release builds ignore optimizeDeps.
  optimizeDeps: {
    exclude: ['@aibuddy/aibuddy-acp-client'],
  },

  build: {
    target: process.env.WINDOWS_ARCH === 'x32' ? 'chrome108' : 'esnext',
    cssTarget: process.env.WINDOWS_ARCH === 'x32' ? 'chrome108' : undefined,
    cssMinify: process.env.WINDOWS_ARCH === 'x32' ? 'lightningcss' : 'esbuild',
  },
});
