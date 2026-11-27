import { currentStep } from '@domain/improve.ts'
import type { RuleScene } from '@domain/lint.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the model and Jev are doing: each call waits until the test answers it. */
const world = vi.hoisted(() => ({
  replies: 0,
  readings: [] as Array<{ selection: string; answer: (ok: boolean) => void }>,
  /** How Jev's reading of the writer's answer to a question goes: `missed` reads it as no answer. */
  answerReading: 'read' as 'read' | 'missed' | 'fails' | 'refused',
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
  isAuthError: (error: unknown) => (error as Error | undefined)?.message === 'refused',
}))
vi.mock('@judges/rule/index.ts', () => ({
  // Jev's reading of a rule: it comes when the test says, and a failed one leaves code's findings.
  judgeRule: (_jev: unknown, scene: RuleScene) =>
    new Promise((done, fail) => {
      world.readings.push({
        selection: scene.selection,
        // A reading that holds nothing well: every principle drifts, so there is a walk to take.
        answer: (ok) =>
          ok ? done(new Proxy({}, { get: () => 0.1 })) : fail(new Error('no network')),
      })
    }),
  judgeAnswer: async () => {
    if (world.answerReading === 'read') return { answered: 1, cut: null }
    if (world.answerReading === 'missed') return { answered: 0, cut: 0 }
    throw new Error(world.answerReading === 'refused' ? 'refused' : 'no network')
  },
  judgeDraft: async () => null,
  verifyRewrites: async () => null,
}))

const { clearImprove, improveThread, sendImprove, startImprove, stopRun } = await import('./ai.ts')

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
  world.answerReading = 'read'
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

  /** Stop the reply on its way, which never ends on its own here, and wait for it to settle. */
  async function settle() {
    const run = improveThread()?.run
    if (run) stopRun(run.id)
    for (let i = 0; i < 100 && improveThread()?.run?.status === 'running'; i += 1)
      await new Promise((next) => setImmediate(next))
  }

  /** A walk Jev read the rule for, past its first message. */
  async function walking(rule: string) {
    // A rule of its own: Jev's reading of one rule is kept, and asked once.
    await startImprove(scene(rule))
    await asked(1)
    world.readings[0].answer(true)
    const thread = await sendImprove('Ask me a few questions', { walk: true })
    expect(thread.judged).toBe(true)
    expect(thread.steps.length).toBeGreaterThan(0)
    await settle()
  }

  it('puts a question as written the first time, and asks the model only to put it again', async () => {
    await walking('- Keep every note brief.')
    // The first question is the app's own: no reply is paid for.
    const first = improveThread()
    const earns = first && currentStep(first)
    expect(earns?.id).toBe('earns')
    expect(first?.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'Ask me a few questions'],
      ['assistant', earns?.ask],
    ])
    expect(first?.run).toBeNull()
    expect(world.replies).toBe(0)
    // Jev reads no answer in the reply: the question is put again, by the model, which says what was missing.
    world.answerReading = 'missed'
    const again = await sendImprove('Not sure yet.')
    expect(again.at).toBe(0)
    expect(again.asks).toBe(1)
    expect(again.run?.status).toBe('running')
    expect(world.replies).toBe(1)
    await settle()
    // Answered: the next step's question is the app's own again.
    world.answerReading = 'read'
    const next = await sendImprove('It keeps each note to two sentences.')
    expect(next.at).toBe(1)
    expect(next.messages.at(-1)).toMatchObject({ role: 'assistant', text: currentStep(next)?.ask })
    expect(next.run).toBeNull()
    expect(world.replies).toBe(1)
  })

  it('says on the thread when Jev could not read an answer, and moves on', async () => {
    await walking('- Keep every reply short.')
    world.answerReading = 'fails'
    const thread = await sendImprove('Under fifty words.')
    expect(thread.unread).toBe(true)
    expect(thread.at).toBe(1)
    await settle()
    world.answerReading = 'read'
    expect((await sendImprove('Because they skim.')).unread).toBe(false)
  })

  it('says a refused key, and keeps the answer out so it can be sent again', async () => {
    await walking('- Keep every summary short.')
    const before = improveThread()?.messages.length ?? 0
    world.answerReading = 'refused'
    await expect(sendImprove('Under fifty words.')).rejects.toThrow('TypeSafe refused the key')
    expect(improveThread()?.messages).toHaveLength(before)
    expect(improveThread()?.at).toBe(0)
  })
})
