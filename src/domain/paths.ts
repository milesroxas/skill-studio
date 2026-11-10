/**
 * Path containment without the platform's path module, so the renderer and
 * every process share one answer. Callers pass absolute paths.
 */

/** The path's segments with `.` dropped and `..` applied, on either separator. */
function segments(path: string): string[] {
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
