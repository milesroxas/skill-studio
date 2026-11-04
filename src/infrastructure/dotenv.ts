import { existsSync } from 'node:fs'
import { join } from 'node:path'

const loaded = new Set<string>()

/** Load `<root>/.env` into `process.env` once per root. Values already in the environment win. */
export function loadDotEnv(root: string): void {
  if (loaded.has(root)) return
  loaded.add(root)
  const path = join(root, '.env')
  if (existsSync(path)) process.loadEnvFile(path)
}
