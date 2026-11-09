/**
 * The PATH a desktop app runs commands with. An app opened from the Finder or
 * the Dock gets the system's bare PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), not
 * the one a terminal has, so a CLI in the home folder or in Homebrew is not
 * found. The folders the usual installers write to are always added, and the
 * login shell's own PATH once it has been read.
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** A version folder's number, for sorting: `v22.3.1` reads as [22, 3, 1]. */
const versionOf = (name: string): number[] =>
  name
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)

const newestFirst = (a: string, b: string): number => {
  const [va, vb] = [versionOf(a), versionOf(b)]
  for (let i = 0; i < Math.max(va.length, vb.length); i += 1)
    if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0)
  return 0
}

/**
 * The `bin` folder of every Node that nvm installed, newest first. A CLI
 * installed with npm under nvm lives in one of these, and only the shell's
 * startup files put the chosen one on the PATH.
 */
export function nvmBinDirs(home: string): string[] {
  const versions = join(home, '.nvm', 'versions', 'node')
  let names: string[]
  try {
    names = readdirSync(versions).filter((name) => /^v?\d/.test(name))
  } catch {
    return []
  }
  return names.sort(newestFirst).map((name) => join(versions, name, 'bin'))
}

/**
 * Where the usual installers put commands: Claude Code's own installer, each
 * Node that nvm installed, Volta, Bun, a global npm prefix, Homebrew on Apple
 * silicon, and Homebrew on Intel.
 */
export const installDirs = (home: string, nvm: string[] = nvmBinDirs(home)): string[] => [
  join(home, '.local', 'bin'),
  ...nvm,
  join(home, '.volta', 'bin'),
  join(home, '.bun', 'bin'),
  join(home, '.npm-global', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

/** Every folder of `path`, then those of `more` it lacks, in order and each once. */
export function mergePath(path: string | undefined, ...more: string[][]): string {
  const dirs = [...(path ?? '').split(delimiter), ...more.flat()].filter(Boolean)
  return [...new Set(dirs)].join(delimiter)
}

const MARK = '__SKILL_STUDIO_PATH__'

/** The PATH a shell printed between the marks. Its startup files may print around it. */
export function markedPath(out: string): string | null {
  const [, path] = out.split(MARK)
  return path?.trim() || null
}

/**
 * The PATH the user's login shell sets up, as a terminal would have it; null
 * on Windows, without a shell, or when the shell does not answer in time.
 */
export function loginShellPath(
  shell = process.env.SHELL,
  timeoutMs = 5000,
): Promise<string | null> {
  if (process.platform === 'win32' || !shell) return Promise.resolve(null)
  return new Promise((done) => {
    const child = spawn(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', () => {
      clearTimeout(timer)
      done(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      done(markedPath(out))
    })
  })
}
