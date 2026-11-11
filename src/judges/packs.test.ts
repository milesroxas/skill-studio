/** What every pack must do alike: carry a version, and ask Jev only when the case allows it. */
import { mergeConfig } from '@domain/config.ts'
import type { Case, Grader } from '@domain/schemas.ts'
import { unitsOf } from '@domain/text.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { packById } from './index.ts'
import type { Jev } from './jev.ts'
import { scorers } from './scorers.ts'
import { MissingAnswerError } from './shared/questions.ts'
import type { JudgeContext, JudgeInput } from './types.ts'

const IDS = ['generic', 'writing', 'code', 'workflow', 'design']

// Jev is a network call: every yes/no is answered 0.9, every choice with its first label.
const ask = vi.fn(async (_state: unknown, questions: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.9, score: 1 }])),
)
beforeEach(() => {
  ask.mockClear()
})

const ctx: JudgeContext = {
  jev: {
    ask,
    pool: async (items: unknown[], work: (item: unknown, i: number) => unknown) =>
      Promise.all(items.map(work)),
  } as unknown as Jev,
  useJev: true,
  config: mergeConfig({ packs: IDS }, scorers),
  skillDir: '/none',
  log: () => {},
}

const grader: Grader = {
  id: 'g1',
  type: 'statement',
  focus: null,
  weight: 1,
  statement: 'The answer names Priya.',
  image: null,
}

const kase = (judge?: boolean): Case =>
  ({
    id: 'c',
    prompt: 'Thank Priya.',
    graders: [grader],
    files: [],
    settings: { maxTurns: null, timeoutSeconds: null, tags: [], allowedTools: null },
    bench: judge === undefined ? {} : { judge },
  }) as unknown as Case

const HTML =
  '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>A</h1></main></body></html>'

/** An output each pack has something to ask Jev about. */
const inputFor = (id: string, testCase: Case): JudgeInput => {
  const text = id === 'design' ? HTML : 'Priya, thank you for covering Saturday.'
  const kind = id === 'design' ? 'html' : id === 'code' ? 'code' : 'markdown'
  const primary = { file: 'outputs/out', kind } as JudgeInput['primary']
  return {
    text,
    units: kind === 'markdown' ? unitsOf(text) : [],
    title: null,
    case: testCase,
    images: [],
    rules: [{ id: 'r1', text: 'Open with the first name.', section: 'Rules' }],
    evidence: {},
    artifacts: primary ? [primary] : [],
    primary,
    transcript: [{ step: 1, at: 0, kind: 'tool', tool: 'Read', args: 'SKILL.md' }],
    dir: '/none',
    renders: [],
  }
}

describe('every pack', () => {
  it('carries a version, a whole number from 1, for the judge cache to key on', () => {
    for (const id of IDS) {
      const version = packById(id)?.version
      expect(Number.isInteger(version), id).toBe(true)
      expect(version, id).toBeGreaterThanOrEqual(1)
    }
  })

  it.each(IDS)('%s asks Jev about a case that allows it', async (id) => {
    // A reply with no label for a choice fails the writing pack's reading: that it asked is the point.
    await packById(id)
      ?.judge(inputFor(id, kase()), ctx)
      .catch((error) => expect(error).toBeInstanceOf(MissingAnswerError))
    expect(ask).toHaveBeenCalled()
  })

  it.each(IDS)('%s asks Jev nothing about a case that says `judge: false`', async (id) => {
    await packById(id)?.judge(inputFor(id, kase(false)), ctx)
    expect(ask).not.toHaveBeenCalled()
  })

  it.each(IDS)('%s asks Jev nothing when grading has no key', async (id) => {
    await packById(id)?.judge(inputFor(id, kase()), { ...ctx, useJev: false })
    expect(ask).not.toHaveBeenCalled()
  })
})
