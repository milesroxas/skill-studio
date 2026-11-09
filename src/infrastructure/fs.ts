import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A JSON file, or `fallback` when there is none. A file that does not parse
 * throws an error naming it, so a torn or hand-edited file is found and fixed
 * rather than read as empty and written over. A caller listing many files
 * catches and skips the bad one.
 */
export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  const raw = readFileSync(path, 'utf8')
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw new Error(`${path} is malformed and could not be read: ${(error as Error).message}`)
  }
}

/**
 * Write a JSON file whole: the text goes to a temporary file beside it, which
 * then takes its name. A crash midway leaves the old file, never half a new one.
 */
export function writeJson(path: string, value: unknown, mode?: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, mode === undefined ? {} : { mode })
  renameSync(temp, path)
}

/** The folder with every link resolved, as the Library lists it; the path itself when it is gone. */
export const realPath = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
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
