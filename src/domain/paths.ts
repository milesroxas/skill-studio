/**
 * Path containment without the platform's path module, so the renderer and
 * every process share one answer. Callers pass absolute paths.
 */

/** The path's segments with `.` dropped and `..` applied, on either separator. */
export function segments(path: string): string[] {
  const out: string[] = []
  for (const part of path.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out
}

/**
 * True when `path` is `root` or inside it. Compares whole path segments, so
 * `/runs/case-s10` is not inside `/runs/case-s1`, and `..` segments are
 * resolved before comparing.
 */
export function isWithin(path: string, root: string): boolean {
  const inner = segments(path)
  const outer = segments(root)
  return outer.length <= inner.length && outer.every((segment, i) => segment === inner[i])
}

/**
 * The folder `path` runs through whose last segments are `tail`, one inside
 * the other, in the path's own spelling; null when it runs through none. `..`
 * is applied first, so a path that climbs back out of the folder does not run
 * through it. A path written for another system (`/home/x` read on Windows,
 * `C:\x` read anywhere) is read as it is written.
 */
export function folderEnding(path: string, tail: readonly string[]): string | null {
  const parts = segments(path)
  const at = tail.length
    ? parts.findIndex((_, i) => tail.every((name, j) => parts[i + j] === name))
    : -1
  if (at === -1) return null
  const lead = /^[\\/]+/.exec(path)?.[0] ?? ''
  const separator = path.includes('/') ? '/' : '\\'
  return lead + parts.slice(0, at + tail.length).join(separator)
}

/**
 * Folders no copy of a skill holds, at any depth: installed packages and
 * caches, heavy and made again from the files beside them.
 */
const NEVER_COPIED = new Set(['node_modules', 'venv', '__pycache__'])

/** A folder's or a file's name that no copy of a skill holds, wherever it is. */
export const isPassedOver = (name: string): boolean => NEVER_COPIED.has(name)

/**
 * A skill-relative path of one of the skill's own files, written plainly:
 * SKILL.md, a reference, a script, an asset or any other file an agent's
 * copy of the skill holds. Not one: a path that resolves to something other
 * than itself (`..`, `.`, an empty segment, a backslash), a hidden file or
 * folder, anything under `evals/`, where the cases and runs are, and
 * anything in a folder no copy holds (`isPassedOver`).
 */
export const isSkillFilePath = (path: string): boolean => {
  if (path === 'SKILL.md') return true
  const parts = segments(path)
  return (
    parts.length > 0 &&
    parts.join('/') === path &&
    parts[0] !== 'evals' &&
    parts.every((part) => !part.startsWith('.') && !isPassedOver(part))
  )
}

/**
 * SKILL.md or a file under references/: all that was kept of a version
 * before a skill's other files were kept with it.
 */
export const isCorePath = (path: string): boolean =>
  path === 'SKILL.md' || (isSkillFilePath(path) && path.startsWith('references/'))

/** A file that reads as Markdown, by its name: the editor styles it, and the assistant writes it. */
export const isMarkdownPath = (path: string): boolean => /\.(md|markdown)$/i.test(path)

/** The folder a file is in, by its skill-relative path; `''` for a file beside SKILL.md. */
export const folderOf = (path: string): string => path.split('/').slice(0, -1).join('/')

/** A file's or a folder's own name, the last part of its path. */
export const nameOf = (path: string): string => path.split('/').at(-1) ?? path

/** A name typed for a new file or folder: parts of letters, digits, `_`, `.` and `-`, with a `/` between. */
const TYPED_NAME = /^\w[\w.-]*(\/\w[\w.-]*)*$/

/** Where a new file or folder goes, or why the name typed for it cannot be used, as the editor says it. */
export type Placed = { path: string } | { error: string }

/**
 * The spelling the skill already has for the folders `path` runs through, by
 * its `existing` files. On a Mac and on Windows `References/a.md` is written
 * into `references/`, so a folder typed with other capitals is the folder
 * that is there.
 */
function inFoldersAsSpelled(path: string, existing: readonly string[]): string {
  const parts = path.split('/')
  for (let depth = parts.length - 1; depth > 0; depth--) {
    const lead = `${parts.slice(0, depth).join('/').toLowerCase()}/`
    const beside = existing.find((file) => file.toLowerCase().startsWith(lead))
    if (beside) return [...beside.split('/').slice(0, depth), ...parts.slice(depth)].join('/')
  }
  return path
}

/**
 * The path a new file or folder gets from the `name` typed for it in
 * `folder` (`''` is the skill's own folder, beside SKILL.md), among the
 * skill's `existing` files. A file's name with no extension is Markdown:
 * `voice` in `references` is `references/voice.md`. A name may hold folders
 * of its own, so `scripts/check.py` typed beside SKILL.md is a script.
 *
 * Refused, with the sentence to show: a part that holds anything but letters,
 * digits, `_`, `.` and `-`, a path that is not one of a skill's
 * (`isSkillFilePath`), a file that is there already, and a name a file has
 * where a folder is wanted or a folder has where a file is. Names are
 * compared without their capitals, since most disks hold one of the two.
 */
export function placeNew(
  kind: 'file' | 'folder',
  name: string,
  folder: string,
  existing: readonly string[],
): Placed {
  const clean = name.trim()
  if (!TYPED_NAME.test(clean))
    return { error: 'Use letters, digits, dots, dashes and underscores.' }
  const typed = folder ? `${folder}/${clean}` : clean
  const named = kind === 'file' && !/\.\w+$/.test(typed) ? `${typed}.md` : typed
  // A folder is one of the skill's when a file inside it would be.
  const probe = kind === 'file' ? named : `${named}/SKILL.md`
  if (!isSkillFilePath(probe))
    return { error: 'Pick another name. A skill’s files cannot be kept there.' }
  const spelled = inFoldersAsSpelled(probe, existing)
  const path = kind === 'file' ? spelled : folderOf(spelled)
  const lower = path.toLowerCase()
  for (const file of existing) {
    const other = file.toLowerCase()
    if (other === lower)
      return {
        error: kind === 'file' ? `${file} already exists.` : `${file} is a file, not a folder.`,
      }
    if (lower.startsWith(`${other}/`))
      return { error: `${file} is a file, so nothing can go inside it.` }
    if (kind === 'file' && other.startsWith(`${lower}/`)) return { error: `${path} is a folder.` }
  }
  return { path }
}

/** A folder of a skill as the editor lists it: its files, then the folders inside it. */
export interface FileFolder {
  /** The folder's own name; `''` for the skill's folder. */
  name: string
  /** Its skill-relative path; `''` for the skill's folder. */
  path: string
  /** The paths of the files in it, SKILL.md first, then by name. */
  files: string[]
  folders: FileFolder[]
}

/**
 * A skill's files as a tree of folders. A folder is there for as long as a
 * file is in it; `empty` names folders to list all the same, such as one just
 * named that waits for its first file.
 */
export function fileTree(paths: readonly string[], empty: readonly string[] = []): FileFolder {
  const root: FileFolder = { name: '', path: '', files: [], folders: [] }
  const folderAt = (path: string): FileFolder => {
    let at = root
    for (const name of path ? path.split('/') : []) {
      let next = at.folders.find((f) => f.name === name)
      if (!next) {
        next = { name, path: at.path ? `${at.path}/${name}` : name, files: [], folders: [] }
        at.folders.push(next)
      }
      at = next
    }
    return at
  }
  for (const path of paths) folderAt(folderOf(path)).files.push(path)
  for (const path of empty) folderAt(path)
  const sort = (folder: FileFolder): void => {
    folder.files.sort(byFileOrder)
    folder.folders.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    folder.folders.forEach(sort)
  }
  sort(root)
  return root
}

/** The order a skill's files are listed in: SKILL.md first, then by path. */
export const byFileOrder = (a: string, b: string): number =>
  a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b, 'en')
