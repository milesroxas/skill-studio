import { revisionOf, rewritesResult } from '@domain/improve.ts'
import type { RuleScene } from '@domain/lint.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the model answers, one reply per request, and what it was asked. */
const world = vi.hoisted(() => ({
  replies: [] as string[],
  asked: [] as Array<{ system: string; user: string }>,
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: async ({ system, messages }: { system: string; messages: Array<{ text: string }> }) => {
      world.asked.push({ system, user: messages[0]?.text ?? '' })
      const text = world.replies.shift()
      if (text === undefined) throw new Error('no reply left')
      return { text, model: 'sonnet', usage: {} }
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
// No key: code's checks alone read the rule and every rewrite of it.
vi.mock('@judges/jev.ts', () => ({
  Jev: class {
    static available = () => false
    model = 'jev'
  },
  isAuthError: () => false,
}))

const { findRun, startRefine, startRewrites } = await import('./ai.ts')

const scene = (selection: string, band: RuleScene['band'] = 'fine'): RuleScene => ({
  selection,
  before: '',
  after: '',
  description: 'Writes notes.',
  band,
})

const VAGUE = '- Try to keep the note reasonably short. Long notes are skimmed.'
const EXACT = '- Keep the note to two sentences, always. Long notes are skimmed.'
const SEVERAL =
  '- Set the status bar to 9:41, full signal and a full battery, with no notifications, cursor, scrollbars or debug overlays, so every shot matches.'

const revision = (text: string): string => JSON.stringify({ revision: text })

/** The run's text once it has ended. */
async function ended(id: string): Promise<string> {
  for (let i = 0; i < 100 && findRun(id).status === 'running'; i += 1)
    await new Promise((next) => setImmediate(next))
  const run = findRun(id)
  expect(run.status, run.error ?? '').toBe('done')
  return run.text
}

beforeEach(() => {
  world.replies = []
  world.asked = []
})

describe('startRefine', () => {
  it('asks nothing when the rule complies', async () => {
    const result = await startRefine(scene(EXACT))
    expect(result).toEqual({ findings: [], judged: false, run: null })
    expect(world.asked).toHaveLength(0)
  })

  it('asks for no rewrite of a rule whose only trouble is its file’s length', async () => {
    const result = await startRefine(scene(EXACT, 'over'))
    expect(result.findings.map((f) => f.dimension)).toEqual(['file'])
    expect(result.run).toBeNull()
    expect(world.asked).toHaveLength(0)
  })

  it('shows a revision that clears the checks after one request', async () => {
    world.replies = [revision(EXACT)]
    const { run } = await startRefine(scene(VAGUE))
    expect(revisionOf(await ended(run?.id ?? ''))).toEqual({ text: EXACT, open: [] })
    expect(world.asked).toHaveLength(1)
  })

  it('sends back a revision that left a check open, once, and takes the one that clears it', async () => {
    const half = '- Keep the note reasonably short. Long notes are skimmed.'
    world.replies = [revision(half), revision(EXACT)]
    const { run } = await startRefine(scene(VAGUE))
    expect(revisionOf(await ended(run?.id ?? ''))).toEqual({ text: EXACT, open: [] })
    expect(world.asked).toHaveLength(2)
    // The second request shows the model its own text and what is still open in it.
    expect(world.asked[1].user).toContain(half)
    expect(world.asked[1].user).toContain('was meant to fix these and did not')
  })

  it('keeps the first revision, and says what it leaves open, when the second is no better', async () => {
    const half = '- Keep the note reasonably short. Long notes are skimmed.'
    world.replies = [revision(half), revision(half.replace('short', 'brief'))]
    const { run } = await startRefine(scene(VAGUE))
    const result = revisionOf(await ended(run?.id ?? ''))
    expect(result.text).toBe(half)
    expect(result.open.map((f) => f.principle)).toEqual(['strict'])
    // Never a third request.
    expect(world.asked).toHaveLength(2)
  })

  it('keeps the first revision when the second request fails', async () => {
    const half = '- Keep the note reasonably short. Long notes are skimmed.'
    world.replies = [revision(half)]
    const { run } = await startRefine(scene(VAGUE))
    expect(revisionOf(await ended(run?.id ?? '')).text).toBe(half)
  })
})

describe('startRewrites', () => {
  it('asks for Shorter, and holds Best practice to the checks it was asked to fix', async () => {
    const half = '- Keep the note reasonably short. Long notes are skimmed.'
    world.replies = [
      JSON.stringify({ practice: half, direct: EXACT, shorter: VAGUE }),
      revision(EXACT),
    ]
    const run = await startRewrites(scene(VAGUE))
    const result = rewritesResult(await ended(run.id))
    expect(Object.keys(result.rewrites)).toEqual(['practice', 'direct', 'shorter'])
    expect(result.rewrites.practice).toBe(EXACT)
    expect(result.verdicts.practice?.open).toEqual([])
    expect(result.judged).toBe(false)
    expect(world.asked).toHaveLength(2)
  })

  it('asks for Split up when the rule asks for several things, and puts back a list mark', async () => {
    const split =
      '- Set the status bar to 9:41, so every shot matches.\n- Never show the cursor in a shot. It dates the shot.'
    world.replies = [
      JSON.stringify({ practice: split, direct: SEVERAL.slice(2), split: split.slice(2) }),
    ]
    const run = await startRewrites(scene(SEVERAL))
    expect(world.asked[0].system).toContain('split:')
    const result = rewritesResult(await ended(run.id))
    expect(Object.keys(result.rewrites)).toEqual(['practice', 'direct', 'split'])
    expect(result.rewrites.split).toBe(split)
    expect(result.verdicts.practice?.open).toEqual([])
    expect(world.asked).toHaveLength(1)
  })
})
