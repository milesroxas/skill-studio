import { describe, expect, it } from 'vitest'
import { EVERY_CASE, everyCaseId, isEveryCase, withEveryCase } from './every-case.ts'
import type { Case, Grader } from './schemas.ts'
import { checkIds } from './verdict.ts'

const check = (id: string, statement: string): Grader => ({
  id,
  type: 'llm',
  focus: null,
  weight: 1,
  statement,
  image: null,
})

const testCase: Case = {
  id: 'email',
  legacyId: null,
  title: 'Email',
  prompt: 'Write the email.',
  expectedOutcome: '',
  files: [],
  graders: [check('01-names', 'It names the product.')],
  settings: { tags: [], maxTurns: null, timeoutSeconds: null, allowedTools: null },
  bench: {},
  source: 'folder',
  dir: 'evals/cases/email',
}

describe('the checks for every case', () => {
  it('are named apart from any case’s own check', () => {
    expect(everyCaseId('01-names')).toBe(`${EVERY_CASE}01-names`)
    expect(isEveryCase(check(everyCaseId('01-names'), 'x'))).toBe(true)
    expect(isEveryCase(check('01-names', 'x'))).toBe(false)
  })

  it('come after the case’s own, and leave it as it was when there are none', () => {
    expect(withEveryCase(testCase, [])).toBe(testCase)
    const every = [check(everyCaseId('01-version'), 'It gives the version.')]
    const graded = withEveryCase(testCase, every)
    expect(graded.graders.map((g) => g.id)).toEqual(['01-names', 'every/01-version'])
    expect(testCase.graders).toHaveLength(1)
    // Laid over again, they are not there twice.
    expect(withEveryCase(graded, every).graders).toHaveLength(2)
  })

  it('leave a case’s own check its name where both say the same, so a mark on one stays on it', () => {
    const graded = withEveryCase(testCase, [
      check(everyCaseId('01-names'), 'It names the product.'),
    ])
    const ids = checkIds(graded.graders.map((g) => ({ id: g.id, text: g.statement })))
    expect(ids).toEqual([
      'check:It names the product.',
      'check:It names the product. #every/01-names',
    ])
  })
})
