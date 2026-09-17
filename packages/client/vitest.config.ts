import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Mirror the Vite dev config (TSX + import.meta.env) but run in jsdom for the
// headless DOM-level playability audit. The audit suite lives under test/ and is
// invoked via the repo-root `npm run audit:dom` script; the shared engine suite
// (npm test) is unaffected.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
  },
})
