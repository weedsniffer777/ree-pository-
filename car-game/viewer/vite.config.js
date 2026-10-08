import { defineConfig } from 'vite';

// `npm run build` -> dist/viewer.js (garage viewer artifact)
// `npm run build:level` -> dist-level/level.js (Level 1 artifact)
const entry = process.env.ENTRY || 'viewer';
const level = entry !== 'viewer';

export default defineConfig({
  base: './',
  build: {
    outDir: level ? `dist-${entry}` : 'dist',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: level ? `${entry}.html` : 'index.html',
      output: { entryFileNames: level ? `${entry}.js` : 'viewer.js', inlineDynamicImports: true },
    },
  },
});
