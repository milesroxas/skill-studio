import { describe, expect, it } from 'vitest'
import { changeAnswers, changeReading } from './change.ts'
import { type Corrections, NO_CORRECTIONS, type Verdict } from './pack.ts'
import { jevVerdict } from './verdict.ts'

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

describe('changeReading', () => {
  const cuts = { yes: 0.7, no: 0.3 }
  /** One output as Jev answered it, by each rule's probability, in the adherence layer unless named. */
  type Answers = Record<string, number | [number, string]>
  /** A scorer as every pack counts: each fact through `jevVerdict`, with the answers given. */
  const scorer =
    (ends: { a: Answers[]; b: Answers[] }) =>
    (end: 'a' | 'b', answers: Corrections[]): Verdict[][] =>
      ends[end].map((output, i) =>
        Object.entries(output).map(([text, answer]) => {
          const [noul, layer] = typeof answer === 'number' ? [answer, 'adherence'] : answer
          return jevVerdict({ kind: 'rule', text, layer }, noul, cuts, answers[i])
        }),
      )
  /** The share met of each end's facts that count, over all its outputs. */
  const shareAt = (verdicts: Verdict[][]) => {
    const counted = verdicts.flat().filter((v) => !v.aside)
    return counted.length ? counted.filter((v) => v.met).length / counted.length : null
  }
  const read = (a: Answers[], b: Answers[], answers?: { a: Corrections[]; b: Corrections[] }) => {
    const score = scorer({ a, b })
    const given = answers ?? { a: a.map(() => NO_CORRECTIONS), b: b.map(() => NO_CORRECTIONS) }
    const reading = changeReading(given.a, given.b, score)
    return {
      reading,
      from: shareAt(score('a', reading.a)),
      to: shareAt(score('b', reading.b)),
    }
  }

  it('leaves out at both ends a fact both were asked and one set aside', () => {
    // A met and B met, then A met and B not sure: B counts at neither end.
    const { reading, from, to } = read([{ A: 0.9, B: 0.9 }], [{ A: 0.9, B: 0.5 }])
    expect(reading.left).toEqual(['rule'])
    expect([from, to]).toEqual([1, 1])
    // Missed before, not sure now: the change is A's alone.
    const missed = read([{ A: 0.1, B: 0.1 }], [{ A: 0.9, B: 0.5 }])
    expect([missed.from, missed.to]).toEqual([0, 1])
  })

  it('leaves out a fact set aside on one attempt of an end, and one that does not apply', () => {
    expect(
      read(
        [{ A: 0.9, B: 0.1 }],
        [
          { A: 0.9, B: 0.9 },
          { A: 0.9, B: 0.5 },
        ],
      ).to,
    ).toBe(1)
    const inapplicable = changeReading([NO_CORRECTIONS], [NO_CORRECTIONS], (end) => [
      [
        jevVerdict({ kind: 'rule', text: 'A', layer: 'adherence' }, 0.9, cuts, NO_CORRECTIONS),
        jevVerdict(
          { kind: 'rule', text: 'B', layer: 'adherence' },
          0.9,
          cuts,
          NO_CORRECTIONS,
          end === 'a' ? 1 : 0.1,
        ),
      ],
    ])
    expect(inapplicable.left).toEqual(['rule'])
  })

  it('counts a fact only one end was asked, such as a rule edited between versions', () => {
    const { reading, from, to } = read([{ A: 0.9, Old: 0.5 }], [{ A: 0.9, New: 0.1 }])
    expect(reading.left).toEqual([])
    expect([from, to]).toEqual([1, 0.5])
  })

  it('tells a fact by its layer too', () => {
    const { reading } = read([{ B: 0.9, C: [0.9, 'visual'] }], [{ B: 0.9, C: [0.5, 'visual'] }])
    expect(reading.left).toEqual(['rule'])
    expect(read([{ C: [0.9, 'visual'] }], [{ C: 0.5 }]).reading.left).toEqual([])
  })

  it('counts a fact the reader answered at both ends, and leaves out one they answered at one', () => {
    const at = (met: boolean) => ({ 'rule:B': met })
    const both = read([{ A: 0.9, B: 0.5 }], [{ A: 0.9, B: 0.5 }], { a: [at(false)], b: [at(true)] })
    expect(both.reading).toMatchObject({ left: [], oneSided: false })
    expect([both.from, both.to]).toEqual([0.5, 1])
    const one = read([{ A: 0.9, B: 0.9 }], [{ A: 0.9, B: 0.5 }], {
      a: [NO_CORRECTIONS],
      b: [at(false)],
    })
    expect(one.reading).toMatchObject({ left: ['rule'], oneSided: true })
    expect([one.from, one.to]).toEqual([1, 1])
  })

  it('leaves nothing to count where every fact of an end is left out', () => {
    const { from, to } = read([{ A: 0.5 }], [{ A: 0.9 }])
    expect([from, to]).toEqual([null, null])
  })
})
