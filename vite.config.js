import { defineConfig } from 'vite';

// Dev server only. Serves the raw HTML / JS / CSS files with auto-reload on
// save and no-cache headers. We don't run `vite build` because the scripts
// aren't ES modules yet — production deploys still serve the static files
// directly (Vercel, Cloudflare Pages, etc).
export default defineConfig({
  server: {
    port: 8001,
    open: false,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
});
