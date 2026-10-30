import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  base: './', // relative paths so the build works on GitHub Pages under /furry-air-riders/
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1000 },
  server: {
    fs: { allow: ['..'] },
    // `npm run server` in another terminal makes online play work in dev too.
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
});
