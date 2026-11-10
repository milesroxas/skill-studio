import type { Verdict } from '@domain/pack.ts'
import { describe, expect, it } from 'vitest'
import { markChecks, metShare, type StatementAnswer, unmetFlag } from './score.ts'

const answer = (weight: number, over: Partial<StatementAnswer> = {}): StatementAnswer => ({
  id: '01-names',
  text: 'The note names Priya.',
  weight,
  noul: 0.2,
  units: null,
  best: null,
  ...over,
})

describe('unmetFlag', () => {
  it('names the weight only when it is not 1', () => {
    expect(unmetFlag(answer(1))).toBe('grader 01-names not met: The note names Priya.')
    expect(unmetFlag(answer(2))).toBe('grader 01-names (×2) not met: The note names Priya.')
  })
})

describe('metShare', () => {
  const fact = (met: boolean, weight?: number): Verdict => ({
    id: `check:${met}${weight}`,
    kind: 'check',
    text: 'x',
    met,
    open: false,
    corrected: false,
    layer: 'rubric',
    ...(weight === undefined ? {} : { weight }),
  })

  it('counts each fact by its weight, a fact with none as one', () => {
    // Met: 2 of 2 + 1 + 1 = 4. A plain count would say 1 of 3.
    expect(metShare([fact(true, 2), fact(false), fact(false)])).toBe(0.5)
    expect(metShare([fact(false, 5), fact(true)])).toBeCloseTo(1 / 6)
    expect(metShare([fact(true), fact(true)])).toBe(1)
  })

  it('has no share where there are no facts', () => {
    expect(metShare([])).toBeNull()
  })
})

describe('markChecks', () => {
  const statements = [
    answer(2, { id: 'g1', text: 'Names Priya.', noul: 0.9 }),
    answer(1, { id: 'g2', text: 'Says Sunday.', noul: 0.2 }),
    answer(1, { id: 'g3', text: 'Two sentences.', noul: 0.5 }),
  ]

  it('marks each check for its layer, the share by weight, and a flag per miss', () => {
    const marked = markChecks(statements, 'review', 0.5, {})
    expect(marked.verdicts.map((v) => [v.id, v.met, v.layer, v.weight])).toEqual([
      ['check:Names Priya.', true, 'review', 2],
      ['check:Says Sunday.', false, 'review', undefined],
      ['check:Two sentences.', true, 'review', undefined],
    ])
    expect(marked.share).toBe(3 / 4)
    expect(marked.flags).toEqual(['grader g2 not met: Says Sunday.'])
  })

  it('lets the reader’s answer stand over Jev’s, in the share and the flags alike', () => {
    const marked = markChecks(statements, 'review', 0.5, {
      'check:Names Priya.': false,
      'check:Says Sunday.': true,
    })
    expect(marked.share).toBe(2 / 4)
    expect(marked.flags).toEqual(['grader g1 (×2) not met: Names Priya.'])
  })

  it('leaves the layer out for a case with no checks', () => {
    expect(markChecks([], 'review', 0.5, {})).toEqual({ verdicts: [], share: null, flags: [] })
  })
})
