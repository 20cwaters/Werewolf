import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Point at source rather than the build so shared engine edits hot-reload.
      '@onuw/shared': path.resolve(repoRoot, 'shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    // The shared package lives outside the client root.
    fs: { allow: [repoRoot] },
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/healthz': { target: 'http://localhost:3000' },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
