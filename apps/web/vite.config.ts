import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  // `.env` unique à la racine du monorepo, partagé avec l'extension.
  envDir: resolve(__dirname, '../..'),
  server: { port: 5173 },
});
