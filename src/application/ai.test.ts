import type { RuleScene } from '@domain/lint.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the model and Jev are doing: each call waits until the test answers it. */
const world = vi.hoisted(() => ({
  replies: 0,
  readings: [] as Array<{ selection: string; answer: (ok: boolean) => void }>,
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: ({ signal }: { signal: AbortSignal }) => {
      world.replies += 1
      // A reply that never comes on its own: only a stop ends it.
      return new Promise((_, fail) =>
        signal.addEventListener('abort', () => fail(new Error('stopped'))),
      )
    },
  }),
  aiProviderInfo: async () => [
    {
      id: 'claude-code',
      connected: true,
      problem: null,
      models: [{ id: 'sonnet', label: 'Sonnet', efforts: [] }],
      account: null,
      installable: false,
    },
  ],
  isProviderError: () => false,
}))
vi.mock('@infrastructure/ai/store.ts', () => ({
  readChat: () => [],
  readUsage: () => [],
  recordUsage: () => {},
  writeChat: () => {},
}))
vi.mock('@infrastructure/preferences.ts', () => ({
  readPreferences: () => ({ aiProvider: 'claude-code', aiModel: 'sonnet', aiEffort: '' }),
}))
vi.mock('@judges/jev.ts', () => ({
  Jev: class {
    static available = () => true
    model = 'jev'
  },
  isAuthError: () => false,
}))
vi.mock('@judges/rule/index.ts', () => ({
  // Jev's reading of a rule: it comes when the test says, and a failed one leaves code's findings.
  judgeRule: (_jev: unknown, scene: RuleScene) =>
    new Promise((done, fail) => {
      world.readings.push({
        selection: scene.selection,
        answer: (ok) => (ok ? done(null) : fail(new Error('no network'))),
      })
    }),
  judgeAnswer: async () => ({ answered: 1, cut: null }),
  judgeDraft: async () => null,
  verifyRewrites: async () => null,
}))

const { clearImprove, improveThread, startImprove } = await import('./ai.ts')

const scene = (selection: string): RuleScene => ({
  selection,
  before: '',
  after: '',
  description: 'Writes notes.',
  band: 'fine',
})

/** Wait until Jev has been asked `count` readings in all. */
async function asked(count: number): Promise<void> {
  for (let i = 0; i < 100 && world.readings.length < count; i += 1)
    await new Promise((next) => setImmediate(next))
  expect(world.readings).toHaveLength(count)
}

beforeEach(() => {
  clearImprove()
  world.replies = 0
  world.readings = []
})

describe('startImprove', () => {
  it('takes a new rule while the last one is still being read, and pays for one reply only', async () => {
    const first = startImprove(scene('- Keep every note short.'))
    await asked(1)
    // Picked before Jev has read the first rule: not refused.
    const second = startImprove(scene('- Sign every note with a name.'))
    await asked(2)
    world.readings[1].answer(false)
    const now = await second
    expect(now.scene.selection).toBe('- Sign every note with a name.')

    // The first reading comes back late: it starts nothing, and answers with the newer conversation.
    world.readings[0].answer(false)
    expect((await first).scene.selection).toBe('- Sign every note with a name.')
    expect(world.replies).toBe(1)
    expect(improveThread()?.scene.selection).toBe('- Sign every note with a name.')
  })

  it('answers each of several quick picks with the last, and has Jev read that one only', async () => {
    const picks = ['- One rule here.', '- Two rules here.', '- Three rules here.'].map((rule) =>
      startImprove(scene(rule)),
    )
    await asked(1)
    expect(world.readings[0].selection).toBe('- Three rules here.')
    world.readings[0].answer(false)
    const threads = await Promise.all(picks)
    expect(threads.map((t) => t.scene.selection)).toEqual(Array(3).fill('- Three rules here.'))
    expect(world.replies).toBe(1)
  })
})
