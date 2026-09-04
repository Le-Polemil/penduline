import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Build MV3 : panneau latéral (React) + service worker. `public/` (dont
// manifest.json) est copié tel quel dans dist/. Les variables VITE_SUPABASE_*
// sont lues depuis le `.env` à la racine du monorepo (envDir), partagé avec
// l'app web.
//
// ⚠️ Le nom de l'entrée fixe celui du fichier produit (`entryFileNames`), et
// `manifest.json` pointe `side_panel.default_path` sur `sidepanel.html` : les
// renommer suppose de reprendre les deux ensemble.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '../..'),
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
