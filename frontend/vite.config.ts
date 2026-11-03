import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the Vite server proxies REST + WebSocket traffic to Spring Boot on :8080,
// so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
