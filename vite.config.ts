import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  base: '/',
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    rolldownOptions: {
      input: {
        page: resolve(import.meta.dirname, 'src/page/index.html'),
        settings: resolve(import.meta.dirname, 'src/settings/index.html'),
      },
    },
  },
});
