import { describe, expect, it } from 'vitest'
import { type StatementAnswer, unmetFlag } from './score.ts'

const answer = (weight: number): StatementAnswer => ({
  id: '01-names',
  text: 'The note names Priya.',
  weight,
  noul: 0.2,
  units: null,
  best: null,
})

describe('unmetFlag', () => {
  it('names the weight only when it is not 1', () => {
    expect(unmetFlag(answer(1))).toBe('grader 01-names not met: The note names Priya.')
    expect(unmetFlag(answer(2))).toBe('grader 01-names (×2) not met: The note names Priya.')
  })
})
