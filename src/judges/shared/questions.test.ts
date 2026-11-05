import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '@domain/config.ts'
import { pngHeader } from '@domain/image-fixtures.ts'
import type { Case, Grader } from '@domain/schemas.ts'
import { Image, image } from '@typesafe-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { holdsImage } from '../images.ts'
import type { Jev } from '../jev.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import { askStatements, pairwiseText, withRequest } from './questions.ts'

// Jev is a network call: answer every question with a fixed Noul and a fixed Choice.
const ask = vi.fn(async (_state: unknown, questions: Record<string, unknown>) =>
  Object.fromEntries(
    Object.keys(questions).map((id) => [id, { noul: 0.12345, choice: 'b', confidence: 0.96049 }]),
  ),
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
      { id: 'g1', text: 'statement g1', weight: 1, noul: 0.123, units: null, best: null },
      { id: 'g2', text: 'statement g2', weight: 3, noul: 0.123, units: null, best: null },
    ])
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

/** The state and the question texts of the one request `pairwiseText` made. */
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

describe('pairwiseText', () => {
  const rules = [{ id: 'r1', text: 'Write exactly two sentences.', section: 'Rules' }]
  const intro = testCase('intro', 'Thank Elena.', ['The note has exactly two sentences.'])

  it('gives Jev the request, the rules and the graders, and asks overall against them', async () => {
    const votes = await pairwiseText(
      output('long note', { case: intro, rules }),
      output('short note', { case: intro, rules }),
      ['overall'],
      ctx,
    )
    const { state, questions } = asked()
    expect(state).toEqual({
      request: 'Thank Elena.',
      rules: ['Write exactly two sentences.'],
      checks: ['The note has exactly two sentences.'],
      a: 'long note',
      b: 'short note',
    })
    expect(questions.c0.instructions).toBe(
      'Which of `a` and `b` is the better answer to `request`, judged by `rules` and `checks`?',
    )
    expect(questions.c0.criteria).toEqual({
      a: '`a` breaks fewer of `rules` and fails fewer of `checks` than `b`. If they break and fail the same ones, `a` does what `request` asks more exactly.',
      b: '`b` breaks fewer of `rules` and fails fewer of `checks` than `a`. If they break and fail the same ones, `b` does what `request` asks more exactly.',
      tie: '`a` and `b` break the same `rules` and fail the same `checks`, and answer `request` equally well.',
    })
    expect(votes).toEqual({ overall: { vote: 'b', confidence: 0.96 } })
  })

  it('asks a named criterion with the request and the rules in view, and leaves the graders out', async () => {
    await pairwiseText(
      output('x', { case: intro, rules }),
      output('y', { case: intro, rules }),
      ['warmth'],
      ctx,
    )
    const { state, questions } = asked()
    expect(Object.keys(state)).toEqual(['request', 'rules', 'a', 'b'])
    expect(questions.c0.instructions).toBe(
      '`a` and `b` were each written to answer `request` while following `rules`. Which of `a` and `b` better satisfies this criterion: "warmth"',
    )
  })

  it('names each request when the outputs answer different cases', async () => {
    await pairwiseText(
      output('x', { case: intro, rules }),
      output('y', { case: testCase('shift', 'Thank Omar.', ['Names the shift.']), rules }),
      ['overall'],
      ctx,
    )
    const { state, questions } = asked()
    expect(state).toEqual({
      request_a: 'Thank Elena.',
      request_b: 'Thank Omar.',
      rules: ['Write exactly two sentences.'],
      a: 'x',
      b: 'y',
    })
    expect(questions.c0.instructions).toBe(
      '`a` was written to answer `request_a` and `b` to answer `request_b`. Which of `a` and `b` is the better answer to its own request, judged by `rules`?',
    )
    expect(questions.c0.criteria.tie).toBe(
      '`a` and `b` break the same `rules`, and answer their own requests equally well.',
    )
  })

  it('falls back to the bare criterion when there is no case and no rule', async () => {
    await pairwiseText(output('x'), output('y'), ['overall'], ctx)
    const { state, questions } = asked()
    expect(state).toEqual({ a: 'x', b: 'y' })
    expect(questions.c0.instructions).toBe(
      'Which of `a` and `b` better satisfies this criterion: "overall"',
    )
  })

  it('refuses to compare an output with no text', async () => {
    await expect(pairwiseText(output(' '), output('y'), ['overall'], ctx)).rejects.toThrow(
      'One of these outputs has nothing Jev can compare.',
    )
    expect(ask).not.toHaveBeenCalled()
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
