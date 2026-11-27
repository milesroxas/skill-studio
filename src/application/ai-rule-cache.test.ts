/**
 * Auto refine, Suggest changes and a Help me improve step, each done twice on
 * one rule and once more after a restart: what Jev is asked each time, with
 * the TypeSafe client and the model stood in for.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuleScene } from '@domain/lint.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const world = vi.hoisted(() => ({
  /** The model's replies, one a request. */
  replies: [] as string[],
  /** The questions of each request Jev got. */
  requests: [] as string[][],
}))

/** The rule as first written: Jev reads it as holding nothing well, so there is a walk to take. */
const RULE = '- Try to keep the note reasonably short. Long notes are skimmed.'

vi.mock('@typesafe-ai/sdk', async (original) => ({
  ...(await original<typeof import('@typesafe-ai/sdk')>()),
  TypeSafeClient: class {
    async systemOne(request: { state: { rule?: unknown }; questions: Record<string, unknown> }) {
      const names = Object.keys(request.questions)
      world.requests.push(names)
      const drifts = request.state.rule === RULE
      const answers = Object.fromEntries(
        names.map((name) => [
          name,
          name.endsWith('_complexity')
            ? { type: 'score', score: 0 }
            : {
                type: 'noul',
                noul: name === 'cut' || (drifts && name.startsWith('rule_')) ? 0.1 : 0.9,
              },
        ]),
      )
      return { model: 'jev-1.14.0', answers, usage: { input_tokens: 40 * names.length } }
    }
  },
}))
vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: async () => {
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

// The library reads SKILL_STUDIO_HOME once, at import: Jev's answers are kept in this folder.
const home = mkdtempSync(join(tmpdir(), 'st-rule-home-'))
process.env.SKILL_STUDIO_HOME = home
afterAll(() => rmSync(home, { recursive: true, force: true }))

beforeEach(() => {
  vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
  vi.stubEnv('ST_AI_RECORD', '')
  vi.stubEnv('ST_AI_REPLAY', '')
  world.replies = []
  world.requests = []
})
afterEach(() => vi.unstubAllEnvs())

const EXACT = '- Keep the note to two sentences, always. Long notes are skimmed.'
const scene: RuleScene = {
  selection: RULE,
  before: '',
  after: '',
  description: 'Writes notes.',
  band: 'fine',
}

/** What reached Jev since the last look. */
function asked(): { requests: number; questions: number } {
  const seen = {
    requests: world.requests.length,
    questions: world.requests.reduce((n, names) => n + names.length, 0),
  }
  world.requests = []
  return seen
}

/** The app's backend, as it is when it starts. */
async function started() {
  vi.resetModules()
  const ai = await import('./ai.ts')
  const ended = async (id: string) => {
    for (let i = 0; i < 200 && ai.findRun(id).status === 'running'; i += 1)
      await new Promise((next) => setImmediate(next))
    const run = ai.findRun(id)
    expect(run.status, run.error ?? '').toBe('done')
  }
  return {
    async refine() {
      world.replies.push(JSON.stringify({ revision: EXACT }))
      const { run } = await ai.startRefine(scene)
      await ended(run?.id ?? '')
      return asked()
    },
    async rewrites() {
      world.replies.push(
        JSON.stringify({
          practice: EXACT,
          direct: '- Write two sentences at most. Long notes are skimmed.',
          shorter: '- Keep notes to two sentences.',
        }),
      )
      await ended((await ai.startRewrites(scene)).id)
      return asked()
    },
    /** Help me improve, walked, and the first question answered. */
    async improve() {
      await ai.startImprove(scene)
      await ai.sendImprove('Ask me a few questions', { walk: true })
      const thread = await ai.sendImprove('Without it the agent writes a page.')
      expect(thread.at).toBe(1)
      ai.clearImprove()
      return asked()
    },
  }
}

describe('the rule judge, on one rule again', () => {
  it('asks Jev nothing for Auto refine, Suggest changes or Help me improve done again, after a restart too', async () => {
    const app = await started()
    const once = {
      refine: [await app.refine(), await app.refine()],
      rewrites: [await app.rewrites(), await app.rewrites()],
      improve: [await app.improve(), await app.improve()],
    }
    const later = await started()
    const restarted = {
      refine: await later.refine(),
      rewrites: await later.rewrites(),
      improve: await later.improve(),
    }
    const none = { requests: 0, questions: 0 }
    expect({ once, restarted }).toEqual({
      once: {
        // The rule, then the revision, read as a rule.
        refine: [{ requests: 2, questions: 12 }, none],
        // The rule is read already: the three rewrites kept it, and Best practice read as a rule.
        rewrites: [{ requests: 1, questions: 9 }, none],
        // The rule is read already: whether the reply answered, and whether it says to cut the line.
        improve: [{ requests: 1, questions: 2 }, none],
      },
      restarted: { refine: none, rewrites: none, improve: none },
    })
  })
})
