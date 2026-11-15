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

/**
 * The path a new file gets from the name typed for it. A bare name is a
 * reference, the kind of file a skill most often gains, and a name with no
 * extension is Markdown: `voice` is `references/voice.md`. A name with a
 * folder is taken as it is written, so `scripts/check.py` is a script. Null
 * for a name that is no path of the skill's, or holds anything but letters,
 * digits, `_`, `.` and `-` in a part.
 */
export function newFilePath(name: string): string | null {
  const clean = name.trim()
  if (!/^[\w][\w.-]*(\/[\w][\w.-]*)*$/.test(clean)) return null
  const placed = clean.includes('/') ? clean : `references/${clean}`
  const path = /\.\w+$/.test(placed) ? placed : `${placed}.md`
  return isSkillFilePath(path) && path !== 'SKILL.md' ? path : null
}

/** The order a skill's files are listed in: SKILL.md first, then by path. */
export const byFileOrder = (a: string, b: string): number =>
  a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b, 'en')
