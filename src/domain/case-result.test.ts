import { describe, expect, it } from 'vitest'
import {
  blankOf,
  type CaseEnds,
  caseResult,
  caseResults,
  checkSlots,
  twoCounts,
} from './case-result.ts'
import { type Corrections, NO_CORRECTIONS, type Verdict } from './pack.ts'
import { codeVerdict, jevVerdict } from './verdict.ts'

const cuts = { yes: 0.7, no: 0.3 }

/**
 * One attempt as Jev answered it: each check by its words and Jev's
 * probability, a rule where the words start with "rule ". A check given
 * `[p, weight]` counts that many times.
 */
type Attempt = Record<string, number | [number, number]>

/** A case at two ends, each attempt scored through `jevVerdict` with the answers given, as every pack scores. */
function ends(
  a: Attempt[],
  b: Attempt[],
  answers: { a?: Corrections[]; b?: Corrections[] } = {},
): CaseEnds {
  const score = (attempts: Attempt[], given: Corrections[]): Verdict[][] =>
    attempts.map((attempt, i) =>
      Object.entries(attempt).map(([text, answer]) => {
        const [noul, weight] = typeof answer === 'number' ? [answer, 1] : answer
        const rule = text.startsWith('rule ')
        return jevVerdict(
          {
            kind: rule ? 'rule' : 'check',
            text,
            layer: rule ? 'adherence' : 'rubric',
            ...(weight === 1 ? {} : { weight }),
          },
          noul,
          cuts,
          given[i] ?? NO_CORRECTIONS,
        )
      }),
    )
  return {
    case: 'email',
    a: answers.a ?? a.map(() => NO_CORRECTIONS),
    b: answers.b ?? b.map(() => NO_CORRECTIONS),
    verdictsOf: (end, given) => score(end === 'a' ? a : b, given),
  }
}

/** One attempt's verdicts as Jev answered it, with no answers of the reader's. */
const verdictsOf = (attempt: Attempt): Verdict[] =>
  ends([attempt], []).verdictsOf('a', [NO_CORRECTIONS])[0] as Verdict[]

const MET = 0.9
const MISSED = 0.1
const UNSURE = 0.5

describe('caseResult, with one attempt at each end', () => {
  it('is better or worse by the difference, and says a small move may be chance', () => {
    const better = caseResult(ends([{ x: MISSED, y: MET }], [{ x: MET, y: MET }]))
    expect(better).toMatchObject({ move: 'better', alone: true, checks: 2, left: 0 })
    expect(better.a).toEqual([{ met: 1, total: 2 }])
    expect(better.b).toEqual([{ met: 2, total: 2 }])
    expect(caseResult(ends([{ x: MET }], [{ x: MISSED }]))).toMatchObject({
      move: 'worse',
      alone: true,
    })
  })

  it('is the same only where nothing moved', () => {
    expect(caseResult(ends([{ x: MET, y: MISSED }], [{ x: MISSED, y: MET }]))).toMatchObject({
      move: 'same',
      alone: true,
    })
  })

  it('counts a check by its weight', () => {
    // One heavy check met against two light ones: 3 of 4 against 2 of 4.
    const moved = caseResult(
      ends(
        [{ x: [MET, 3], y: MISSED }],
        [
          { x: [MISSED, 3], y: MET },
          { x: [MET, 3], y: MET },
        ],
      ),
    )
    expect(moved.a).toEqual([{ met: 3, total: 4 }])
    expect(moved.b).toEqual([
      { met: 1, total: 4 },
      { met: 4, total: 4 },
    ])
  })
})

describe('caseResult, with more than one attempt', () => {
  it('is the same where one end’s mean lies inside the spread of the other’s attempts', () => {
    // 1 of 2 and 2 of 2 at the first end: a second end at 2 of 2 is inside that spread.
    const same = caseResult(
      ends(
        [
          { x: MET, y: MISSED },
          { x: MET, y: MET },
        ],
        [{ x: MET, y: MET }],
      ),
    )
    expect(same).toMatchObject({ move: 'same', alone: false })
    // And read the other way round.
    expect(
      caseResult(
        ends(
          [{ x: MET, y: MET }],
          [
            { x: MET, y: MISSED },
            { x: MET, y: MET },
          ],
        ),
      ).move,
    ).toBe('same')
  })

  it('is better or worse where neither mean lies inside the other end’s spread', () => {
    const a = [
      { x: MISSED, y: MISSED },
      { x: MET, y: MISSED },
    ]
    const b = [
      { x: MET, y: MET },
      { x: MET, y: MET },
    ]
    expect(caseResult(ends(a, b))).toMatchObject({ move: 'better', alone: false })
    expect(caseResult(ends(b, a))).toMatchObject({ move: 'worse', alone: false })
  })
})

describe('caseResult reads checks both ends were marked on, and nothing else', () => {
  it('leaves rules out', () => {
    const read = caseResult(ends([{ 'rule a': MISSED, x: MET }], [{ 'rule a': MET, x: MET }]))
    expect(read).toMatchObject({ move: 'same', checks: 1, left: 0 })
  })

  it('leaves out a check only one end was marked on', () => {
    const read = caseResult(ends([{ x: MET }], [{ x: MET, y: MISSED }]))
    expect(read).toMatchObject({ move: 'same', checks: 1, left: 1 })
  })

  it('leaves out at both ends a check either set aside on any attempt', () => {
    // y is not sure on the second end's second attempt, so it counts on none.
    const read = caseResult(
      ends(
        [{ x: MET, y: MISSED }],
        [
          { x: MET, y: MET },
          { x: MET, y: UNSURE },
        ],
      ),
    )
    expect(read).toMatchObject({ move: 'same', checks: 1, left: 1 })
    expect(read.b).toEqual([
      { met: 1, total: 1 },
      { met: 1, total: 1 },
    ])
  })

  it('has no checks to compare where none was marked at both ends, and is never the same', () => {
    expect(caseResult(ends([{ x: MET }], [{ y: MET }]))).toMatchObject({
      move: 'none',
      checks: 0,
      left: 2,
      alone: false,
    })
    expect(caseResult(ends([{ x: UNSURE }], [{ x: MET }])).move).toBe('none')
    expect(caseResult(ends([{ 'rule a': MET }], [{ 'rule a': MET }])).move).toBe('none')
    expect(caseResult(ends([], [{ x: MET }])).move).toBe('none')
  })

  it('leaves out an attempt marked on none of the checks read', () => {
    const read = caseResult(ends([{ x: MET }, { y: MET }], [{ x: MISSED }]))
    expect(read.a).toEqual([{ met: 1, total: 1 }])
    expect(read).toMatchObject({ move: 'worse', alone: true })
  })

  it('leaves out a fact that is no rule or check, and a finding in no layer', () => {
    const plain: CaseEnds = {
      case: 'email',
      a: [NO_CORRECTIONS],
      b: [NO_CORRECTIONS],
      verdictsOf: (end) => [
        [
          codeVerdict({ kind: 'check', text: 'x', layer: 'rubric' }, end === 'b'),
          codeVerdict({ kind: 'other', text: 'too long', layer: 'rubric' }, end === 'a'),
          codeVerdict({ kind: 'check', text: 'found', layer: null }, false),
        ],
      ],
    }
    expect(caseResult(plain)).toMatchObject({ move: 'better', checks: 1 })
  })
})

describe('caseResult and the reader’s answers', () => {
  it('counts an answer the reader gave at both ends, at both', () => {
    const answers = { a: [{ 'check:x': true }], b: [{ 'check:x': false }] }
    const read = caseResult(ends([{ x: MISSED }], [{ x: MET }], answers))
    expect(read).toMatchObject({ move: 'worse', oneSided: false })
  })

  it('reads an answer only one end holds as Jev answered it', () => {
    const read = caseResult(ends([{ x: MISSED }], [{ x: MISSED }], { b: [{ 'check:x': true }] }))
    expect(read).toMatchObject({ move: 'same', oneSided: true })
  })

  it('makes a check Jev was not sure of count where the reader answered it at both ends', () => {
    const answers = { a: [{ 'check:x': false }], b: [{ 'check:x': true }] }
    expect(caseResult(ends([{ x: UNSURE }], [{ x: UNSURE }], answers)).move).toBe('better')
  })
})

describe('caseResult’s marks and the checks it moved by', () => {
  it('lays both ends’ checks in one order, the second end’s first, a mark each', () => {
    const read = caseResult(ends([{ x: MISSED, z: MET }], [{ y: MET, x: MET }]))
    expect(read.slots.map((s) => [s.text, s.a, s.b])).toEqual([
      ['y', null, 'met'],
      ['x', 'missed', 'met'],
      ['z', 'met', null],
    ])
  })

  it('counts checks one each, whatever their weight, over the checks read', () => {
    // x counts three times and moved one way, y once and moved the other: better by share, the same by count.
    const read = caseResult(ends([{ x: [MISSED, 3], y: MET }], [{ x: [MET, 3], y: MISSED }]))
    expect(read).toMatchObject({ move: 'better', moved: 0 })
    expect(caseResult(ends([{ x: MISSED, y: MISSED }], [{ x: MET, y: MET }]))).toMatchObject({
      moved: 2,
      marks: { a: 0, b: 2 },
    })
    // A check only one end was asked moves nothing.
    expect(caseResult(ends([{ x: MET }], [{ x: MET, y: MET }])).moved).toBe(0)
  })

  it('has no count where nothing is compared', () => {
    expect(caseResult(ends([{ x: MET }], [{ y: MET }])).moved).toBeNull()
  })

  it('marks a check met on some attempts and missed on others as split, which is not met', () => {
    const read = caseResult(ends([{ x: MISSED }, { x: MISSED }], [{ x: MET }, { x: MISSED }]))
    expect(read.slots[0]).toMatchObject({ a: 'missed', b: 'split' })
  })

  it('marks a check set aside on every attempt as unmarked', () => {
    expect(checkSlots([], [verdictsOf({ x: UNSURE })])[0]).toMatchObject({
      a: null,
      b: 'unmarked',
    })
  })

  it('says why an end has no check to read', () => {
    expect(blankOf([verdictsOf({ 'rule a': MET })])).toBe('no-checks')
    expect(blankOf([])).toBe('no-checks')
    expect(blankOf([verdictsOf({ x: UNSURE })])).toBe('unsure')
    expect(blankOf([verdictsOf({ x: MET, y: UNSURE })])).toBeNull()
    expect(caseResult(ends([{ x: UNSURE }], [{ x: MET }])).blank).toEqual({ a: 'unsure', b: null })
  })
})

describe('caseResults', () => {
  it('counts each move, with no checks to compare apart from the same', () => {
    const results = caseResults([
      ends([{ x: MISSED }], [{ x: MET }]),
      ends([{ x: MET }], [{ x: MET }]),
      ends([{ x: MET }], [{ x: MISSED }]),
      ends([{ x: MET }], [{ y: MET }]),
      ends([{ x: MISSED }], [{ x: MET }]),
    ])
    expect(results).toMatchObject({ better: 2, same: 1, worse: 1, none: 1 })
    expect(results.cases.map((c) => c.move)).toEqual(['better', 'same', 'worse', 'none', 'better'])
  })

  it('is all nought for no cases', () => {
    expect(caseResults([])).toEqual({ cases: [], better: 0, same: 0, worse: 0, none: 0 })
  })
})

describe('twoCounts', () => {
  const verdicts = ends([{ 'rule a': MET, 'rule b': MISSED, x: MET, y: UNSURE }], []).verdictsOf(
    'a',
    [NO_CORRECTIONS],
  )[0]

  it('counts checks met and rules followed apart', () => {
    expect(twoCounts(verdicts, 'with_skill')).toEqual({
      checks: { met: 1, total: 1, unsure: 1, unread: 0 },
      rules: { met: 1, total: 2, unsure: 0, unread: 0 },
    })
    expect(twoCounts(verdicts, 'old_skill').rules).not.toBeNull()
  })

  it('has no rules count for a run without the skill', () => {
    expect(twoCounts(verdicts, 'without_skill')).toEqual({
      checks: { met: 1, total: 1, unsure: 1, unread: 0 },
      rules: null,
    })
  })

  it('has no count of a kind the output has none of', () => {
    expect(twoCounts([], 'with_skill')).toEqual({ checks: null, rules: null })
  })
})
