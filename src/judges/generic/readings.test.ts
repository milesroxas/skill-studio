/**
 * The generic pack with readings `st sort` kept: a rule or check read by code
 * is answered on the whole files and Jev is asked it too; one read as Jev's
 * has its long-output parts joined by its span; one nobody can mark is asked
 * of no one and counts in no layer. Scoring reads all of it back from the
 * raw answers alone.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { changeReading } from '@domain/change.ts'
import { mergeConfig } from '@domain/config.ts'
import { type Corrections, NO_CORRECTIONS } from '@domain/pack.ts'
import { ruleRates } from '@domain/rule-rate.ts'
import type { ExactTest, RuleReading } from '@domain/rule-reading.ts'
import type { Artifact, Case, Grader, Report } from '@domain/schemas.ts'
import { scoreResult } from '@domain/scoring.ts'
import type { SortedReading } from '@domain/sorting.ts'
import { countOf } from '@domain/verdict.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Jev } from '../jev.ts'
import { scorers } from '../scorers.ts'
import type { JudgeContext, JudgeInput, Readings } from '../types.ts'
import { genericPack } from './index.ts'
import { type GenericRaw, genericScoring } from './score.ts'

/** Jev answers every question as `answers` says by its name, else 0.9: sure it is met. */
let answers: Record<string, number> = {}
const ask = vi.fn(async (_state: Record<string, unknown>, questions: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: answers[id] ?? 0.9 }])),
)
beforeEach(() => {
  ask.mockClear()
  answers = {}
})
const config = mergeConfig(null, [genericScoring])
const ctx = {
  jev: { ask } as unknown as Jev,
  useJev: true,
  config,
  skillDir: '/s',
  log: () => {},
} satisfies JudgeContext

const grader = (id: string, statement: string): Grader => ({
  id,
  type: 'statement',
  focus: null,
  weight: 1,
  statement,
  image: null,
})
const rule = (id: string, text: string) => ({ id, text, section: 'Rules' })
const testCase = (graders: Grader[] = []): Case =>
  ({ id: 'c1', prompt: 'Write the note.', graders, bench: {} }) as unknown as Case
const md: Artifact = { file: 'outputs/note.md', kind: 'markdown' }

/** At most `n` words in the text a reader sees. */
const words = (n: number): ExactTest => ({
  test: 'count',
  read: { part: 'text', skip: null },
  what: 'words',
  compare: 'at most',
  n,
})
/** The text holds `value`. */
const holds = (value: string): ExactTest => ({
  test: 'has',
  read: { part: 'text', skip: null },
  values: { from: 'listed', items: [value] },
  need: 'all',
  at: 'anywhere',
  match: 'words',
  case: 'any',
})
const exact = (tests: ExactTest[], outputs: Array<'text' | 'page' | 'code'> = ['text']) =>
  ({ reading: 'exact', outputs, join: 'all', tests }) satisfies RuleReading

const VAGUE: SortedReading = {
  reading: 'unmarkable',
  why: 'vague',
  with: null,
  fix: 'Use the reader’s first name in the first line.',
}

/** One output with its whole files, as grading gives it when a rule is read by code. */
function output(text: string, readings: Readings, over: Partial<JudgeInput> = {}): JudgeInput {
  return {
    text,
    units: [],
    case: testCase([grader('g1', 'The note names Priya.')]),
    images: [],
    rules: [rule('r1', 'Keep it under 5 words.'), rule('r2', 'Keep the tone friendly.')],
    artifacts: [md],
    primary: md,
    others: [],
    skill: null,
    notes: null,
    transcript: null,
    dir: '/sample',
    renders: [],
    readings,
    whole: { output: text, others: {}, request: 'Write the note.', files: {} },
    ...over,
  }
}

const score = (raw: GenericRaw | null, corrections = {}) =>
  genericScoring.score(
    raw,
    { case: 'c1', primary: md, artifacts: [md], words: 0, range: null },
    config,
    corrections,
  )

const asked = (): string[] => ask.mock.calls.flatMap(([, questions]) => Object.keys(questions))

describe('the generic pack with readings', () => {
  it('answers a rule by code on the whole output, keeps Jev’s answer beside it, and scores from that alone', async () => {
    // Jev is sure the six words are under five: code counts them.
    const raw = await genericPack.judge(
      output('Thanks so much for coming, Priya.', {
        rules: { r1: exact([words(5)]) },
        checks: { g1: exact([holds('Priya')]) },
      }),
      ctx,
    )
    const [r1] = raw?.adherence?.rules ?? []
    // Jev is still asked every rule and check: its answer is kept unrounded beside code's.
    expect(asked()).toEqual(expect.arrayContaining(['rule:r1', 'rule:r2', 'check:g1']))
    expect(r1).toMatchObject({ noul: 0.9, code: { answer: 'missed' } })
    const { verdicts, layers } = score(raw)
    const [followed, , named] = verdicts
    expect(followed).toMatchObject({ met: false, by: 'code', jev: true, open: true })
    // The app's count first, then the other ways two people count words.
    expect(followed.code?.saw[0]).toMatchObject({ test: 'count', counts: [6, 6, 6, 6] })
    expect(named).toMatchObject({ met: true, by: 'code', kind: 'check' })
    // One rule met (r2, by Jev) of two.
    expect(layers.adherence).toBe(0.5)
    // Scoring is a pure function of the raw answers: the same from a copy that went through JSON.
    expect(score(JSON.parse(JSON.stringify(raw)))).toEqual(score(raw))
  })

  it('lets the reader’s mark stand over code’s answer', () => {
    const raw: GenericRaw = {
      adherence: {
        rules: [
          {
            id: 'r1',
            text: 'Keep it under 5 words.',
            section: 'Rules',
            noul: 0.9,
            code: { answer: 'missed', saw: [], tests: [words(5)] },
          },
        ],
      },
      rubric: null,
    }
    expect(score(raw).verdicts[0]).toMatchObject({ met: false, by: 'code', corrected: false })
    const marked = score(raw, { 'rule:Keep it under 5 words.': true }).verdicts[0]
    expect(marked).toMatchObject({ met: true, by: 'reader', corrected: true, open: true })
    expect(score(raw, { 'rule:Keep it under 5 words.': true }).layers.adherence).toBe(1)
  })

  it('falls back to Jev where code does not read the output, and sets the fact aside where it would not call it', async () => {
    const page: Artifact = { file: 'outputs/index.html', kind: 'html' }
    // Three words as the app counts them, four split at the spaces.
    const text = 'A — B c'
    answers = { 'rule:r1': 0.1, 'rule:r2': 0.95, 'check:g1': 0.95 }
    const raw = await genericPack.judge(
      output(
        text,
        {
          rules: {
            // `kind`: a reading of text, on a page. Jev's sure no stands.
            r1: exact([words(5)], ['text']),
            // `convention`: three words one way and four another, against at most three.
            r2: exact([words(3)], ['page']),
          },
          // `not measured`: no page was drawn here, so Jev's answer stands.
          checks: {
            g1: exact(
              [
                {
                  test: 'measure',
                  tag: 'p',
                  property: 'font size',
                  each: 'every',
                  compare: 'at least',
                  px: 18,
                },
              ],
              ['page'],
            ),
          },
        },
        { primary: page, artifacts: [page] },
      ),
      ctx,
    )
    const [kind, counted, measured] = score(raw).verdicts
    expect(kind).toMatchObject({ by: 'jev', met: false, code: { why: 'kind', stands: false } })
    expect(counted).toMatchObject({ by: 'code', aside: 'unsure', jev: true })
    expect(counted.code?.why).toBe('convention')
    expect(measured).toMatchObject({ by: 'jev', met: true, code: { why: 'not measured' } })
    expect(score(raw).flags).toContain(
      'rule not counted, code could not settle it (convention) (Rules): Keep the tone friendly.',
    )
  })

  it('maps every reason code gives no answer to Jev or to not sure, on purpose', async () => {
    const { SETS_ASIDE } = await import('@domain/verdict.ts')
    expect([...SETS_ASIDE].sort()).toEqual(['convention', 'differ', 'not listed', 'other notation'])
  })

  it('joins a long output’s parts by the span a judged reading gives', async () => {
    // A footer only the last part shows: the first part says no, the second yes.
    ask.mockImplementation(async (state, questions) =>
      Object.fromEntries(
        Object.keys(questions).map((id) => [
          id,
          { noul: String(state.output ?? '').includes('<footer>') ? 0.95 : 0.05 },
        ]),
      ),
    )
    try {
      const text = `${'a'.repeat(49_000)}<footer>`
      const readings: Readings = { rules: {}, checks: { g1: { reading: 'judged', span: 'end' } } }
      const raw = await genericPack.judge(output(text, readings, { rules: [] }), ctx)
      const [statement] = raw?.rubric?.statements ?? []
      expect(statement).toMatchObject({ parts: [0.05, 0.95], span: 'end' })
      expect(score(raw).verdicts.find((v) => v.kind === 'check')).toMatchObject({ met: true })
      // Without the span, the parts disagree and the fact is not read.
      const unsorted = await genericPack.judge(
        output(text, { rules: {}, checks: {} }, { rules: [] }),
        ctx,
      )
      expect(score(unsorted).verdicts.find((v) => v.kind === 'check')).toMatchObject({
        aside: 'unread',
      })
    } finally {
      ask.mockImplementation(async (_state, questions) =>
        Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: answers[id] ?? 0.9 }])),
      )
    }
  })

  it('asks no one a rule or check nobody can mark, keeps why and its fix, and counts it in no layer until the reader marks it', async () => {
    const raw = await genericPack.judge(
      output('Thanks, Priya.', { rules: { r2: VAGUE }, checks: { g1: VAGUE } }),
      ctx,
    )
    expect(asked()).not.toContain('rule:r2')
    expect(asked()).not.toContain('up:r2')
    expect(asked()).not.toContain('check:g1')
    expect(raw?.adherence?.rules[1]).toEqual({
      id: 'r2',
      text: 'Keep the tone friendly.',
      section: 'Rules',
      unmarkable: {
        why: 'vague',
        with: null,
        fix: VAGUE.reading === 'unmarkable' ? VAGUE.fix : null,
      },
    })
    expect(raw?.rubric?.statements[0]).toMatchObject({ unmarkable: { why: 'vague' } })
    const scored = score(raw)
    const vague = scored.verdicts.find((v) => v.text === 'Keep the tone friendly.')
    expect(vague).toMatchObject({ aside: 'unmarkable', open: true, by: null, corrected: false })
    // Only r1 counts: the vague rule is in neither number until the reader answers it.
    expect(scored.layers.adherence).toBe(1)
    expect(countOf(scored.verdicts, 'rule')).toMatchObject({ met: 1, total: 1, unsure: 0 })
    expect(scored.layers.rubric).toBeNull()
    expect(scored.flags).toContain(
      'rule not counted, it cannot be marked as written (two careful readers would mark it differently) (Rules): Keep the tone friendly.',
    )
    // The reader's own answer is the last word: marked, it counts, and says it is theirs.
    const marked = score(raw, {
      'rule:Keep the tone friendly.': false,
      'check:The note names Priya.': true,
    })
    expect(marked.verdicts.find((v) => v.text === 'Keep the tone friendly.')).toMatchObject({
      met: false,
      by: 'reader',
      corrected: true,
      unmarkable: { why: 'vague' },
    })
    expect(marked.verdicts.find((v) => v.text === 'Keep the tone friendly.')?.aside).toBeUndefined()
    expect(marked.layers.adherence).toBe(0.5)
    expect(marked.layers.rubric).toBe(1)
    expect(marked.flags).toContain('rule not followed (Rules): Keep the tone friendly.')
    expect(marked.flags.some((f) => f.includes('cannot be marked'))).toBe(false)
  })

  it('sets a rule aside beside a check it cannot hold with, naming the check by its words', async () => {
    const raw = await genericPack.judge(
      output('Thanks, Priya.', {
        rules: {
          r1: { reading: 'unmarkable', why: 'conflict', with: 'c1', fix: 'Allow a longer list.' },
        },
        checks: { g1: exact([holds('Priya')]) },
      }),
      ctx,
    )
    expect(asked()).not.toContain('rule:r1')
    expect(asked()).toContain('check:g1')
    expect(raw?.adherence?.rules[0]).toMatchObject({
      unmarkable: { why: 'conflict', with: 'The note names Priya.', fix: 'Allow a longer list.' },
    })
    const scored = score(raw)
    expect(scored.verdicts.find((v) => v.kind === 'check')).toMatchObject({ met: true, by: 'code' })
    expect(scored.layers.rubric).toBe(1)
    expect(scored.flags).toContain(
      'rule not counted, it cannot be marked as written (it cannot hold beside "The note names Priya.") (Rules): Keep it under 5 words.',
    )
  })

  it('names the other rule of a conflict by its words', async () => {
    const raw = await genericPack.judge(
      output('Thanks, Priya.', {
        rules: { r2: { reading: 'unmarkable', why: 'conflict', with: 'r1', fix: null } },
        checks: {},
      }),
      ctx,
    )
    expect(raw?.adherence?.rules[1]).toMatchObject({
      unmarkable: { why: 'conflict', with: 'Keep it under 5 words.', fix: null },
    })
  })

  it('asks as before a rule whose reading fell back, and one with none', async () => {
    const fallback: SortedReading = { reading: 'judged', span: null }
    const sorted = await genericPack.judge(
      output('Thanks, Priya.', { rules: { r1: fallback }, checks: {} }),
      ctx,
    )
    const calls = ask.mock.calls.length
    const before = await genericPack.judge(
      {
        ...output('Thanks, Priya.', { rules: {}, checks: {} }),
        readings: undefined,
        whole: undefined,
      },
      ctx,
    )
    expect(sorted).toEqual(before)
    // The same questions over the same state.
    expect(ask.mock.calls.slice(calls)).toEqual(ask.mock.calls.slice(0, calls))
  })
})

describe('reading two runs where one was graded with readings', () => {
  const plainRule = (id: string, text: string, noul: number) => ({
    id,
    text,
    section: 'Rules',
    noul,
  })
  const missedByCode = { answer: 'missed' as const, saw: [], tests: [words(5)] }
  const metByCode = { answer: 'met' as const, saw: [], tests: [words(5)] }
  // Before any reading: Jev was sure of the first two, and not of the third.
  const before: GenericRaw = {
    adherence: {
      rules: [
        plainRule('r1', 'Keep it short.', 0.9),
        plainRule('r2', 'Keep the tone friendly.', 0.95),
        plainRule('r3', 'Name the reader.', 0.5),
      ],
    },
    rubric: null,
  }
  // With readings: code counts the first, the second cannot be marked, code finds the third.
  const after: GenericRaw = {
    adherence: {
      rules: [
        { ...plainRule('r1', 'Keep it short.', 0.9), code: missedByCode },
        {
          id: 'r2',
          text: 'Keep the tone friendly.',
          section: 'Rules',
          unmarkable: { why: 'vague', with: null, fix: null },
        },
        { ...plainRule('r3', 'Name the reader.', 0.5), code: metByCode },
      ],
    },
    rubric: null,
  }

  it('reads the change over the rules both counted: one that cannot be marked, and one Jev was not sure of, are left out at both', () => {
    const verdictsOf = (end: 'a' | 'b', answers: Corrections[]) => [
      score(end === 'a' ? before : after, answers[0]).verdicts,
    ]
    const reading = changeReading([NO_CORRECTIONS], [NO_CORRECTIONS], verdictsOf)
    expect(reading.left).toEqual(['rule', 'rule'])
    // Counted over the first rule alone: met before, missed by code since.
    expect(score(before, reading.a[0]).layers.adherence).toBe(1)
    expect(score(after, reading.b[0]).layers.adherence).toBe(0)
    // Each shown on its own still counts everything it counted.
    expect(score(before).layers.adherence).toBe(1)
    expect(score(after).layers.adherence).toBe(0.5)
  })

  it('counts the reader’s mark on a rule that cannot be marked only where both ends hold one', () => {
    const friendly = { 'rule:Keep the tone friendly.': true }
    // Before, Jev met it; after, it cannot be marked. The mark at one end alone is read as unanswered there.
    const verdictsOf = (end: 'a' | 'b', answers: Corrections[]) => [
      score(end === 'a' ? before : after, answers[0]).verdicts,
    ]
    const one = changeReading([NO_CORRECTIONS], [friendly], verdictsOf)
    expect(one.oneSided).toBe(true)
    expect(one.left).toEqual(['rule', 'rule'])
    expect(
      score(after, one.b[0]).verdicts.find((v) => v.text === 'Keep the tone friendly.'),
    ).toMatchObject({ aside: 'unmarkable', corrected: false })
    // Marked at both ends, it counts at both, and only Jev's unsure rule is left out.
    const both = changeReading([friendly], [friendly], verdictsOf)
    expect(both.oneSided).toBe(false)
    expect(both.left).toEqual(['rule'])
    expect(score(after, both.b[0]).layers.adherence).toBe(0.5)
    expect(
      score(after, both.b[0]).verdicts.find((v) => v.text === 'Keep the tone friendly.'),
    ).toMatchObject({ met: true, by: 'reader' })
  })

  it('counts a rule that cannot be marked as neither followed nor broken beside each rule', () => {
    const rates = ruleRates([
      { total: 50, verdicts: score(after).verdicts },
      { total: 100, verdicts: score(before).verdicts },
    ])
    expect(rates.get('Keep the tone friendly.')).toEqual({ followed: 1, broken: 0 })
    expect(rates.get('Keep it short.')).toEqual({ followed: 1, broken: 1 })
    expect(rates.get('Name the reader.')).toEqual({ followed: 1, broken: 0 })
  })
})

describe('a stored grading made on readings', () => {
  it('scores to the numbers and flags it was written with, from its raw answers alone', () => {
    const runs = resolve(import.meta.dirname, '../../../fixtures/launch-note/evals/runs')
    let rescored = 0
    for (const run of readdirSync(runs)) {
      const report = JSON.parse(readFileSync(join(runs, run, 'report.json'), 'utf8')) as Report
      for (const result of report.results) {
        // A long output read only at its start is behind already: it waits on a grading, whatever readings do.
        if ((result.packs.generic as GenericRaw | null)?.cut?.length) continue
        const scored = scoreResult(result, report.config, scorers)
        expect(scored.scores, `${run} ${result.sample}`).toEqual(result.scores)
        expect(scored.flags, `${run} ${result.sample}`).toEqual(result.flags)
        rescored += 1
      }
    }
    expect(rescored).toBe(25)
  })
})
