import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fontCatalogPlugin } from './scripts/font-catalog.mjs';

export default defineConfig({
  plugins: [react(), fontCatalogPlugin()],
  build: { license: { fileName: 'licenses/dependencies.md' } },
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
});
