/**
 * The checkout the CLI and `st serve` run from, unbundled under tsx: where
 * `.env` and the built renderer live. The desktop app never uses this; it asks
 * Electron for its paths.
 */
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotEnv } from '@infrastructure/dotenv.ts'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..')

/** The renderer `electron-vite build` writes, which `st serve` serves beside the API. */
export const RENDERER_DIST = join(REPO_ROOT, 'out/renderer')

export const loadEnv = (): void => loadDotEnv(REPO_ROOT)
