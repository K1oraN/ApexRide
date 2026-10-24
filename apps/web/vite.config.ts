import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';

const envDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode, isPreview }) => {
  const env = loadEnv(mode, envDir, 'WEB_');
  return {
    plugins: [
      ...(!isPreview ? [react()] : []),
      {
        name: 'admin-security-headers',
        configurePreviewServer(server: PreviewServer) {
          server.middlewares.use((req, res, next) => {
            if (/^\/admin(?:\/|\?|$)/.test(req.url ?? '')) {
              res.setHeader('Cache-Control', 'private, no-store');
              res.setHeader('Referrer-Policy', 'no-referrer');
              res.setHeader('X-Content-Type-Options', 'nosniff');
              res.setHeader(
                'Content-Security-Policy',
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
              );
            }
            next();
          });
        },
      },
    ],
    envDir,
    preview: {
      // Vite's final HTML handler otherwise overwrites middleware no-store.
      headers: { 'Cache-Control': 'no-store' },
      proxy: {
        '/api': { target: env.WEB_API_PROXY_TARGET ?? 'http://127.0.0.1:3001' },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // Editors may truncate before rewriting; publish HMR after the write settles.
      watch: {
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 25 },
      },
      proxy: {
        '/api': { target: env.WEB_API_PROXY_TARGET ?? 'http://127.0.0.1:3001' },
      },
    },
  };
});
