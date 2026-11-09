/**
 * The PATH a desktop app runs commands with. An app opened from the Finder or
 * the Dock gets the system's bare PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), not
 * the one a terminal has, so a CLI in the home folder or in Homebrew is not
 * found. The folders the usual installers write to are always added, and the
 * login shell's own PATH once it has been read.
 */
import { spawn } from 'node:child_process'
import { delimiter, join } from 'node:path'

/** Where Claude Code's installer, Homebrew on Apple silicon, and Homebrew on Intel put commands. */
export const installDirs = (home: string): string[] => [
  join(home, '.local', 'bin'),
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
