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
 * A skill-relative path the editor may write: SKILL.md or a file under
 * references/, written plainly. A path that resolves to something other
 * than itself (`..`, `.`, an empty segment, a backslash) or names the
 * directory alone is not one.
 */
export const isEditablePath = (path: string): boolean => {
  if (path === 'SKILL.md') return true
  const parts = segments(path)
  return parts[0] === 'references' && parts.length > 1 && parts.join('/') === path
}

/** The order a skill's files are listed in: SKILL.md first, then by path. */
export const byFileOrder = (a: string, b: string): number =>
  a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b, 'en')
