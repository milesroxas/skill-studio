import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { isWithin } from '@domain/paths.ts'

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
 * Write a text file whole: the text goes to a hidden temporary file beside it,
 * which then takes its name. A crash midway leaves the old file, never half a
 * new one, and what it leaves behind is hidden, so no list, copy or hash of a
 * skill holds it. Given `root`, a link at `path` to a file inside `root` is
 * written through and stays a link; any other link is replaced by the file.
 */
export function writeText(
  path: string,
  text: string,
  options: { mode?: number; root?: string } = {},
): void {
  const target = options.root ? linkedInside(options.root, path) : path
  mkdirSync(dirname(target), { recursive: true })
  const temp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`)
  writeFileSync(temp, text, options.mode === undefined ? {} : { mode: options.mode })
  try {
    renameSync(temp, target)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

/** Write a JSON file whole, as `writeText` does. */
export function writeJson(path: string, value: unknown, mode?: number): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`, { mode })
}

/** Where a write to `path` lands: the file a link there leads to, when that is inside `root`. */
function linkedInside(root: string, path: string): string {
  const real = realOf(path)
  const base = realOf(root)
  return real && base && isWithin(real, base) ? real : path
}

/** The path with every link resolved; null when nothing is there. */
export const realOf = (path: string): string | null => {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/** The folder with every link resolved, as the Library lists it; the path itself when it is gone. */
export const realPath = (path: string): string => realOf(path) ?? path

export const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory()
export const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile()

/** True when something is at `path`, a link whose target is gone included. */
export const present = (path: string): boolean => {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * `path` when it is really inside `root`, with every link on the way
 * resolved. A file that is not there yet is judged by the nearest folder that
 * is. A link that leads out of `root`, or to nothing, is refused: a name that
 * reads as inside the skill must not write, read or delete somewhere else.
 */
export function assertInside(root: string, path: string): string {
  const base = realOf(root)
  if (!base) throw new Error(`The folder ${root} is no longer there.`)
  let probe = resolve(path)
  while (!present(probe)) {
    const parent = dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  const real = realOf(probe)
  if (!real || !isWithin(real, base))
    throw new Error(
      `${relative(root, path) || path} leads outside its folder, so it is left alone.`,
    )
  return path
}

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

/** How a tree is walked. */
interface Walk {
  /** Links are followed while they stay inside it: the directory itself unless given. */
  root?: string
  /** A name, of a file or a folder, passed over at any depth. Hidden names always are. */
  skip?: (name: string) => boolean
  /** Told each folder by its real path, before its entries are read. */
  folder?: (real: string) => void
}

/**
 * Every file under a directory, by its path inside it with `/` between the
 * parts on every platform. Links are followed while they stay inside the
 * root; one that leaves it, leads nowhere or loops back is skipped. Dotfiles
 * are skipped.
 */
function walkTree(dir: string, visit: (rel: string, real: string) => void, options: Walk): void {
  const base = realOf(options.root ?? dir)
  const top = realOf(dir)
  if (!base || !top || !isDir(top)) return
  const seen = new Set<string>([top])
  const walk = (current: string, real: string, prefix: string) => {
    options.folder?.(real)
    for (const name of readdirSync(current).sort()) {
      if (name.startsWith('.') || options.skip?.(name)) continue
      const target = realOf(join(current, name))
      if (!target || !isWithin(target, base)) continue
      let folder: boolean
      try {
        folder = statSync(target).isDirectory()
      } catch {
        continue
      }
      const rel = prefix ? `${prefix}/${name}` : name
      if (!folder) visit(rel, target)
      else if (!seen.has(target)) {
        seen.add(target)
        walk(join(current, name), target, rel)
      }
    }
  }
  walk(dir, top, '')
}

/** Every file under a directory matching `test`, as text, keyed by its path inside it. */
export function readTree(
  dir: string,
  test: (name: string) => boolean = () => true,
  options: Walk = {},
): Record<string, string> {
  const files: Record<string, string> = {}
  walkTree(
    dir,
    (rel, real) => {
      if (test(rel.split('/').at(-1) ?? rel)) files[rel] = readFileSync(real, 'utf8')
    },
    options,
  )
  return files
}

/** Every file under a directory: its path inside it, and where its bytes are. */
export function treeFiles(dir: string, options: Walk = {}): Array<{ rel: string; real: string }> {
  const files: Array<{ rel: string; real: string }> = []
  walkTree(dir, (rel, real) => files.push({ rel, real }), options)
  return files
}

/** Copy a tree, following symlinks and skipping the names in `skip`. */
export function copyTree(from: string, to: string, skip: string[] = []): void {
  cpSync(from, to, {
    recursive: true,
    dereference: true,
    filter: (source) => !skip.includes(relative(from, source).split(/[\\/]/)[0]),
  })
}

/**
 * Make `path` a link to the folder `target`. Windows lets an ordinary account
 * make a junction but not a symbolic link, and a junction names its target in
 * full; elsewhere the link is relative, so the two can move together.
 */
export function linkDir(target: string, path: string): void {
  if (process.platform === 'win32') symlinkSync(resolve(dirname(path), target), path, 'junction')
  else symlinkSync(target, path)
}

const SAFE_NAME = /^[\w][\w.-]*$/
export const assertSafe = (value: string | null | undefined, what: string): string => {
  if (!value || !SAFE_NAME.test(value)) throw new Error(`Bad ${what}.`)
  return value
}

/**
 * Characters Windows refuses in a name, refused on every system so a skill
 * made on one opens on the others. A colon would also name an NTFS stream.
 */
const NOT_IN_A_NAME = /[\\<>:"|?*]/

/** Names Windows keeps for its devices, in any case and with any extension: `con`, `NUL.md`, `com1.txt`. */
const DEVICE_NAME = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i

/** One part of a file's path: any name a folder can hold that is not hidden and cannot climb. */
const isSegment = (part: string): boolean =>
  part.length > 0 &&
  part.length <= 255 &&
  !part.startsWith('.') &&
  !NOT_IN_A_NAME.test(part) &&
  // A control character, a line break among them, is never part of a name.
  ![...part].some((char) => char.charCodeAt(0) < 32) &&
  // Windows opens the device for one of its names, and drops a final dot or space.
  !(process.platform === 'win32' && (DEVICE_NAME.test(part) || /[. ]$/.test(part)))

/**
 * A file's path as a request names it, with `/` between its parts. Spaces and
 * letters of any alphabet are fine; an empty part, a hidden name, `..`, a
 * backslash, a control character or one of `<>:"|?*` is not, so the path
 * cannot climb out of the folder it is joined to and names a file on every
 * system. On Windows a device name (`con`, `nul.md`, `com1`) and a part ending
 * in a dot or a space are refused too. A link on the way is `assertInside`'s
 * to refuse.
 */
export const assertSafePath = (value: string | null | undefined, what: string): string => {
  if (!value?.split('/').every(isSegment)) throw new Error(`Bad ${what}.`)
  return value
}

export const today = (): string => new Date().toISOString().slice(0, 10)
