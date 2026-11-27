/**
 * Jev's answers about a rule, kept in `rule-judge-cache.json`: what the rule
 * judge asks again and what it keeps, with the TypeSafe client stood in for,
 * so `Jev` itself counts, saves and replays as it does in the app.
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ImproveStep } from '@domain/improve.ts'
import type { RuleScene } from '@domain/lint.ts'
import { Jev, type Usage } from '@judges/jev.ts'
import { withMeter } from '@judges/meter.ts'
import { judgeAnswer, judgeRule, verifyRewrites } from '@judges/rule/index.ts'
import { noul } from '@typesafe-ai/sdk'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANSWERS_MAX, keptRuleJev } from './rule-cache.ts'

/** The TypeSafe client: each test says how it answers, and every request it gets is counted. */
const world = vi.hoisted(() => ({
  requests: [] as Array<{ state: Record<string, unknown>; questions: string[] }>,
  /** The yes Jev gives each question, by its name. */
  noul: (_name: string): number => 0.9,
  /** Questions it leaves out of its reply. */
  leave: [] as string[],
  fail: false,
  /** The request waits, unanswered, until it is stopped. */
  hold: false,
  /** Called inside the request, after the cache was read and before the answers are kept. */
  during: null as null | (() => Promise<void>),
}))

vi.mock('@typesafe-ai/sdk', async (original) => ({
  ...(await original<typeof import('@typesafe-ai/sdk')>()),
  TypeSafeClient: class {
    async systemOne(
      request: { state: Record<string, unknown>; questions: Record<string, unknown> },
      options: { signal?: AbortSignal } = {},
    ) {
      const names = Object.keys(request.questions)
      world.requests.push({ state: request.state, questions: names })
      if (world.fail) throw new Error('Jev is down')
      if (world.hold)
        await new Promise((_, fail) =>
          options.signal?.addEventListener('abort', () => fail(new Error('stopped'))),
        )
      const during = world.during
      world.during = null
      await during?.()
      const answers = Object.fromEntries(
        names
          .filter((name) => !world.leave.includes(name))
          .map((name) => [
            name,
            name.endsWith('_complexity')
              ? { type: 'score', score: 1, confidence: 0.8 }
              : { type: 'noul', noul: world.noul(name) },
          ]),
      )
      return { model: 'jev-1.14.0', answers, usage: { input_tokens: 40 * names.length } }
    }
  },
}))

const made: string[] = []
const scratch = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  made.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.stubEnv('TYPESAFE_API_KEY', 'ts-test-key-not-to-be-kept')
  vi.stubEnv('TYPESAFE_BASE_URL', '')
  vi.stubEnv('ST_AI_RECORD', '')
  vi.stubEnv('ST_AI_REPLAY', '')
  vi.stubEnv('ST_AI_REPLAY_LOG', '')
  world.requests = []
  world.noul = () => 0.9
  world.leave = []
  world.fail = false
  world.hold = false
  world.during = null
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const RULE = '- Try to keep the note reasonably short. Long notes are skimmed.'
const OTHER = '- Open with the change, never the product name, because readers decide in a line.'

const scene = (selection = RULE, over: Partial<RuleScene> = {}): RuleScene => ({
  selection,
  before: '- Lead with what changed.',
  after: '- Name the version.',
  description: 'Writes release notes.',
  band: 'fine',
  ...over,
})

const EARNS: ImproveStep = {
  id: 'earns',
  ask: 'What would an agent get wrong without this line?',
  answered: 'Does `answer` say what an agent would do otherwise without `rule`?',
  when: 'unless-holds',
}

const REWRITES = {
  practice: '- Keep the note to two sentences, always. Long notes are skimmed.',
  direct: '- Write two sentences at most. Long notes are skimmed.',
  shorter: '- Keep notes to two sentences.',
}

/** A cache file of its own. */
const cacheIn = (): string => join(scratch('st-rule-cache-'), 'rule-judge-cache.json')

/** The judge, through the cache at `path`, on a Jev of `model`. */
const judge = (path: string, model?: string) => keptRuleJev(new Jev(model, 'refine'), path)

/** How many requests and questions reached Jev since the last look. */
function asked(): { requests: number; questions: number } {
  const seen = {
    requests: world.requests.length,
    questions: world.requests.reduce((n, r) => n + r.questions.length, 0),
  }
  world.requests = []
  return seen
}

// biome-ignore lint/suspicious/noExplicitAny: the file read raw, held to its shape by each test.
const fileAt = (path: string): any => JSON.parse(readFileSync(path, 'utf8'))

describe('a second call with the same rule asks Jev nothing', () => {
  it('for judgeRule, across a restart', async () => {
    const path = cacheIn()
    const first = await judgeRule(judge(path), scene())
    expect(asked()).toEqual({ requests: 1, questions: 6 })
    // A new client and a new cache, as after the app starts again: only the file is shared.
    const second = await judgeRule(judge(path), scene())
    expect(asked()).toEqual({ requests: 0, questions: 0 })
    expect(second).toEqual(first)
  })

  it('for verifyRewrites', async () => {
    const path = cacheIn()
    const first = await verifyRewrites(judge(path), scene(), REWRITES, 'practice')
    expect(asked()).toEqual({ requests: 1, questions: 9 })
    const second = await verifyRewrites(judge(path), scene(), REWRITES, 'practice')
    expect(asked()).toEqual({ requests: 0, questions: 0 })
    expect(second).toEqual(first)
  })

  it('for judgeAnswer', async () => {
    const path = cacheIn()
    world.noul = (name) => (name === 'cut' ? 0.1 : 0.9)
    const reply = 'Without it the agent writes a page.'
    const first = await judgeAnswer(judge(path), scene(), EARNS, reply)
    expect(asked()).toEqual({ requests: 1, questions: 2 })
    const second = await judgeAnswer(judge(path), scene(), EARNS, reply)
    expect(asked()).toEqual({ requests: 0, questions: 0 })
    expect(second).toEqual(first)
    expect(second).toEqual({ answered: 0.9, cut: 0.1 })
  })
})

describe('what asks again', () => {
  it('a changed rule, line beside it, description, model or server asks every question again', async () => {
    const path = cacheIn()
    await judgeRule(judge(path), scene())
    expect(asked().questions).toBe(6)
    await judgeRule(judge(path), scene(OTHER))
    expect(asked().questions).toBe(6)
    await judgeRule(judge(path), scene(RULE, { before: '- Say what changed.' }))
    expect(asked().questions).toBe(6)
    await judgeRule(judge(path), scene(RULE, { description: 'Writes changelogs.' }))
    expect(asked().questions).toBe(6)
    await judgeRule(judge(path, 'jev-2.0.0'), scene())
    expect(asked().questions).toBe(6)
    vi.stubEnv('TYPESAFE_BASE_URL', 'https://staging.typesafe.example/')
    await judgeRule(judge(path), scene())
    expect(asked().questions).toBe(6)
    // The size band is not sent to Jev, so it changes no answer.
    vi.stubEnv('TYPESAFE_BASE_URL', '')
    await judgeRule(judge(path), scene(RULE, { band: 'over' }))
    expect(asked().questions).toBe(0)
  })

  it('a question in other words, or another reply, asks only what changed', async () => {
    const path = cacheIn()
    const reply = 'It keeps each note to two sentences.'
    await judgeAnswer(judge(path), scene(), EARNS, reply)
    expect(world.requests.map((r) => r.questions)).toEqual([['answered', 'cut']])
    asked()
    // The step's question in new words: `cut` is the same question of the same state, and is kept.
    await judgeAnswer(
      judge(path),
      scene(),
      { ...EARNS, answered: 'Does `answer` name what `rule` changes?' },
      reply,
    )
    expect(world.requests.map((r) => r.questions)).toEqual([['answered']])
    asked()
    await judgeAnswer(judge(path), scene(), EARNS, 'Nothing, really.')
    expect(asked().questions).toBe(2)
  })

  it('a request with some answers kept asks only the rest, and gives every answer in the order asked', async () => {
    const path = cacheIn()
    const jev = judge(path)
    const state = { rule: RULE }
    const questions = {
      a: noul('Is `rule` about notes?'),
      b: noul('Is `rule` short?'),
      c: noul('Does `rule` say why?'),
    }
    world.noul = (name) => ({ a: 0.1, b: 0.5, c: 0.95 })[name] ?? 0
    await jev.ask(state, { b: questions.b })
    asked()
    world.noul = () => 0
    const answers = await jev.ask(state, questions)
    expect(world.requests.map((r) => r.questions)).toEqual([['a', 'c']])
    expect(Object.keys(answers)).toEqual(['a', 'b', 'c'])
    expect(answers.b).toEqual({ type: 'noul', noul: 0.5 })
  })
})

describe('what is kept', () => {
  it('keeps nothing when Jev fails', async () => {
    const path = cacheIn()
    world.fail = true
    await expect(judgeRule(judge(path), scene())).rejects.toThrow('Jev is down')
    expect(existsSync(path)).toBe(false)
    world.fail = false
    asked()
    await judgeRule(judge(path), scene())
    expect(asked().questions).toBe(6)
  })

  it('keeps what came back of a request Jev answered in part, and asks only the rest', async () => {
    const path = cacheIn()
    world.leave = ['rule_why']
    await expect(judgeRule(judge(path), scene())).rejects.toThrow('Jev gave no noul')
    expect(Object.keys(fileAt(path).answers)).toHaveLength(5)
    world.leave = []
    asked()
    const judgment = await judgeRule(judge(path), scene())
    expect(world.requests.map((r) => r.questions)).toEqual([['rule_why']])
    expect(judgment.why).toBe(0.9)
  })

  it('keeps nothing of a request stopped on its way', async () => {
    const path = cacheIn()
    world.hold = true
    const stop = new AbortController()
    const reading = judgeRule(judge(path), scene(), stop.signal)
    for (let i = 0; i < 50 && !world.requests.length; i += 1)
      await new Promise((next) => setImmediate(next))
    stop.abort()
    await expect(reading).rejects.toThrow('stopped')
    expect(existsSync(path)).toBe(false)
    world.hold = false
    asked()
    await judgeRule(judge(path), scene())
    expect(asked().questions).toBe(6)
  })

  it('keeps an answer as Jev gave it, so a threshold reads a kept answer as it reads a new one', async () => {
    const path = cacheIn()
    // Between the judge's yes and no: a threshold moved either way would read it otherwise.
    world.noul = (name) => (name === 'rule_strict' ? 0.55 : 0.9)
    await judgeRule(judge(path), scene())
    const kept = Object.values(fileAt(path).answers).map((e) => (e as { answer: unknown }).answer)
    expect(kept).toContainEqual({ type: 'noul', noul: 0.55 })
    world.noul = () => 0
    const again = await judgeRule(judge(path), scene())
    expect(again.strict).toBe(0.55)
  })

  it('writes only hashes, Jev’s answers and when each was used: no rule, reply, rewrite or key', async () => {
    const path = cacheIn()
    const reply = 'Without it the agent writes a page.'
    await judgeRule(judge(path), scene())
    await verifyRewrites(judge(path), scene(), REWRITES, 'practice')
    await judgeAnswer(judge(path), scene(), EARNS, reply)
    const text = readFileSync(path, 'utf8')
    const words = [RULE, scene().before, scene().after, scene().description, reply, EARNS.ask]
    for (const said of [...words, ...Object.values(REWRITES), 'ts-test-key-not-to-be-kept'])
      expect(text).not.toContain(said.slice(2, 30))
    const file = fileAt(path)
    expect(Object.keys(file)).toEqual(['version', 'answers'])
    expect(file.version).toBe(1)
    const entries = Object.entries(file.answers) as Array<[string, Record<string, unknown>]>
    expect(entries).toHaveLength(6 + 9 + 2)
    for (const [key, entry] of entries) {
      expect(key).toMatch(/^[0-9a-f]{64}$/)
      expect(Object.keys(entry).sort()).toEqual(['answer', 'used'])
      expect(Number.isNaN(Date.parse(String(entry.used)))).toBe(false)
    }
  })
})

describe('the file as it is found', () => {
  it('reads a file that is empty, cut short, not JSON or in another shape as holding nothing, and carries on', async () => {
    const path = cacheIn()
    await judgeRule(judge(path), scene())
    const whole = readFileSync(path, 'utf8')
    const found = [
      '',
      whole.slice(0, whole.length / 2),
      'not json at all',
      'null',
      '[]',
      // The grading's shape: another file's, which this one never reads.
      JSON.stringify({ version: 2, generation: 1, packs: {}, answers: fileAt(path).answers }),
      JSON.stringify({ answers: fileAt(path).answers }),
      // Answers with no number in them are no answers.
      JSON.stringify({
        version: 1,
        answers: Object.fromEntries(
          Object.keys(fileAt(path).answers).map((key) => [key, { answer: { type: 'noul' } }]),
        ),
      }),
    ]
    for (const text of found) {
      writeFileSync(path, text)
      asked()
      const judgment = await judgeRule(judge(path), scene())
      expect(asked().questions, JSON.stringify(text.slice(0, 40))).toBe(6)
      expect(judgment.process).toBe(0.9)
      // Written over in its own shape, whole.
      expect(Object.keys(fileAt(path).answers)).toHaveLength(6)
    }
  })

  it('reads a file that cannot be written, and still answers', async () => {
    const path = cacheIn()
    await judgeRule(judge(path), scene())
    chmodSync(path, 0o444)
    try {
      asked()
      await judgeRule(judge(path), scene())
      expect(asked().questions).toBe(0)
      // A new rule is asked, and answered, whether or not its answers could be kept.
      expect((await judgeRule(judge(path), scene(OTHER))).process).toBe(0.9)
      expect(asked().questions).toBe(6)
    } finally {
      chmodSync(path, 0o644)
    }
  })

  it('answers when the folder cannot be written, and keeps nothing', async () => {
    const blocker = join(scratch('st-rule-cache-'), 'a-file')
    writeFileSync(blocker, 'not a folder')
    const path = join(blocker, 'rule-judge-cache.json')
    expect((await judgeRule(judge(path), scene())).process).toBe(0.9)
    expect((await judgeRule(judge(path), scene())).process).toBe(0.9)
    expect(asked()).toEqual({ requests: 2, questions: 12 })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('could not be kept'))
  })
})

describe('two writers', () => {
  it('loses no answer to two requests at once', async () => {
    const path = cacheIn()
    await Promise.all([judgeRule(judge(path), scene()), judgeRule(judge(path), scene(OTHER))])
    expect(Object.keys(fileAt(path).answers)).toHaveLength(12)
    asked()
    await judgeRule(judge(path), scene())
    await judgeRule(judge(path), scene(OTHER))
    expect(asked().questions).toBe(0)
  })

  it('loses no answer another copy kept while this one waited on Jev', async () => {
    const path = cacheIn()
    // The other copy, here `st` beside the app, reads the rule and keeps its answers mid-request.
    world.during = async () => {
      await judgeRule(judge(path), scene(OTHER))
    }
    await judgeRule(judge(path), scene())
    expect(Object.keys(fileAt(path).answers)).toHaveLength(12)
    asked()
    await judgeRule(judge(path), scene())
    await judgeRule(judge(path), scene(OTHER))
    expect(asked().questions).toBe(0)
  })
})

describe('its size', () => {
  it(`keeps the ${ANSWERS_MAX} answers used last, and drops the one used longest ago first`, async () => {
    const path = cacheIn()
    await judgeRule(judge(path), scene())
    const file = fileAt(path)
    const mine = Object.keys(file.answers)
    // Used before anything else on file, and so the first to go, until it is used again.
    for (const key of mine) file.answers[key].used = '2000-01-01T00:00:00.000Z'
    for (let i = 0; i < ANSWERS_MAX - mine.length; i += 1)
      file.answers[`filler-${String(i).padStart(4, '0')}`] = {
        answer: { type: 'noul', noul: 0.5 },
        used: new Date(Date.UTC(2020, 0, 1) + i * 1000).toISOString(),
      }
    writeFileSync(path, JSON.stringify(file))
    asked()
    await judgeRule(judge(path), scene())
    expect(asked().questions).toBe(0)
    await judgeRule(judge(path), scene(OTHER))
    expect(asked().questions).toBe(6)
    const kept = Object.keys(fileAt(path).answers)
    expect(kept).toHaveLength(ANSWERS_MAX)
    // The six used longest ago went: the fillers first written, not the answers read again since.
    for (let i = 0; i < 6; i += 1) expect(kept).not.toContain(`filler-000${i}`)
    expect(kept).toContain('filler-0006')
    expect(kept).toEqual(expect.arrayContaining(mine))
    await judgeRule(judge(path), scene())
    await judgeRule(judge(path), scene(OTHER))
    expect(asked().questions).toBe(0)
  })
})

describe('what is counted', () => {
  it('counts no call for a kept answer, and tells usage only what was asked', async () => {
    const path = cacheIn()
    const jev = judge(path)
    const state = { rule: RULE }
    const usage: Usage = { inputTokens: -1 }
    const first = await withMeter(async (meter) => {
      await jev.ask(state, { short: noul('Is `rule` short?') }, undefined, usage)
      return meter.calls
    })
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ provider: 'jev', operation: 'refine', source: 'asked' })
    expect(usage.inputTokens).toBe(40)
    const second = await withMeter(async (meter) => {
      await jev.ask(state, { short: noul('Is `rule` short?') }, undefined, usage)
      return meter.calls
    })
    expect(second).toEqual([])
    expect(usage.inputTokens).toBe(0)
  })

  it('stands aside under ST_AI_RECORD and ST_AI_REPLAY: the recording holds every question, and the replay answers as it was recorded', async () => {
    const path = cacheIn()
    const replies = scratch('st-rule-replies-')
    // Kept from before, with answers the recording will not give.
    await judgeRule(judge(path), scene())
    const before = readFileSync(path, 'utf8')
    asked()

    vi.stubEnv('ST_AI_RECORD', replies)
    world.noul = () => 0.2
    const recorded = await judgeRule(judge(path), scene())
    expect(asked()).toEqual({ requests: 1, questions: 6 })
    expect(recorded.process).toBe(0.2)

    vi.stubEnv('ST_AI_RECORD', '')
    vi.stubEnv('ST_AI_REPLAY', replies)
    const log = join(replies, 'read.log')
    vi.stubEnv('ST_AI_REPLAY_LOG', log)
    world.fail = true
    const calls = await withMeter(async (meter) => {
      expect(await judgeRule(judge(path), scene())).toEqual(recorded)
      expect(await judgeRule(judge(path), scene())).toEqual(recorded)
      return meter.calls
    })
    expect(world.requests).toEqual([])
    expect(calls.map((c) => c.source)).toEqual(['replayed', 'replayed'])
    expect(readFileSync(log, 'utf8').trim().split(/\r?\n/)).toHaveLength(12)
    // Neither the recording nor the replay touched what was kept.
    expect(readFileSync(path, 'utf8')).toBe(before)
  })
})
