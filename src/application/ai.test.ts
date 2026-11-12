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

const { clearImprove, improveThread, sendImprove, startImprove } = await import('./ai.ts')

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
  it('opens on a rule without asking the model anything, while Jev reads the rule', async () => {
    const thread = await startImprove(scene('- Keep every note short.'))
    expect(thread.messages).toEqual([])
    expect(thread.run).toBeNull()
    expect(thread.walked).toBeNull()
    await asked(1)
    expect(world.replies).toBe(0)
  })

  it('answers each of several quick picks with the last, and pays for no reply', async () => {
    const picks = ['- One rule here.', '- Two rules here.', '- Three rules here.'].map((rule) =>
      startImprove(scene(rule)),
    )
    const threads = await Promise.all(picks)
    expect(threads.map((t) => t.scene.selection)).toEqual(Array(3).fill('- Three rules here.'))
    expect(improveThread()?.scene.selection).toBe('- Three rules here.')
    expect(world.replies).toBe(0)
  })
})

describe('sendImprove', () => {
  it('waits on Jev for the first message, then asks for a draft of what the writer asked', async () => {
    await startImprove(scene('- Keep every note short.'))
    await asked(1)
    const sent = sendImprove('Say how short.')
    // Jev has not answered: nothing is paid for yet.
    await new Promise((next) => setImmediate(next))
    expect(world.replies).toBe(0)
    world.readings[0].answer(false)
    const thread = await sent
    expect(thread.walked).toBe(false)
    expect(thread.at).toBe(thread.steps.length)
    expect(thread.messages.map((m) => m.text)).toEqual(['Say how short.'])
    expect(world.replies).toBe(1)
  })

  it('walks the questions when the first message asks for them, on the rule as it reads now', async () => {
    await startImprove(scene('- Keep every note short.'))
    await asked(1)
    world.readings[0].answer(false)
    const thread = await sendImprove('Ask me a few questions', {
      walk: true,
      current: '- Keep every note under 50 words.',
    })
    expect(thread.walked).toBe(true)
    expect(thread.at).toBe(0)
    expect(thread.steps.length).toBeGreaterThan(0)
    expect(thread.scene.selection).toBe('- Keep every note under 50 words.')
  })
})
