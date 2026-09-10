import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    target: process.env.WINDOWS_ARCH === 'x32' ? 'chrome108' : 'esnext',
    ssr: true,
    outDir: '.vite/build',
    rollupOptions: {
      input: 'src/preload.ts',
      output: {
        format: 'cjs',
        entryFileNames: 'preload.js',
      },
      external: ['electron'],
    },
  },
});
