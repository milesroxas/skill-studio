/**
 * The cost meter and saved replies, with the provider, Jev and the engine
 * stood in for: what a command's calls add up to, a saved reply answering a
 * provider and a Jev that would throw, and one key for one request whatever
 * folder its skill sits in.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AiUsage } from '@domain/ai.ts'
import { addTotals, runSpent, sumCalls } from '@domain/cost.ts'
import type { Report } from '@domain/schemas.ts'
import { metered, replyKey } from '@infrastructure/ai/metered.ts'
import {
  type AiProvider,
  type AiReply,
  type AiRequest,
  ProviderError,
} from '@infrastructure/ai/types.ts'
import { loadCases } from '@infrastructure/cases.ts'
import type { Engine } from '@infrastructure/engines/index.ts'
import { Jev } from '@judges/jev.ts'
import { withMeter } from '@judges/meter.ts'
import { MissingReply } from '@judges/replies.ts'
import { noul } from '@typesafe-ai/sdk'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Jev: each test says how it answers, and counts what it was asked. */
const jev = vi.hoisted(() => ({
  asked: [] as string[][],
  answer: (questions: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.keys(questions).map((name) => [name, { noul: 0.9 }])),
  fail: false,
}))

vi.mock('@typesafe-ai/sdk', async (original) => ({
  ...(await original<typeof import('@typesafe-ai/sdk')>()),
  TypeSafeClient: class {
    async systemOne(request: { questions: Record<string, unknown> }) {
      if (jev.fail) throw new Error('Jev was asked.')
      jev.asked.push(Object.keys(request.questions))
      return {
        model: 'jev-test',
        answers: jev.answer(request.questions),
        usage: { input_tokens: 40 },
      }
    }
  },
}))

/** The provider `st sort` reaches, here one of the test's own. */
const sorting = vi.hoisted(() => ({ provider: null as AiProvider | null }))
vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => sorting.provider,
  aiProviderInfo: async () => [
    {
      id: 'claude-code',
      connected: true,
      models: [{ id: 'sonnet', label: 'Sonnet', efforts: [] }],
    },
  ],
  isProviderError: (error: unknown) => error instanceof ProviderError,
}))
vi.mock('@infrastructure/preferences.ts', () => ({
  readPreferences: () => ({ aiProvider: 'claude-code', aiModel: 'sonnet', aiEffort: '' }),
}))

const { generateRun } = await import('./generate.ts')
const { gradeRun } = await import('./grade.ts')
const { sortSkill } = await import('./sorting.ts')

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
  vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
  vi.stubEnv('ST_AI_RECORD', '')
  vi.stubEnv('ST_AI_REPLAY', '')
  jev.asked = []
  jev.fail = false
})
afterEach(() => vi.unstubAllEnvs())

/** A provider that answers each request with `answer`, and counts them; `refuse` bills one and refuses it. */
function fakeProvider(
  answer: (request: AiRequest) => string = () => 'A reply.',
  usage: AiUsage = { input: 100, output: 20 },
): AiProvider & { requests: AiRequest[]; refuse: boolean } {
  const provider = {
    id: 'claude-code' as const,
    requests: [] as AiRequest[],
    refuse: false,
    connected: () => true,
    models: async () => [],
    run: async (request: AiRequest): Promise<AiReply> => {
      provider.requests.push(request)
      if (provider.refuse) throw new ProviderError('The reply ran too long.', usage, 'claude-test')
      return { text: answer(request), usage, model: 'claude-test' }
    },
    readFolder: async () => ({
      text: '{}',
      usage: { input: 900, output: 30 },
      model: 'claude-test',
    }),
  }
  return provider
}

/** A provider that throws if it is asked anything. */
const throwing: AiProvider = {
  id: 'claude-code',
  connected: () => true,
  models: async () => [],
  run: async () => {
    throw new Error('The provider was asked.')
  },
}

const request = (text: string, over: Partial<AiRequest> = {}): AiRequest => ({
  operation: 'sort',
  model: 'sonnet',
  effort: '',
  system: 'Brief.',
  messages: [{ role: 'user', text }],
  schema: { type: 'object' },
  signal: new AbortController().signal,
  onText: () => {},
  ...over,
})

/** A skill with one case, for the engine to answer. */
function noteSkill(): string {
  const skill = scratch('st-cost-skill-')
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: Notes\n---\n\n- Keep it short.\n')
  mkdirSync(join(skill, 'evals/cases/note'), { recursive: true })
  writeFileSync(join(skill, 'evals/cases/note/prompt.md'), 'Write a note.')
  return skill
}

/** An engine that writes a note in place of an agent, and says what the attempt read and wrote. */
const engine: Engine = {
  id: 'fake',
  label: 'Fake',
  harness: 'agent',
  efforts: [],
  defaultModel: 'small',
  hint: '',
  limitsTools: true,
  available: () => true,
  models: async () => ['small'],
  run: async (req) => {
    writeFileSync(join(req.cwd, 'outputs/note.md'), 'A note.')
    return {
      ok: true,
      error: null,
      costUsd: null,
      tokens: { input: 5000, output: 700 },
      model: 'small-1',
      finalText: null,
    }
  },
}

describe('the meter', () => {
  it('adds up Claude, Jev and the answer under test, each where it is asked', async () => {
    const skill = noteSkill()
    const provider = metered(fakeProvider(), () => {})
    const refusing = fakeProvider()
    refusing.refuse = true
    const calls = await withMeter(async (meter) => {
      await provider.run(request('One.'))
      await provider.run(request('Two.', { operation: 'chat' }))
      await expect(metered(refusing, () => {}).run(request('Three.'))).rejects.toThrow('too long')
      await provider.readFolder?.({
        operation: 'read',
        model: 'sonnet',
        effort: '',
        system: 'Brief.',
        prompt: 'Read it.',
        dir: skill,
        schema: {},
        signal: new AbortController().signal,
      })
      const judge = new Jev(undefined, 'grade')
      await judge.ask('An answer.', { short: noul('Is it short?') })
      await judge.ask('Another.', { short: noul('Is it short?'), kind: noul('Is it kind?') })
      await generateRun({
        skillDir: skill,
        cases: loadCases(skill),
        engine,
        model: null,
        effort: null,
        samples: 2,
        configuration: 'with_skill',
        baseline: null,
        skillName: 'First',
        note: '',
        parallel: 1,
        log: () => {},
      })
      return meter.calls
    })
    const totals = sumCalls(calls).map(({ seconds, ...rest }) => {
      expect(seconds).toBeGreaterThanOrEqual(0)
      return rest
    })
    expect(totals).toEqual([
      {
        operation: 'chat',
        provider: 'claude-code',
        model: 'claude-test',
        source: 'asked',
        calls: 1,
        input: 100,
        output: 20,
      },
      {
        operation: 'grade',
        provider: 'jev',
        model: 'jev-test',
        source: 'asked',
        calls: 2,
        input: 80,
        output: 0,
      },
      {
        operation: 'read',
        provider: 'claude-code',
        model: 'claude-test',
        source: 'asked',
        calls: 1,
        input: 900,
        output: 30,
      },
      {
        operation: 'run',
        provider: 'engine',
        model: 'small-1',
        source: 'asked',
        calls: 2,
        input: 10_000,
        output: 1400,
      },
      {
        operation: 'sort',
        provider: 'claude-code',
        model: 'claude-test',
        source: 'asked',
        calls: 2,
        input: 200,
        output: 40,
      },
    ])
  })

  it('sums the same calls to the same lines, whatever order they came in', () => {
    const record = (operation: 'sort' | 'read', model: string) => ({
      operation,
      provider: 'claude-code' as const,
      model,
      input: 1,
      output: 1,
      seconds: 0,
      source: 'replayed' as const,
    })
    const calls = [
      record('sort', 'b'),
      record('read', 'a'),
      record('sort', 'a'),
      record('read', 'a'),
    ]
    expect(sumCalls(calls)).toEqual(sumCalls([...calls].reverse()))
    expect(sumCalls(calls).map((t) => [t.operation, t.model])).toEqual([
      ['read', 'a'],
      ['sort', 'a'],
      ['sort', 'b'],
    ])
  })

  it('counts nothing outside a meter, and a call inside two to both', async () => {
    const provider = metered(fakeProvider(), () => {})
    await provider.run(request('Before.'))
    const [outer, inner] = await withMeter(async (outer) => {
      const inner = await withMeter(async (inner) => {
        await provider.run(request('Inside.'))
        return inner.calls.length
      })
      return [outer.calls.length, inner]
    })
    expect([outer, inner]).toEqual([1, 1])
  })

  it('logs each reply that was asked, refused or not, and none that was replayed', async () => {
    const log = vi.fn()
    const dir = scratch('st-cost-saved-')
    vi.stubEnv('ST_AI_RECORD', dir)
    await metered(fakeProvider(), log).run(request('One.'))
    vi.stubEnv('ST_AI_REPLAY', dir)
    await metered(throwing, log).run(request('One.'))
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toMatchObject({ provider: 'claude-code', input: 100, output: 20 })
  })
})

describe('saved replies', () => {
  it('answers a recorded reply again from its file, with a provider and a Jev that throw', async () => {
    const dir = scratch('st-cost-saved-')
    vi.stubEnv('ST_AI_RECORD', dir)
    const live = await metered(fakeProvider(), () => {}).run(request('Sort these.'))
    const asked = await new Jev(undefined, 'grade').ask('An answer.', {
      short: noul('Is it short?'),
      kind: noul('Is it kind?'),
    })
    const refusing = fakeProvider()
    refusing.refuse = true
    await expect(metered(refusing, () => {}).run(request('Too much.'))).rejects.toThrow()

    vi.stubEnv('ST_AI_RECORD', '')
    vi.stubEnv('ST_AI_REPLAY', dir)
    vi.stubEnv('TYPESAFE_API_KEY', '')
    jev.fail = true
    expect(Jev.available()).toBe(true)
    const shown: string[] = []
    const replayed = await withMeter(async (meter) => {
      const reply = await metered(throwing, () => {}).run(
        request('Sort these.', { onText: (text) => shown.push(text) }),
      )
      // Grouped otherwise than when they were saved: each question is answered on its own.
      const judge = new Jev(undefined, 'grade')
      const kind = await judge.ask('An answer.', { kind: noul('Is it kind?') })
      const both = await judge.ask('An answer.', {
        brief: noul('Is it short?'),
        kind: noul('Is it kind?'),
      })
      const refused = await metered(throwing, () => {})
        .run(request('Too much.'))
        .catch((error: unknown) => error)
      return { reply, kind, both, refused, calls: meter.calls }
    })
    expect(replayed.reply).toEqual(live)
    expect(shown).toEqual([live.text])
    expect(replayed.kind).toEqual({ kind: asked.kind })
    expect(replayed.both).toEqual({ brief: asked.short, kind: asked.kind })
    expect(replayed.refused).toBeInstanceOf(ProviderError)
    expect((replayed.refused as ProviderError).usage).toEqual({ input: 100, output: 20 })
    expect(replayed.calls.every((c) => c.source === 'replayed' && c.seconds === 0)).toBe(true)
    expect(replayed.calls.map((c) => c.provider)).toEqual([
      'claude-code',
      'jev',
      'jev',
      'claude-code',
    ])
  })

  it('stops a call with no saved reply, naming its operation and key', async () => {
    const dir = scratch('st-cost-saved-')
    vi.stubEnv('ST_AI_REPLAY', dir)
    jev.fail = true
    const asked = request('Never saved.', { operation: 'propose' })
    const missing = await withMeter(async (meter) => {
      await expect(metered(throwing, () => {}).run(asked)).rejects.toThrow(MissingReply)
      await expect(
        new Jev(undefined, 'read').ask('An answer.', { short: noul('Is it short?') }),
      ).rejects.toThrow(/No saved reply for read in .*jev\//)
      return meter.missing
    })
    expect(missing[0]).toContain(
      `propose in ${dir}: claude-code/${replyKey('claude-code', asked)}.json`,
    )
    expect(missing).toHaveLength(2)
  })

  it('stops a --deep session and the answer under test, which are never saved', async () => {
    const dir = scratch('st-cost-saved-')
    vi.stubEnv('ST_AI_REPLAY', dir)
    const provider = fakeProvider()
    const readFolder = vi.spyOn(provider, 'readFolder')
    const run = vi.spyOn(engine, 'run')
    const skill = noteSkill()
    const missing = await withMeter(async (meter) => {
      await expect(
        metered(provider, () => {}).readFolder?.({
          operation: 'propose',
          model: 'sonnet',
          effort: '',
          system: 'Brief.',
          prompt: 'Read it.',
          dir,
          schema: {},
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow('A --deep session is never saved')
      await expect(
        generateRun({
          skillDir: skill,
          cases: loadCases(skill),
          engine,
          model: null,
          effort: null,
          samples: 1,
          configuration: 'with_skill',
          baseline: null,
          skillName: 'First',
          note: '',
          parallel: 1,
          log: () => {},
        }),
      ).rejects.toThrow('The answer under test')
      return meter.missing
    })
    expect(readFolder).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(missing).toHaveLength(2)
    run.mockRestore()
  })

  it('never saves a session that reads a folder', async () => {
    const dir = scratch('st-cost-saved-')
    vi.stubEnv('ST_AI_RECORD', dir)
    const provider = metered(fakeProvider(), () => {})
    await provider.readFolder?.({
      operation: 'read',
      model: 'sonnet',
      effort: '',
      system: 'Brief.',
      prompt: 'Read it.',
      dir,
      schema: {},
      signal: new AbortController().signal,
    })
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('the key of a saved reply', () => {
  const FIXTURE = resolve(import.meta.dirname, '../../fixtures/launch-note')

  /** A copy of launch-note's skill and cases, without its runs, in a folder of its own. */
  function copy(): string {
    const dir = join(scratch('st-cost-copy-'), 'deep', 'launch-note')
    cpSync(join(FIXTURE, 'SKILL.md'), join(dir, 'SKILL.md'))
    cpSync(join(FIXTURE, 'evals/cases'), join(dir, 'evals/cases'), { recursive: true })
    return dir
  }

  const sortOptions = {
    again: false,
    parallel: 1,
    log: () => {},
    signal: new AbortController().signal,
  }

  it('is one for one request built from two copies of a skill in two folders', async () => {
    const saved = scratch('st-cost-saved-')
    vi.stubEnv('ST_AI_RECORD', saved)
    const first = fakeProvider(() => '{}')
    sorting.provider = metered(first, () => {})
    const live = await sortSkill(copy(), sortOptions)

    const second = fakeProvider(() => '{}')
    vi.stubEnv('ST_AI_RECORD', '')
    sorting.provider = metered(second, () => {})
    await sortSkill(copy(), sortOptions)
    const keys = (p: typeof first) => p.requests.map((r) => replyKey('claude-code', r))
    expect(first.requests.length).toBeGreaterThan(1)
    expect(keys(second)).toEqual(keys(first))

    // So a third copy is sorted from what the first saved, asking nobody.
    vi.stubEnv('ST_AI_REPLAY', saved)
    sorting.provider = metered(throwing, () => {})
    await expect(sortSkill(copy(), sortOptions)).rejects.toThrow('--model')
    const replayed = await sortSkill(copy(), { ...sortOptions, model: 'sonnet' })
    const readings = (r: typeof live) =>
      [...r.rules, ...r.cases.flatMap((c) => c.checks)].map((i) => i.stored?.reading)
    expect(readings(replayed)).toEqual(readings(live))
    expect(replayed.usage).toEqual(live.usage)
  })

  it('reads a picture by its bytes, not by where it is', () => {
    const [a, b] = [scratch('st-cost-pic-'), scratch('st-cost-pic-')]
    for (const dir of [a, b]) writeFileSync(join(dir, 'shot.png'), 'the same bytes')
    const withPicture = (dir: string) =>
      request('Look.', {
        messages: [
          {
            role: 'user',
            text: 'Look.',
            images: [{ name: 'shot.png', path: join(dir, 'shot.png'), type: 'image/png' }],
          },
        ],
      })
    expect(replyKey('claude-code', withPicture(a))).toBe(replyKey('claude-code', withPicture(b)))
    writeFileSync(join(b, 'shot.png'), 'other bytes')
    expect(replyKey('claude-code', withPicture(a))).not.toBe(
      replyKey('claude-code', withPicture(b)),
    )
  })
})

describe('what a run spent', () => {
  /** A run of the note skill with a rule Jev is asked of, one attempt, made by the engine that writes a note. */
  async function noteRun(): Promise<{ skill: string; run: string }> {
    const skill = noteSkill()
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: Notes\n---\n\n- Keep the note under fifty words.\n',
    )
    const { name } = await generateRun({
      skillDir: skill,
      cases: loadCases(skill),
      engine,
      model: null,
      effort: null,
      samples: 1,
      configuration: 'with_skill',
      baseline: null,
      skillName: 'First',
      note: '',
      parallel: 1,
      log: () => {},
    })
    return { skill, run: name }
  }
  const reportOf = (skill: string, run: string): Report =>
    JSON.parse(readFileSync(join(skill, 'evals/runs', run, 'report.json'), 'utf8'))
  const grade = (skill: string, run: string) =>
    gradeRun(skill, run, { useJev: true, log: () => {} })
  /** The grading's calls to Jev as its report keeps them, their seconds left out. */
  const jevCalls = (skill: string, run: string) =>
    reportOf(skill, run).gradingCost?.calls.map(({ seconds, ...rest }) => {
      expect(seconds).toBeGreaterThanOrEqual(0)
      return rest
    })

  it('keeps with a grading every model call it made, and adds a grading again to what was kept', async () => {
    const { skill, run } = await noteRun()
    await grade(skill, run)
    const asked = jev.asked.length
    expect(asked).toBeGreaterThan(0)
    const once = {
      operation: 'grade',
      provider: 'jev',
      model: 'jev-test',
      source: 'asked',
      calls: asked,
      input: 40 * asked,
      output: 0,
    }
    expect(jevCalls(skill, run)).toEqual([once])
    expect(reportOf(skill, run).gradingCost?.whole).toBe(true)
    // Asked again, with nothing kept from before: what was spent before is still spent.
    rmSync(join(skill, 'evals/runs', run, 'judge-cache.json'))
    await grade(skill, run)
    expect(jevCalls(skill, run)).toEqual([{ ...once, calls: 2 * asked, input: 80 * asked }])
    // Asked nothing new, its answers kept from before: nothing more is spent, and nothing is lost.
    await grade(skill, run)
    expect(jev.asked).toHaveLength(2 * asked)
    expect(jevCalls(skill, run)).toEqual([{ ...once, calls: 2 * asked, input: 80 * asked }])
  })

  it('says a grading again over a report that kept no cost is not the whole of what grading spent', async () => {
    const { skill, run } = await noteRun()
    await grade(skill, run)
    const path = join(skill, 'evals/runs', run, 'report.json')
    const { gradingCost: _, ...old } = reportOf(skill, run)
    writeFileSync(path, JSON.stringify(old))
    rmSync(join(skill, 'evals/runs', run, 'judge-cache.json'))
    await grade(skill, run)
    const kept = reportOf(skill, run).gradingCost
    expect(kept?.whole).toBe(false)
    // Only what this grading asked: the one before kept no count to add.
    expect(kept?.calls.map((c) => c.calls)).toEqual([jev.asked.length / 2])
  })

  it('adds up each attempt’s answer from its timing.json, saying over how many each figure is', () => {
    const answer = (seconds: number, tokens: [number, number] | null, usd: number | null) => ({
      seconds,
      tokens: tokens && { input: tokens[0], output: tokens[1] },
      usd,
    })
    const spent = runSpent(
      [
        answer(20.4, [1000, 50], 0.01),
        answer(30, [2000, 70], null),
        null,
        answer(1.25, null, null),
      ],
      null,
    )
    expect(spent).toEqual({
      attempts: 4,
      answering: {
        seconds: { attempts: 3, total: 51.65 },
        tokens: { attempts: 2, input: 3000, output: 120 },
        usd: { attempts: 1, total: 0.01 },
      },
      graded: false,
      grading: null,
    })
    expect(runSpent([], { gradingCost: { calls: [], whole: true } })).toMatchObject({
      attempts: 0,
      graded: true,
      grading: { calls: [], whole: true },
    })
    // A report kept from before reports kept their cost was graded, at a cost not known.
    expect(runSpent([], {})).toMatchObject({ graded: true, grading: null })
  })

  it('adds totals of the same calls to the same lines, as summing their records does', () => {
    const total = (model: string, calls: number) => ({
      operation: 'grade' as const,
      provider: 'jev' as const,
      model,
      source: 'asked' as const,
      calls,
      input: 10 * calls,
      output: 0,
      seconds: 0.5 * calls,
    })
    expect(addTotals([total('b', 1), total('a', 2)], [total('a', 3)])).toEqual([
      total('a', 5),
      total('b', 1),
    ])
  })
})
