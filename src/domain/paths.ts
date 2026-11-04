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
