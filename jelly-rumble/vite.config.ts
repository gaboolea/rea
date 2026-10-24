import { defineConfig } from 'vite';

const serverPort = Number(process.env.PORT ?? 2567);

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    host: true,
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/ws': { target: `ws://localhost:${serverPort}`, ws: true } },
  },
});
