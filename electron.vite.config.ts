import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'electron-vite'
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

/**
 * Each build lists the packages it bundled, with their license text, for
 * scripts/third-party-licenses.ts to gather into the notices the app ships.
 */
const license = { fileName: '.vite/licenses.json' }
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

/**
 * `electron-vite build --mode draw` builds the drawing host the command line
 * draws pages with, alone, to out/main/draw.js beside the app's main bundle
 * (`pnpm build` runs it after the app's build). It is a pass of its own, as the
 * backend's bundle is: as a second input of the app's build it would share a
 * chunk with the app, and the app would load every operation the host serves.
 * The packaged app leaves it out (electron-builder.yml).
 */
const DRAW_MODE = 'draw'
const drawHost: UserConfig = {
  main: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      // The app's build wrote out/main first: this pass only adds its file.
      emptyOutDir: false,
      rollupOptions: {
        input: { draw: `${src}/interfaces/electron/draw/index.ts` },
        // The host's code, loaded by draw.js once the app is in the background, kept apart from the app's.
        output: { chunkFileNames: 'draw/[name]-[hash].js' },
      },
    },
  },
}

/** The desktop app: its main process, its preload and its pages. */
const app = (command: string): UserConfig => ({
  main: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      license,
      rollupOptions: { input: `${src}/interfaces/electron/main/index.ts` },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      license,
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
      license,
      rollupOptions: { input: `${src}/renderer/index.html` },
    },
  },
})

export default defineConfig(({ command, mode }) => (mode === DRAW_MODE ? drawHost : app(command)))
