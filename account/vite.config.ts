import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { configFromEnv } from './config-from-env.mjs';

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/**
 * The only parts of the admin app this app uses: the UI primitives and the
 * helpers they need. Nothing else of the admin app is reachable from here.
 */
const SHARED = {
  '@/components/ui': repo('src/components/ui'),
  '@/hooks/useCopyFeedback': repo('src/hooks/useCopyFeedback.ts'),
  '@/lib/utils': repo('src/lib/utils.ts'),
  '@/lib/pubky-ring': repo('src/lib/pubky-ring.ts'),
};

/** Serves /config.json from the environment in dev and preview, as the image does at start. */
function configJson(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/config.json') return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(configFromEnv(process.env)));
  };
  return {
    name: 'account-config-json',
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), configJson()],
  // The admin app's public/ holds the logos both apps use.
  publicDir: repo('public'),
  resolve: {
    alias: SHARED,
    // The shared files live outside this app. Their imports of these packages
    // must use this app's copies, never a second React from the admin app.
    dedupe: [
      'react',
      'react-dom',
      '@radix-ui/react-label',
      '@radix-ui/react-slot',
      'class-variance-authority',
      'clsx',
      'lucide-react',
      'tailwind-merge',
    ],
  },
  server: { fs: { allow: [repo('')] } },
  build: {
    target: 'es2022',
    // The Pubky SDK (its WebAssembly inlined) is one ~3 MB chunk of its own,
    // loaded only once the page connects; it cannot be split further.
    chunkSizeWarningLimit: 3500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
