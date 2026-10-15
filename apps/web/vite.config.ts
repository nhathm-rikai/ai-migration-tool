import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Local fixture only. Keep the same-origin API path; never expose the dev server to LAN.
const proxy = { '/api': 'http://127.0.0.1:4310' };
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
});
