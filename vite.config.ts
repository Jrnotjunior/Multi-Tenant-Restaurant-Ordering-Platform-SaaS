import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1' },
  build: { rollupOptions: { input: { app: resolve(process.cwd(), 'index.html'), maps: resolve(process.cwd(), 'maps.html') } } },
});
