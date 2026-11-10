import { mergeConfig } from '@domain/config.ts'
import type { ScoreSubject } from '@domain/pack.ts'
import { titleOf, unitsOf } from '@domain/text.ts'
import { describe, expect, it, vi } from 'vitest'
import type { Jev } from '../jev.ts'
import { MissingAnswerError } from '../shared/questions.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import { writingPack } from './index.ts'
import {
  type ClaimVerdict,
  type UnitAnswer,
  type WritingJev,
  type WritingRaw,
  writingScoring,
} from './score.ts'

const config = mergeConfig({ packs: ['writing'] }, [writingScoring])
const subject: ScoreSubject = {
  case: null,
  primary: { file: 'outputs/output.md', kind: 'markdown' },
  artifacts: [],
  words: 400,
  range: null,
}

const unit = (over: Partial<UnitAnswer> = {}): UnitAnswer => ({
  text: 'A paragraph.',
  list: false,
  specificity: 1,
  selling: 0,
  decision: 0.9,
  setback: 0.9,
  aiDidWork: null,
  aiSplit: null,
  ...over,
})

const claim = (verdict: ClaimVerdict['verdict'], conflict: number | null = null): ClaimVerdict => ({
  claim: `a ${verdict} claim`,
  before: null,
  verdict,
  conflict,
  confidence: 0.8,
  evidence: [],
})

const jev = (over: Partial<WritingJev> = {}): WritingJev => ({
  opensOnWork: 0.9,
  pointEarly: 0.9,
  ending: 'implication',
  endingBefore: null,
  endingProbabilities: {},
  title: 'descriptive',
  aiBuilt: false,
  aiMentioned: false,
  grounding: null,
  perUnit: [unit()],
  ...over,
})

const raw = (over: Partial<WritingRaw> = {}): WritingRaw => ({
  kind: 'article',
  lint: { command: null, errors: 0, errorExcerpts: [], warnings: [], info: 0, failed: null },
  shape: null,
  borrowed: [],
  hasEvidence: false,
  jev: jev(),
  ...over,
})

const score = (over: Partial<WritingRaw> = {}, settings = {}) =>
  writingScoring.score(raw(over), subject, { ...config, ...settings })
const layers = (over: Partial<WritingRaw> = {}, settings = {}) => score(over, settings).layers

describe('lint', () => {
  const lint = (warnings: string[], errors = 0, failed: string | null = null) => ({
    lint: { command: null, errors, errorExcerpts: [], warnings, info: 0, failed },
  })

  it('takes a fifth off for each warning, and never goes below nothing', () => {
    expect(layers(lint([])).lint).toBe(1)
    expect(layers(lint(['a', 'b'])).lint).toBeCloseTo(0.6)
    expect(layers(lint(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).lint).toBe(0)
  })

  it('is 0 for any error, whatever the warnings', () => {
    expect(layers(lint([], 1)).lint).toBe(0)
  })

  it('is left out, with a flag, when the command failed', () => {
    const scored = score(lint([], 0, 'timed out'))
    expect(scored.layers.lint).toBeNull()
    expect(scored.flags).toContain('lint command failed: timed out')
  })
})

describe('shape', () => {
  const shape = (measures: Record<string, number | null>, questionHeadings = 0) => ({
    shape: { measures, headings: 3, questionHeadings, longHeadings: 0 },
  })
  const inBands = {
    sentenceMedian: 15,
    shortSentenceShare: 0.2,
    paragraphMedian: 50,
    oneLineShare: 0.1,
  }

  it('is the share of bands the measures fall in, with the headings as one more', () => {
    expect(layers(shape(inBands)).shape).toBe(1)
    // Both ends of a band are inside it.
    expect(layers(shape({ ...inBands, sentenceMedian: 12, oneLineShare: 0.2 })).shape).toBe(1)
    expect(layers(shape({ ...inBands, sentenceMedian: 30 })).shape).toBe(4 / 5)
    expect(layers(shape({ ...inBands, sentenceMedian: null }, 1)).shape).toBe(3 / 5)
  })

  it('is scored for an article only', () => {
    expect(layers({ kind: 'linkedinPost', ...shape(inBands) }).shape).toBeNull()
  })
})

describe('structure', () => {
  const structure = (over: Partial<WritingJev>) => layers({ jev: jev(over) }).structure

  it('weighs the opening, the point, the ending and the title by their points', () => {
    // 5 + 5 + 6 + 4 of 20.
    expect(structure({})).toBe(1)
    expect(structure({ opensOnWork: 0.2 })).toBe(15 / 20)
    expect(structure({ pointEarly: 0.2 })).toBe(15 / 20)
    expect(structure({ ending: 'recap' })).toBe(14 / 20)
    expect(structure({ title: 'hype' })).toBe(16 / 20)
    expect(structure({ title: 'claim' })).toBe(1)
  })

  it('leaves the title out when the piece has none, and the rest rescale', () => {
    expect(structure({ title: null })).toBe(1)
    expect(structure({ title: null, ending: 'moral' })).toBe(10 / 16)
  })

  it('gives an ending that only points on half, or all when the paragraph before carries the implication', () => {
    expect(structure({ ending: 'pointer' })).toBe(17 / 20)
    expect(structure({ ending: 'pointer', endingBefore: 'implication' })).toBe(1)
    expect(structure({ ending: 'pointer', endingBefore: 'detail' })).toBe(17 / 20)
  })

  it('counts an answer at the threshold as yes, and says what is missing', () => {
    expect(structure({ opensOnWork: 0.5 })).toBe(1)
    const flags = score({ jev: jev({ opensOnWork: 0.49, pointEarly: 0.1, ending: 'recap' }) }).flags
    expect(flags).toEqual([
      'opening is not inside the work',
      'point not stated in the first two paragraphs',
      'ending reads as recap',
    ])
  })

  it('is not scored for a kind outside the list', () => {
    expect(layers({ kind: 'memo' }).structure).toBeNull()
    expect(layers({ kind: 'memo' }).substance).toBe(1)
  })

  it('reads a kind named like something every object has as a kind outside the list', () => {
    expect(() => layers({ kind: 'constructor' })).not.toThrow()
    expect(layers({ kind: 'constructor' }).structure).toBeNull()
  })
})

describe('substance and tone', () => {
  const substance = (perUnit: UnitAnswer[], over: Partial<WritingJev> = {}) =>
    layers({ jev: jev({ perUnit, ...over }) }).substance

  it('weighs mean specificity, a decision and a setback by their points', () => {
    // 13 + 5 + 4 of 22.
    expect(substance([unit()])).toBe(1)
    expect(substance([unit({ specificity: 0.5 }), unit({ specificity: 0 })])).toBeCloseTo(
      (13 * 0.25 + 5 + 4) / 22,
    )
    // One paragraph with a decision is enough; none loses the points.
    expect(substance([unit({ decision: 0.1 }), unit()])).toBe(1)
    expect(substance([unit({ decision: 0.1 })])).toBe(17 / 22)
    expect(substance([unit({ setback: 0.1 })])).toBe(18 / 22)
  })

  it('adds the split of the work only where a paragraph says an AI did some', () => {
    const said = unit({ aiDidWork: 0.9, aiSplit: 0.9 })
    const vague = unit({ aiDidWork: 0.9, aiSplit: 0.1 })
    expect(substance([said])).toBe(1)
    // 22 of 25: the split is asked of one paragraph and it does not give it.
    expect(substance([vague])).toBe(22 / 25)
    expect(substance([said, vague])).toBeCloseTo((22 + 1.5) / 25)
    // A paragraph that names an AI and does not say it did the work is not asked.
    expect(substance([unit({ aiDidWork: 0.1, aiSplit: 0.1 })])).toBe(1)
    // A split Jev gave no answer on is left out, never read as a no.
    expect(substance([unit({ aiDidWork: 0.9, aiSplit: null })])).toBe(1)
    expect(substance([said, unit({ aiDidWork: 0.9, aiSplit: null })])).toBe(1)
  })

  it('costs the split when the case says an AI helped and the copy never says so', () => {
    const scored = score({ jev: jev({ aiBuilt: true }) })
    expect(scored.layers.substance).toBe(22 / 25)
    expect(scored.flags).toContain('evidence says AI helped build it; the copy does not say so')
    // Named anywhere in the copy, it is not held against it.
    expect(layers({ jev: jev({ aiBuilt: true, aiMentioned: true }) }).substance).toBe(1)
  })

  it('reads tone as one less the mean selling', () => {
    const tone = (selling: number[]) =>
      layers({ jev: jev({ perUnit: selling.map((s) => unit({ selling: s })) }) }).tone
    expect(tone([0])).toBe(1)
    expect(tone([1, 0.5])).toBe(0.25)
    expect(tone([])).toBe(1)
  })
})

describe('grounding', () => {
  const grounding = (verdicts: ClaimVerdict[], settings = {}, hasEvidence = true) =>
    score({ hasEvidence, jev: jev({ grounding: { verdicts } }) }, settings)

  it('is (supported + prior) over (factual claims + 1), so one supported claim of one reads 95', () => {
    expect(grounding([claim('supported')]).layers.grounding).toBeCloseTo(0.95)
    expect(grounding([claim('supported'), claim('supported')]).layers.grounding).toBeCloseTo(
      2.9 / 3,
    )
    expect(grounding([claim('supported'), claim('missing')]).layers.grounding).toBeCloseTo(1.9 / 3)
    expect(grounding([claim('missing')]).layers.grounding).toBeCloseTo(0.45)
  })

  it('leaves a claim with no fact in it out of the count', () => {
    const scored = grounding([claim('supported'), claim('no_facts'), claim('no_facts')])
    expect(scored.layers.grounding).toBeCloseTo(0.95)
    // Nothing but such claims: there is nothing to ground.
    expect(grounding([claim('no_facts')]).layers.grounding).toBeNull()
  })

  it('caps the layer at any contradiction the second question agrees with', () => {
    const claims = [claim('supported'), claim('supported'), claim('contradicted', 0.9)]
    const scored = grounding(claims)
    // (2 + 0.9) / 4 = 0.725, capped at 0.5.
    expect(scored.layers.grounding).toBe(0.5)
    expect(scored.flags).toContain('CONTRADICTS evidence: "a contradicted claim"')
    // Below the cap already, the share stands.
    expect(grounding([claim('contradicted', 0.9), claim('missing')]).layers.grounding).toBeCloseTo(
      0.3,
    )
  })

  it('reads a contradiction the second question does not agree with as a claim not in the evidence', () => {
    const scored = grounding([claim('supported'), claim('contradicted', 0.2)])
    expect(scored.layers.grounding).toBeCloseTo(1.9 / 3)
    expect(scored.flags).toEqual(['not in evidence: "a contradicted claim"'])
  })

  it('is left out with no evidence, or when Jev was not asked', () => {
    expect(grounding([claim('supported')], {}, false).layers.grounding).toBeNull()
    expect(layers({ hasEvidence: true }).grounding).toBeNull()
  })

  it('follows the prior and the cap the config sets', () => {
    expect(grounding([claim('supported')], { groundingPrior: 0 }).layers.grounding).toBe(0.5)
    const capped = grounding([claim('supported'), claim('contradicted', 0.9)], {
      contradictionCap: 0.2,
    })
    expect(capped.layers.grounding).toBe(0.2)
  })
})

describe('the pack as a whole', () => {
  it('leaves every judged layer out without Jev, and every layer out without answers', () => {
    expect(layers({ jev: null })).toEqual({
      lint: 1,
      shape: null,
      structure: null,
      substance: null,
      tone: null,
      grounding: null,
    })
    const none = writingScoring.score(null, subject, config)
    expect(Object.values(none.layers).every((share) => share === null)).toBe(true)
    expect(none.verdicts).toEqual([])
  })

  it('reports what it found wrong as findings no reader can answer', () => {
    const scored = score({ borrowed: ['lorem'], jev: jev({ ending: 'moral' }) })
    expect(scored.flags).toEqual(['borrowed line: lorem', 'ending reads as moral'])
    expect(scored.verdicts.map((v) => [v.text, v.met, v.open, v.layer])).toEqual([
      ['borrowed line: lorem', false, false, null],
      ['ending reads as moral', false, false, null],
    ])
  })

  it('says how sure Jev was of each yes/no, a choice’s own confidence left out', () => {
    const answers = jev({
      opensOnWork: 1,
      pointEarly: 0.5,
      perUnit: [unit({ decision: 0.75, setback: 0 })],
      grounding: { verdicts: [claim('supported')] },
    })
    expect(writingScoring.certainties(raw({ jev: answers }))).toEqual([1, 0, 0.5, 1])
    expect(writingScoring.certainties(raw({ jev: null }))).toEqual([])
  })
})

describe('the questions asked of some pieces only', () => {
  const text = [
    '# How I built the importer',
    '',
    'I built the importer with Claude writing the parsing code, and I chose CSV over JSON for the export.',
    '',
    'It broke twice on quoted commas before it held.',
    '',
    'What it adds up to: a parser is cheaper to test than to trust.',
  ].join('\n')
  const primary = { file: 'outputs/output.md', kind: 'markdown' as const }
  const input: JudgeInput = {
    text,
    units: unitsOf(text),
    title: titleOf(text),
    case: null,
    images: [],
    rules: [],
    evidence: {},
    artifacts: [primary],
    primary,
    transcript: null,
    dir: '/none',
  }
  // Jev answers each question every piece is asked, and none of those asked of some only.
  const SOME = ['ending_before', 'title', 'ai_did_work', 'ai_split']
  const asked: string[] = []
  const ask = vi.fn(async (_state: unknown, questions: Record<string, unknown>) => {
    asked.push(...Object.keys(questions))
    return Object.fromEntries(
      Object.keys(questions)
        .filter((id) => !SOME.includes(id))
        .map((id) => [id, { noul: 0.9, score: 2, choice: 'implication', probabilities: {} }]),
    )
  })
  const ctx: JudgeContext = {
    jev: {
      ask,
      pool: async (items: unknown[], work: (item: unknown, i: number) => unknown) =>
        Promise.all(items.map(work)),
    } as unknown as Jev,
    useJev: true,
    config,
    skillDir: '/none',
    log: () => {},
  }

  it('stores no answer to one Jev left out, and keeps what code measured', async () => {
    const raw = await writingPack.judge(input, ctx)
    expect(asked).toEqual(expect.arrayContaining(SOME))
    expect(raw?.jev).toMatchObject({ endingBefore: null, title: null })
    expect(raw?.jev?.perUnit[0]).toMatchObject({ aiDidWork: null, aiSplit: null })
    expect(raw?.lint).not.toBeNull()
    expect(raw?.shape).not.toBeNull()
  })

  it('still fails the reading when a question every piece is asked has no answer', async () => {
    ask.mockResolvedValueOnce({} as never)
    await expect(writingPack.judge(input, ctx)).rejects.toThrow(MissingAnswerError)
  })
})
