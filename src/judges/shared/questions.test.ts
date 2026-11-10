import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pngHeader } from '@domain/__fixtures__/image.ts'
import { DEFAULT_CONFIG } from '@domain/config.ts'
import type { Case, Grader } from '@domain/schemas.ts'
import { Image, image } from '@typesafe-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { holdsImage } from '../images.ts'
import type { Jev } from '../jev.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import {
  askStatements,
  asksJev,
  choiceOf,
  confidenceOf,
  MissingAnswerError,
  noulOf,
  scoreOf,
  withRequest,
} from './questions.ts'

// Jev is a network call: answer every question with a fixed Noul.
const ask = vi.fn(async (_state: unknown, questions: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.12345 }])),
)
// A braced body: a hook that returns the mock would have it called again as a teardown.
beforeEach(() => {
  ask.mockClear()
})
const ctx = {
  jev: { ask } as unknown as Jev,
  useJev: true,
  config: DEFAULT_CONFIG,
  skillDir: '/s',
  log: () => {},
} satisfies JudgeContext

const grader = (id: string, weight = 1): Grader => ({
  id,
  type: 'statement',
  focus: null,
  weight,
  statement: `statement ${id}`,
  image: null,
})

describe('askStatements', () => {
  it('asks nothing without graders', async () => {
    expect(await askStatements([], {}, 'output', ctx)).toEqual([])
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks every grader once over the state and keeps grader order and weight', async () => {
    const answers = await askStatements(
      [grader('g1'), grader('g2', 3)],
      { output: 'x' },
      'output',
      ctx,
    )
    expect(ask).toHaveBeenCalledTimes(1)
    expect(Object.keys(ask.mock.calls[0][1])).toEqual(['g1', 'g2'])
    expect(answers).toEqual([
      // As Jev said it: rounded to 0.123 here, an answer of 0.4996 would be kept as 0.5 and pass a threshold it missed.
      { id: 'g1', text: 'statement g1', weight: 1, noul: 0.12345, units: null, best: null },
      { id: 'g2', text: 'statement g2', weight: 3, noul: 0.12345, units: null, best: null },
    ])
  })

  it('fails the reading when Jev leaves a grader unanswered, and names which', async () => {
    ask.mockResolvedValueOnce({ g1: { noul: 0.9 } })
    await expect(
      askStatements([grader('g1'), grader('g2')], { output: 'x' }, 'output', ctx),
    ).rejects.toThrow(new MissingAnswerError('g2', 'noul'))
  })
})

const testCase = (id: string, prompt: string, statements: string[] = []): Case =>
  ({
    id,
    prompt,
    graders: statements.map((text, i) => ({ ...grader(`g${i}`), statement: text })),
  }) as Case

const output = (text: string, over: Partial<JudgeInput> = {}): JudgeInput => ({
  text,
  units: [],
  title: null,
  case: null,
  images: [],
  rules: [],
  evidence: {},
  artifacts: [],
  primary: null,
  transcript: null,
  dir: '/sample',
  ...over,
})

/** The state and the question texts of the one request made. */
const asked = () => {
  const [state, questions] = ask.mock.calls[0] as [
    Record<string, unknown>,
    Record<string, { instructions: string; criteria: Record<string, string> }>,
  ]
  return { state, questions }
}

describe('withRequest', () => {
  it("puts the case's prompt in the state, and adds nothing without a case", () => {
    const withCase = output('note', { case: testCase('intro', '  Thank Elena.  ') })
    expect(withRequest(withCase, { output: 'note' })).toEqual({
      request: 'Thank Elena.',
      output: 'note',
    })
    expect(withRequest(output('note'), { output: 'note' })).toEqual({ output: 'note' })
  })

  it('makes a statement question say what the output answers', async () => {
    const withCase = output('note', { case: testCase('intro', 'Thank Elena.') })
    await askStatements([grader('g1')], withRequest(withCase, { output: 'note' }), 'output', ctx)
    expect(asked().questions.g1.instructions).toBe(
      '`output` was produced to answer `request`. Is this statement true of `output`: "statement g1"',
    )
  })
})

describe('pictures', () => {
  const picture = image(pngHeader(800, 600))

  it('puts the pictures a request came with in state once, and says so in the question', async () => {
    const withCase = output('note', {
      case: testCase('c1', 'Describe the chart.'),
      images: [{ name: 'chart.png', image: picture }],
    })
    const state = withRequest(withCase, { output: 'note' })
    expect(state).toEqual({
      request: 'Describe the chart.',
      request_images: [picture],
      output: 'note',
    })
    await askStatements([grader('g1')], state, 'output', ctx)
    expect(ask.mock.calls[0][1].g1).toMatchObject({
      instructions: expect.stringContaining('which came with the pictures in `request_images`'),
    })
  })

  it('asks a check about a picture with that picture in its own question', async () => {
    const skillDir = mkdtempSync(join(tmpdir(), 'st-questions-'))
    writeFileSync(join(skillDir, 'mock.png'), pngHeader(800, 600))
    writeFileSync(join(skillDir, 'huge.png'), pngHeader(4000, 3000))
    const log = vi.fn()
    await askStatements(
      [
        { ...grader('g1'), image: 'mock.png' },
        { ...grader('g2'), image: 'huge.png' },
        grader('g3'),
      ],
      { output: 'x' },
      'output',
      { ...ctx, skillDir, log },
    )
    rmSync(skillDir, { recursive: true, force: true })
    const questions = ask.mock.calls[0][1]
    expect(holdsImage(questions.g1)).toBe(true)
    // A picture Jev would refuse is left out and reported: it would fail every question with it.
    expect(holdsImage(questions.g2)).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('4000 × 3000 px'))
    expect(holdsImage(questions.g3)).toBe(false)
  })

  it('finds a picture however deep it sits in a request', () => {
    expect(picture).toBeInstanceOf(Image)
    expect(holdsImage({ frames: [{ at: 1, frame: picture }] })).toBe(true)
    expect(holdsImage({ output: 'text', rules: ['a', 'b'] })).toBe(false)
  })
})

describe('whether Jev is asked', () => {
  const of = (judge: unknown) => ({ case: { bench: { judge } } as unknown as Case })

  it('asks when grading has a key and the case does not say otherwise', () => {
    expect(asksJev({ case: null }, { useJev: true })).toBe(true)
    expect(asksJev(of(undefined), { useJev: true })).toBe(true)
    expect(asksJev(of(true), { useJev: true })).toBe(true)
  })

  it('does not ask for a case with `judge: false`, nor without a key', () => {
    expect(asksJev(of(false), { useJev: true })).toBe(false)
    expect(asksJev(of(undefined), { useJev: false })).toBe(false)
  })
})

describe('reading an answer', () => {
  const answers = {
    yes: { noul: 0.4996 },
    level: { score: 1.5, confidence: 0.8 },
    kind: { choice: 'claim' },
    nan: { noul: Number.NaN },
    empty: {},
  }

  it('hands back what Jev said, unrounded', () => {
    expect(noulOf(answers, 'yes')).toBe(0.4996)
    expect(scoreOf(answers, 'level')).toBe(1.5)
    expect(confidenceOf(answers, 'level')).toBe(0.8)
    expect(choiceOf(answers, 'kind', ['claim', 'hype'])).toBe('claim')
  })

  it('throws a named error for an answer that is missing, not a number, or not a label asked for', () => {
    for (const read of [
      () => noulOf(answers, 'gone'),
      () => noulOf(answers, 'nan'),
      () => noulOf(answers, 'empty'),
      () => noulOf(answers, 'constructor'),
      () => scoreOf(answers, 'yes'),
      () => choiceOf(answers, 'kind', ['teaser', 'hype']),
    ])
      expect(read).toThrow(MissingAnswerError)
    expect(() => noulOf(answers, 'gone')).toThrow('Jev gave no noul for "gone".')
  })
})
