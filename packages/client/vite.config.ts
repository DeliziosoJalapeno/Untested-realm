import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Serve the linked workspace engine from SOURCE instead of Vite's pre-bundled dep cache, so
    // edits to packages/shared hot-reload in the browser during dev. Without this, Vite treats
    // `@sorcery/shared` as a bare node_modules dependency, pre-bundles it once, and never watches
    // its source — leaving the client running a STALE engine after any shared-package change.
    // Exact-match only: subpath imports (e.g. `@sorcery/shared/cards.json`) still use the exports map.
    alias: [
      { find: /^@sorcery\/shared$/, replacement: fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
      '/import-deck': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
