/**
 * The reading gate, offline: `launch-note`'s stored gradings, made on its
 * stored readings, scored by the code as it is now (code's answers and the
 * facts that cannot be marked among them), the same with every fact they set
 * aside marked as a reader would, and its gold readings answered by code on
 * the stored outputs and on each one changed to miss, held to the numbers
 * pinned in `scripts/reading-bench/pinned.ts`. A change to how stored answers are read,
 * how a long output's parts join, or how code answers an exact test moves
 * these numbers, and fails here until they are pinned again on purpose.
 *
 * `READING_GATE_REPORT=1` prints what was counted, to pin from.
 */
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countGold, countGrading, countMarked } from '../../../scripts/reading-bench/count.ts'
import { STORED } from '../../../scripts/reading-bench/pinned.ts'

const SKILL = resolve(import.meta.dirname, '../../../fixtures/launch-note')
const report = (what: string, value: unknown) => {
  if (process.env.READING_GATE_REPORT) console.log(what, JSON.stringify(value, null, 2))
}

describe('the reading gate on launch-note', () => {
  it('holds the stored gradings to their pinned counts against the key', () => {
    const { runs, total, unknown } = countGrading(SKILL)
    report('grading', { runs, total })
    expect(runs).toHaveLength(5)
    expect(unknown).toBe(0)
    const { wrongCeiling, ...held } = STORED.grading
    expect(total.wrong).toBeLessThanOrEqual(wrongCeiling)
    expect({
      right: total.right,
      unsure: total.unsure,
      unread: total.unread,
      inapplicable: total.inapplicable,
      unmarkable: total.unmarkable,
      byCode: total.byCode,
    }).toEqual(held)
    // A sure wrong answer of code's is never within a ceiling.
    expect(total.byCodeWrong).toBe(0)
  })

  it('counts the reader’s mark on every fact set aside, as theirs, and as the key answers it', () => {
    const marked = countMarked(SKILL)
    report('marked', marked)
    expect(marked.wrong).toBe(0)
    expect(marked.counted).toBe(marked.marked)
    expect(marked).toEqual(STORED.marked)
  })

  it('holds the gold readings to the key on the stored outputs and on them changed to miss', () => {
    const gold = countGold(SKILL)
    const pinned = (side: typeof gold.stored, facts: number) => ({
      facts,
      agreed: side.agreed,
      missed: side.missed,
      disagreedCeiling: 0,
    })
    report('gold', {
      stored: pinned(gold.stored, gold.facts),
      mutated: pinned(gold.mutated, gold.changedFacts),
    })
    expect(gold.stored.disagreements).toEqual([])
    expect(gold.mutated.disagreements).toEqual([])
    expect(pinned(gold.stored, gold.facts)).toEqual(STORED.stored)
    expect(pinned(gold.mutated, gold.changedFacts)).toEqual(STORED.mutated)
  })
})
