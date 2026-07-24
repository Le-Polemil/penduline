import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Build MV3 : popup (React) + service worker. `public/` (dont manifest.json) est
// copié tel quel dans dist/. Les variables VITE_SUPABASE_* sont lues depuis le
// `.env` à la racine du monorepo (envDir), partagé avec l'app web.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '../..'),
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
