import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Local fixture only. Keep the same-origin API path; never expose the dev server to LAN.
// PORTAL_PORT (same variable as the API) and PORTAL_WEB_PORT let the E2E
// harness run on free ports; defaults stay 4310 / 5173 / 4173.
const port = (name: string, fallback: number) => {
  const text = process.env[name];
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < 1 || value > 65535)
    throw new Error(`${name} must be a port number.`);
  return value;
};
const proxy = { '/api': `http://127.0.0.1:${port('PORTAL_PORT', 4310)}` };
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: port('PORTAL_WEB_PORT', 5173),
    strictPort: true,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: port('PORTAL_WEB_PORT', 4173),
    strictPort: true,
    proxy,
  },
});
