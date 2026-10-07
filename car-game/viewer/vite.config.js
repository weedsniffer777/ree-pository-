import { defineConfig } from 'vite';

// `npm run build` emits dist/viewer.js: one self-contained bundle used by the
// published artifact page (artifact/garage.html).
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: { entryFileNames: 'viewer.js', inlineDynamicImports: true },
    },
  },
});
