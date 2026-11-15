/**
 * Which drafts one writer changed, so two writers of one skill's drafts, the
 * desktop app and `st serve`, each store their own and keep the other's. Pure.
 */
import type { SkillDrafts } from './schemas.ts'

/** The drafts a writer set or cleared since it last stored them, by key. */
export interface TouchedDrafts {
  files: string[]
  cases: string[]
  /** Case bases set or cleared, by draft key. */
  bases: string[]
}

/** Keys whose value is not the same object in `a` and `b`: set, changed or cleared. */
const changedKeys = (a: Record<string, unknown>, b: Record<string, unknown>): string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => a[key] !== b[key])

/** What changed from `before` to `after`, one change of the drafts. */
export const touchedBetween = (before: SkillDrafts, after: SkillDrafts): TouchedDrafts => ({
  files: changedKeys(before.files, after.files),
  cases: changedKeys(before.cases, after.cases),
  bases: changedKeys(before.caseBases ?? {}, after.caseBases ?? {}),
})

/** Two runs of changes as one. */
export const touchedBoth = (a: TouchedDrafts, b: TouchedDrafts): TouchedDrafts => ({
  files: [...new Set([...a.files, ...b.files])],
  cases: [...new Set([...a.cases, ...b.cases])],
  bases: [...new Set([...a.bases, ...b.bases])],
})

/** `stored` with each key in `keys` taken from `mine`: set where `mine` has it, cleared where not. */
function over<T>(stored: Record<string, T>, mine: Record<string, T>, keys: string[]) {
  const out = { ...stored }
  for (const key of keys)
    if (Object.hasOwn(mine, key)) out[key] = mine[key]
    else delete out[key]
  return out
}

/**
 * The drafts to store when a writer that changed `touched` holds `mine` and
 * the file holds `stored`: each draft it changed as it has it, every other
 * as the file has it, so a draft another writer stored meanwhile stays. A
 * case's base goes with its case.
 */
export function mergeDrafts(
  stored: SkillDrafts,
  mine: SkillDrafts,
  touched: TouchedDrafts,
): SkillDrafts {
  const cases = over(stored.cases, mine.cases, touched.cases)
  const bases = over(stored.caseBases ?? {}, mine.caseBases ?? {}, [
    ...new Set([...touched.bases, ...touched.cases]),
  ])
  return {
    files: over(stored.files, mine.files, touched.files),
    cases,
    // A base is kept only beside the draft it dates.
    caseBases: Object.fromEntries(
      Object.entries(bases).filter(([key]) => Object.hasOwn(cases, key)),
    ),
    updatedAt: stored.updatedAt,
  }
}
