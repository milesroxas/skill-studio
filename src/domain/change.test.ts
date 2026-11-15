import { describe, expect, it } from 'vitest'
import { changeAnswers, countedApart } from './change.ts'
import { NO_CORRECTIONS, type Verdict } from './pack.ts'

describe('changeAnswers', () => {
  it('keeps the reader’s answer only on a fact answered at both ends', () => {
    const kept = changeAnswers(
      [{ 'rule:Be brief.': false, 'check:Names Priya.': true }],
      [{ 'rule:Be brief.': true }, { 'check:Is short.': true }],
    )
    // The rule is answered at both ends, on an output of each; each check at one end only.
    expect(kept.a).toEqual([{ 'rule:Be brief.': false }])
    expect(kept.b).toEqual([{ 'rule:Be brief.': true }, NO_CORRECTIONS])
  })

  it('reads every fact as Jev answered it when the reader answered at one end only', () => {
    const kept = changeAnswers([NO_CORRECTIONS], [{ 'rule:Be brief.': true }])
    expect(kept).toEqual({ a: [NO_CORRECTIONS], b: [NO_CORRECTIONS] })
  })

  it('hands back the same answers when every one is kept', () => {
    const a = { 'rule:Be brief.': true }
    const b = { 'rule:Be brief.': true }
    const kept = changeAnswers([a], [b])
    expect(kept.a[0]).toBe(a)
    expect(kept.b[0]).toBe(b)
  })
})

describe('countedApart', () => {
  const rule = (text: string, over: Partial<Verdict> = {}): Verdict =>
    ({
      kind: 'rule',
      id: `rule:${text}`,
      text,
      layer: 'adherence',
      met: true,
      jev: true,
      open: true,
      corrected: false,
      ...over,
    }) as Verdict
  const unsure = (text: string) => rule(text, { met: false, jev: null, aside: 'unsure' })

  it('is true when a fact both ends were asked counts at one and is set aside at the other', () => {
    expect(countedApart([[rule('A'), rule('B')]], [[rule('A'), unsure('B')]])).toBe(true)
    // Set aside on one attempt of an end is set aside at that end.
    expect(countedApart([[rule('A')]], [[rule('A')], [unsure('A')]])).toBe(true)
    expect(countedApart([[rule('A')]], [[rule('A', { aside: 'inapplicable', met: false })]])).toBe(
      true,
    )
  })

  it('is false when both ends counted and set aside the same facts, met or missed', () => {
    expect(
      countedApart(
        [[rule('A', { met: false, jev: false }), unsure('B')]],
        [[rule('A'), unsure('B')]],
      ),
    ).toBe(false)
  })

  it('passes over a fact only one end was asked, such as a rule edited between versions', () => {
    expect(countedApart([[rule('A'), unsure('Old')]], [[rule('A'), rule('New')]])).toBe(false)
  })

  it('tells a fact by its layer too', () => {
    const inLook = rule('B', { layer: 'visual' })
    expect(countedApart([[rule('B'), inLook]], [[unsure('B'), inLook]])).toBe(true)
    expect(countedApart([[inLook]], [[unsure('B')]])).toBe(false)
  })
})
