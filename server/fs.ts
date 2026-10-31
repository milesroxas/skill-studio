import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

export const readJson = <T>(path: string, fallback: T): T =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback

export const writeJson = (path: string, value: unknown): void => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory()
export const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile()

export const listDirs = (dir: string): string[] =>
  isDir(dir)
    ? readdirSync(dir)
        .filter((name) => !name.startsWith('.') && isDir(join(dir, name)))
        .sort()
    : []

export const listFiles = (dir: string, test: (name: string) => boolean = () => true): string[] =>
  isDir(dir)
    ? readdirSync(dir)
        .filter((name) => !name.startsWith('.') && isFile(join(dir, name)) && test(name))
        .sort()
    : []

/** Every file under a directory matching `test`, keyed by its path inside it. Symlinks are followed. */
export function readTree(
  dir: string,
  test: (name: string) => boolean = () => true,
): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      if (name.startsWith('.')) continue
      const full = join(current, name)
      let real: string
      try {
        real = realpathSync(full)
      } catch {
        // A dangling symlink: nothing to read.
        continue
      }
      if (statSync(real).isDirectory()) walk(full)
      else if (test(name)) files[relative(dir, full)] = readFileSync(real, 'utf8')
    }
  }
  if (isDir(dir)) walk(dir)
  return files
}

/** Copy a tree, following symlinks and skipping the names in `skip`. */
export function copyTree(from: string, to: string, skip: string[] = []): void {
  cpSync(from, to, {
    recursive: true,
    dereference: true,
    filter: (source) => !skip.includes(relative(from, source).split('/')[0]),
  })
}

const SAFE_NAME = /^[\w][\w.-]*$/
export const assertSafe = (value: string | null | undefined, what: string): string => {
  if (!value || !SAFE_NAME.test(value)) throw new Error(`Bad ${what}.`)
  return value
}

/** A path made of safe segments, so a request cannot leave its folder. */
export const assertSafePath = (value: string | null | undefined, what: string): string => {
  if (!value) throw new Error(`Bad ${what}.`)
  for (const part of value.split('/')) assertSafe(part, what)
  return value
}

export const today = (): string => new Date().toISOString().slice(0, 10)
