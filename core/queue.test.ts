import { describe, expect, it } from 'vitest'
import { reviewQueue } from './queue.ts'
import type { ReportResult } from './schemas.ts'

const r = (
  sample: string,
  caseId: string | null,
  total: number | null,
  confidence: number | null,
): ReportResult => ({
  sample,
  case: caseId,
  label: null,
  tests: [],
  artifacts: [],
  primary: null,
  words: 0,
  range: null,
  packs: {},
  scores: { total },
  flags: [],
  confidence,
})

describe('reviewQueue', () => {
  it('puts the least certain judge first when spreads match', () => {
    const queue = reviewQueue([
      { name: 'run1', results: [r('a-s1', 'a', 50, 0.9), r('b-s1', 'b', 50, 0.2)] },
    ])
    expect(queue.map((q) => q.key)).toEqual(['run1/b-s1', 'run1/a-s1'])
  })

  it('puts cases whose samples disagree ahead at equal confidence', () => {
    const queue = reviewQueue([
      {
        name: 'run1',
        results: [
          r('a-s1', 'a', 50, 0.5),
          r('a-s2', 'a', 52, 0.5),
          r('b-s1', 'b', 10, 0.5),
          r('b-s2', 'b', 90, 0.5),
        ],
      },
    ])
    expect(queue.slice(0, 2).map((q) => q.result.case)).toEqual(['b', 'b'])
    expect(queue[0].caseSpread).toBe(80)
  })

  it('leaves out reviewed keys', () => {
    const queue = reviewQueue(
      [{ name: 'run1', results: [r('a-s1', 'a', 50, 0.5), r('a-s2', 'a', 60, 0.5)] }],
      new Set(['run1/a-s1']),
    )
    expect(queue.map((q) => q.key)).toEqual(['run1/a-s2'])
  })

  it('treats unscored results as zero spread and missing confidence as 0.5', () => {
    const [item] = reviewQueue([{ name: 'run1', results: [r('x-s1', null, null, null)] }])
    expect(item).toMatchObject({ key: 'run1/x-s1', caseSpread: 0, priority: 0.5 })
  })

  it('measures spread within a run, not across runs', () => {
    const queue = reviewQueue([
      { name: 'r1', results: [r('a-s1', 'a', 10, 0.5)] },
      { name: 'r2', results: [r('a-s1', 'a', 90, 0.5)] },
    ])
    expect(queue.every((q) => q.caseSpread === 0)).toBe(true)
  })
})
