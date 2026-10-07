import { defineConfig } from 'vite';

// `npm run build` -> dist/viewer.js (garage viewer artifact)
// `npm run build:level` -> dist-level/level.js (Level 1 artifact)
const level = process.env.ENTRY === 'level';

export default defineConfig({
  base: './',
  build: {
    outDir: level ? 'dist-level' : 'dist',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: level ? 'level.html' : 'index.html',
      output: { entryFileNames: level ? 'level.js' : 'viewer.js', inlineDynamicImports: true },
    },
  },
});
