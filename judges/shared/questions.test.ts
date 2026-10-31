import { DEFAULT_CONFIG } from '@core/config.ts'
import type { Grader } from '@core/schemas.ts'
import type { Jev } from '@server/jev.ts'
import { describe, expect, it, vi } from 'vitest'
import type { JudgeContext } from '../types.ts'
import { askStatements, round } from './questions.ts'

// Jev is a network call: answer every question with a fixed Noul.
const ask = vi.fn(async (_state: unknown, questions: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.12345 }])),
)
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
})

describe('round', () => {
  it('keeps three places', () => {
    expect(round(0.98765)).toBe(0.988)
  })
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
