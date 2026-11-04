import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import { contentSecurityPolicy } from './src/interfaces/electron/main/csp.ts'

const root = fileURLToPath(new URL('.', import.meta.url))
const src = `${root}src`

/** The same aliases as tsconfig.base.json, for every process. */
const alias = {
  '@domain': `${src}/domain`,
  '@judges': `${src}/judges`,
  '@application': `${src}/application`,
  '@infrastructure': `${src}/infrastructure`,
  '@interfaces': `${src}/interfaces`,
  '@renderer': `${src}/renderer`,
}

/**
 * In development the page comes from Vite's server, which sets no headers, so
 * the policy rides in a meta tag; Vite stamps its own injected scripts with the
 * nonce. The built page gets the strict policy as a header from the app scheme.
 */
const DEV_NONCE = 'skill-studio-dev'
const cspMeta = (serve: boolean): Plugin => ({
  name: 'skill-studio:csp',
  apply: () => serve,
  transformIndexHtml: () => [
    {
      tag: 'meta',
      injectTo: 'head-prepend',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: contentSecurityPolicy({ nonce: DEV_NONCE }),
      },
    },
  ],
})

export default defineConfig(({ command }) => ({
  main: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      rollupOptions: { input: `${src}/interfaces/electron/main/index.ts` },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      // Sandboxed preloads run as plain scripts, so the bundle must be CommonJS.
      rollupOptions: {
        input: `${src}/interfaces/electron/preload/index.ts`,
        output: { format: 'cjs' },
      },
    },
  },
  renderer: {
    root: `${src}/renderer`,
    resolve: { alias },
    plugins: [react(), tailwindcss(), cspMeta(command === 'serve')],
    html: command === 'serve' ? { cspNonce: DEV_NONCE } : {},
    build: {
      minify: true,
      rollupOptions: { input: `${src}/renderer/index.html` },
    },
  },
}))
