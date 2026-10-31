import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The skill-tester checkout: where `.env`, `app/` and `judges/` live. */
export const TOOL_ROOT = resolve(fileURLToPath(import.meta.url), '../..')

let loaded = false

/** Load the tool's `.env` into `process.env` once. Values already in the environment win. */
export function loadEnv(): void {
  if (loaded) return
  loaded = true
  const path = join(TOOL_ROOT, '.env')
  if (existsSync(path)) process.loadEnvFile(path)
}

/**
 * The environment a generating agent runs with. Claude Code refuses to start
 * inside another Claude Code session unless its guard variable is gone; the
 * guard is for interactive terminals and a subprocess is safe.
 */
export function agentEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env))
    if (!key.startsWith('CLAUDECODE')) env[key] = value
  return env
}
