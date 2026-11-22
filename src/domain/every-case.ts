/**
 * Checks for every case: what every answer to the skill owes, kept with the
 * cases in `evals/graders/` and not in SKILL.md. A rule is named by its words,
 * so an edited rule is a new fact and drops out of the change between two
 * versions; a check for every case stays the same from one version to the
 * next, so a result can be read on it across an edit. Each one is asked of
 * every output of every case beside the case's own checks, counted in the same
 * layer and shown as a check. Pure.
 */
import type { Case, Grader } from './schemas.ts'

/**
 * What the id of a check for every case starts with. A case's own check is
 * named by its file's name, which holds no `/`, so the two never share an id,
 * and a reading or a flag of one is never taken for the other.
 */
export const EVERY_CASE = 'every/'

/** The id of the check for every case in the file `name` (no `.md`). */
export const everyCaseId = (name: string): string => `${EVERY_CASE}${name}`

/** Whether a check is one of the checks for every case. */
export const isEveryCase = (grader: Pick<Grader, 'id'>): boolean => grader.id.startsWith(EVERY_CASE)

/**
 * `testCase` with `every` after its own checks: the checks an output of it is
 * graded on. The case's own come first, so where one of `every` says what one
 * of them says, the case's keeps the name it had (`checkIds`), and the reader's
 * answers on it stay where they were. The same object when `every` is empty.
 */
export function withEveryCase(testCase: Case, every: readonly Grader[]): Case {
  if (!every.length) return testCase
  return { ...testCase, graders: [...testCase.graders.filter((g) => !isEveryCase(g)), ...every] }
}
