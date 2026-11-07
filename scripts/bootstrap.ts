/**
 * Set up a checkout, including a worktree made a moment ago: `pnpm install`
 * (its postinstall fetches the Electron binary), then the main checkout's
 * `.env` when this one has none. The file is ignored by git, so a new worktree
 * starts without keys. Node runs this file directly, before anything is installed.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

const install = spawnSync('pnpm', ['install'], { cwd: ROOT, stdio: 'inherit' })
if (install.error) throw install.error
if (install.status !== 0) process.exit(install.status ?? 1)

const env = join(ROOT, '.env')
if (!existsSync(env)) {
  // The first checkout `git worktree list` names is the main one, where `.env` lives.
  const list = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const main = list.stdout
    ?.split('\n')
    .find((line) => line.startsWith('worktree '))
    ?.slice(9)
  const source = main && resolve(main) !== ROOT ? join(main, '.env') : undefined
  if (source && existsSync(source)) {
    copyFileSync(source, env)
    console.log(`bootstrap: copied .env from ${main}`)
  }
}
