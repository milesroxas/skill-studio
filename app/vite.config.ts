import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('..', import.meta.url))

/** The review UI. `vite build` writes app/dist, which `st serve` serves beside /api. */
export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: {
      '@core': `${repo}core`,
      '@judges': `${repo}judges`,
      '@app': `${root}src`,
    },
  },
  build: { outDir: `${root}dist`, emptyOutDir: true },
  server: {
    port: 4401,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4400' },
  },
})
