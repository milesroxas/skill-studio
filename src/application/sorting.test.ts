/**
 * Sorting a skill with the assistant stood in for: what it is asked, how a
 * reading it gets wrong is asked again and then falls back, how the readings
 * are kept, and how a reading stops being current.
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
import { withEveryCase } from '@domain/every-case.ts'
import type { RuleReading } from '@domain/rule-reading.ts'
import { FALLBACK } from '@domain/sorting.ts'
import { checkIds, verdictId } from '@domain/verdict.ts'
import type { AiRequest } from '@infrastructure/ai/types.ts'
import { loadCases, loadEveryCase } from '@infrastructure/cases.ts'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** The model: each test says how it answers, and reads what it was asked. */
const model = vi.hoisted(() => ({
  requests: [] as AiRequest[],
  reply: (_request: AiRequest): string => '{}',
  fail: null as string | null,
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: async (request: AiRequest) => {
      model.requests.push(request)
      const asked = request.messages[0].text
      if (model.fail && asked.includes('The checks to read') && asked.includes(model.fail))
        throw new Error('The model is away.')
      return { text: model.reply(request), model: 'claude-test', usage: { input: 10, output: 2 } }
    },
  }),
  aiProviderInfo: async () => [
    {
      id: 'claude-code',
      connected: true,
      models: [{ id: 'sonnet', label: 'Sonnet', efforts: [] }],
    },
  ],
  isProviderError: () => false,
}))
vi.mock('@infrastructure/ai/store.ts', () => ({ recordUsage: () => {} }))
vi.mock('@infrastructure/preferences.ts', () => ({
  readPreferences: () => ({ aiProvider: 'claude-code', aiModel: 'sonnet', aiEffort: '' }),
}))

const { sortSkill } = await import('./sorting.ts')
const { currentReadings, readingsPath, readStored } = await import(
  '@infrastructure/rule-readings.ts'
)

const FIXTURE = resolve(import.meta.dirname, '../../fixtures/launch-note')
const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** A copy of launch-note's skill and cases, without its runs. */
function skill(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'st-sort-')), 'launch-note')
  made.push(dir)
  cpSync(join(FIXTURE, 'SKILL.md'), join(dir, 'SKILL.md'))
  cpSync(join(FIXTURE, 'evals/cases'), join(dir, 'evals/cases'), { recursive: true })
  return dir
}

const JUDGED: RuleReading = { reading: 'judged', span: 'any' }

/** The ids a prompt asks about, as it names them: a checks prompt shows the rules too, and asks only its checks. */
const idsIn = (text: string): string[] =>
  [
    ...text.matchAll(
      text.includes('The checks to read') ? /<check id="([^"]+)"/g : /<rule id="([^"]+)"/g,
    ),
  ].map((m) => m[1])

/**
 * A reply that answers every id it is asked with `reading`, or with what
 * `pick` gives for one; a check, with the rules `against` names for it, or none.
 */
const answering =
  (
    pick: (id: string, request: AiRequest) => unknown = () => JUDGED,
    against: (id: string, request: AiRequest) => unknown[] = () => [],
  ) =>
  (request: AiRequest): string => {
    const last = request.messages.at(-1)?.text ?? ''
    const checks = request.messages[0].text.includes('The checks to read')
    const ids = idsIn(request.messages[0].text).filter(
      (id) => request.messages.length === 1 || last.includes(`- ${id}:`),
    )
    return JSON.stringify({
      readings: ids.map((id) => ({
        id,
        reason: 'Fits.',
        reading: pick(id, request),
        ...(checks ? { against: against(id, request) } : {}),
      })),
    })
  }

const options = (over: Partial<Parameters<typeof sortSkill>[1]> = {}) => ({
  again: false,
  parallel: 2,
  log: () => {},
  signal: new AbortController().signal,
  ...over,
})

beforeEach(() => {
  model.requests = []
  model.reply = answering()
  model.fail = null
})

describe('sortSkill', () => {
  it('asks the rules once and each case’s checks once, with no tools, under the set model', async () => {
    const dir = skill()
    const result = await sortSkill(dir, options())
    const cases = loadCases(dir)
    expect(model.requests).toHaveLength(1 + cases.length)
    for (const request of model.requests) {
      expect(request.model).toBe('sonnet')
      expect(request.schema).not.toBeNull()
    }
    expect(result.rules.every((item) => item.stored?.reading.reading === 'judged')).toBe(true)
    expect(result.rules[0].stored?.model).toBe('claude-test')
    expect(result.cases.flatMap((c) => c.checks)).toHaveLength(
      cases.reduce((n, c) => n + c.graders.length, 0),
    )
  })

  it('asks again once for a refused reading, with why, and keeps the second', async () => {
    const dir = skill()
    model.reply = answering((id, request) =>
      id === 'r2' && request.messages.length === 1 ? { reading: 'judged' } : JUDGED,
    )
    const result = await sortSkill(dir, options())
    const retry = model.requests.find((r) => r.messages.length === 3)
    expect(retry?.messages[2].text).toContain('- r2: reading.span: is missing')
    expect(retry?.messages[1].role).toBe('assistant')
    const r2 = result.rules.find((item) => item.ref === 'r2')
    expect(r2?.stored?.reading).toEqual(JUDGED)
    expect(r2?.stored?.refused).toEqual(['reading.span: is missing'])
    expect(result.calls.find((c) => c.what === 'rules')).toMatchObject({
      refusedOnce: 1,
      refusedTwice: 0,
    })
  })

  it('falls back to Jev with no span when a reading is refused twice, and repairs nothing', async () => {
    const dir = skill()
    model.reply = answering((id) => (id === 'r3' ? { reading: 'exact', tests: [] } : JUDGED))
    const result = await sortSkill(dir, options())
    const r3 = result.rules.find((item) => item.ref === 'r3')
    expect(r3?.stored?.reading).toEqual(FALLBACK)
    expect(r3?.stored?.refused).toHaveLength(2)
    expect(result.calls.find((c) => c.what === 'rules')?.refusedTwice).toBe(1)
    const rules = loadCases(dir)[0]
    const current = currentReadings(dir, readFileSync(join(dir, 'SKILL.md'), 'utf8'), rules)
    expect(current.rules.get(verdictId('rule', r3?.text ?? ''))?.reading).toEqual(FALLBACK)
  })

  it('treats an id the reply leaves out as refused', async () => {
    const dir = skill()
    model.reply = (request) => {
      if (request.messages.length === 3) return answering()(request)
      const ids = idsIn(request.messages[0].text).filter((id) => id !== 'r1')
      return JSON.stringify({ readings: ids.map((id) => ({ id, reason: '', reading: JUDGED })) })
    }
    const result = await sortSkill(dir, options())
    expect(result.rules.find((i) => i.ref === 'r1')?.stored?.refused).toEqual([
      'no reading was given for this id',
    ])
  })

  it('keeps what one call made when another fails, and asks nothing current again', async () => {
    const dir = skill()
    model.fail = 'case="page-long"'
    const first = await sortSkill(dir, options())
    expect(first.calls.find((c) => c.what === 'page-long')?.error).toBe('The model is away.')
    expect(first.cases.find((c) => c.case === 'page-long')?.checks[0].stored).toBeNull()
    model.requests = []
    model.fail = null
    const second = await sortSkill(dir, options())
    expect(model.requests.map((r) => idsIn(r.messages[0].text))).toEqual([['c1', 'c2']])
    expect(second.rules.every((i) => i.kept)).toBe(true)
    model.requests = []
    await sortSkill(dir, options({ again: true }))
    expect(model.requests).toHaveLength(1 + loadCases(dir).length)
  })

  it('shows each case’s checks beside the whole skill and its rules', async () => {
    const dir = skill()
    await sortSkill(dir, options())
    const checks = model.requests.filter((r) => r.messages[0].text.includes('The checks to read'))
    expect(checks).toHaveLength(loadCases(dir).length)
    for (const request of checks) {
      expect(request.messages[0].text).toContain('<skill name="SKILL.md">')
      expect(request.messages[0].text).toContain('<rule id="r1"')
    }
  })

  it('shows the last reading of the same words beside them once SKILL.md changes, and none before', async () => {
    const dir = skill()
    const EXACT: RuleReading = {
      reading: 'exact',
      outputs: ['text'],
      join: 'all',
      tests: [{ test: 'count', read: { part: 'file' }, what: 'words', compare: 'at most', n: 9 }],
    }
    model.reply = answering((id) => (id === 'r4' || id === 'c1' ? EXACT : JUDGED))
    await sortSkill(dir, options())
    expect(model.requests.some((r) => r.messages[0].text.includes('<earlier'))).toBe(false)
    const md = join(dir, 'SKILL.md')
    writeFileSync(md, `${readFileSync(md, 'utf8')}\n- Sign every note with the team's name.\n`)
    model.requests = []
    await sortSkill(dir, options())
    const rules = model.requests.find((r) => !r.messages[0].text.includes('The checks to read'))
    const shown = rules?.messages[0].text ?? ''
    expect(shown).toContain(`<earlier for="r4">\n${JSON.stringify(EXACT)}\n</earlier>`)
    expect(shown).toContain(`<earlier for="r1">\n${JSON.stringify(JUDGED)}\n</earlier>`)
    // A rule the skill did not have before has nothing beside it.
    expect(shown).not.toContain('<earlier for="r20">')
    const quote = model.requests.find(
      (r) =>
        r.messages[0].text.includes('The checks to read') &&
        r.messages[0].text.includes('case="email-quote"'),
    )
    expect(quote?.messages[0].text).toContain(`<earlier for="c1">\n${JSON.stringify(EXACT)}`)
  })

  it('writes the file whole, leaving nothing beside it', async () => {
    const dir = skill()
    await sortSkill(dir, options())
    const evals = readdirSync(join(dir, 'evals'))
    expect(evals.filter((name) => name.endsWith('.tmp'))).toEqual([])
    const file = JSON.parse(readFileSync(readingsPath(dir), 'utf8'))
    expect(file.readings.length).toBe(readStored(dir).length)
  })

  it('refuses to read a torn file, so it is never written over as empty', async () => {
    const dir = skill()
    writeFileSync(readingsPath(dir), '{"readings": [')
    await expect(sortSkill(dir, options())).rejects.toThrow(/malformed/)
    expect(readFileSync(readingsPath(dir), 'utf8')).toBe('{"readings": [')
  })
})

describe('a rule that cannot hold beside a check', () => {
  const WORDS = 'Write no more than 120 words. Most readers stop after the first screen.'
  const FIX = 'Write no more than 120 words, unless the request asks for a full list.'
  /** Sorted with page-long's first check naming the word limit, `r4`, as a rule it cannot hold beside. */
  async function sorted(pick?: (id: string, request: AiRequest) => unknown) {
    const dir = skill()
    model.reply = answering(pick, (id, request) =>
      id === 'c1' && request.messages[0].text.includes('case="page-long"')
        ? [{ rule: 'r4', fix: FIX }]
        : [],
    )
    const result = await sortSkill(dir, options())
    const skillMd = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    const caseOf = (id: string) => {
      const found = loadCases(dir).find((c) => c.id === id)
      if (!found) throw new Error(`no ${id}`)
      return found
    }
    return { dir, skillMd, caseOf, result }
  }
  const limit = verdictId('rule', WORDS)

  it('keeps the check’s own reading and the rule by its words, and sets the rule aside on that case alone', async () => {
    const { dir, skillMd, caseOf, result } = await sorted()
    const check = result.cases.find((c) => c.case === 'page-long')?.checks[0]
    expect(check?.stored?.reading).toEqual(JUDGED)
    expect(check?.stored?.against).toEqual([{ rule: WORDS, fix: FIX }])
    const long = currentReadings(dir, skillMd, caseOf('page-long'))
    expect(long.checks.get(verdictId('check', 'The page lists all 180 changes.'))?.reading).toEqual(
      JUDGED,
    )
    expect(long.rules.get(limit)?.reading).toEqual({
      reading: 'unmarkable',
      why: 'conflict',
      with: 'c1',
      fix: FIX,
    })
    // Every other rule of the case, and the same rule on every other case, reads as its own reading says.
    expect(long.rules.get(verdictId('rule', result.rules[0].text))?.reading).toEqual(JUDGED)
    expect(currentReadings(dir, skillMd, caseOf('page-basic')).rules.get(limit)?.reading).toEqual(
      JUDGED,
    )
  })

  it('asks again for a check called in conflict itself, and keeps the second reading', async () => {
    const { result } = await sorted((id, request) =>
      id === 'c2' && request.messages.length === 1
        ? { reading: 'unmarkable', why: 'conflict', with: 'r4', fix: null }
        : JUDGED,
    )
    const c2 = result.cases.find((c) => c.case === 'page-long')?.checks[1]
    expect(c2?.stored?.reading).toEqual(JUDGED)
    expect(c2?.stored?.refused).toEqual([expect.stringContaining('a check is never in conflict')])
  })

  it('keeps a rule’s own reading when it cannot be marked anyway', async () => {
    const VAGUE = { reading: 'unmarkable', why: 'vague', with: null, fix: null }
    const { dir, skillMd, caseOf } = await sorted((id, request) =>
      id === 'r4' && !request.messages[0].text.includes('The checks to read') ? VAGUE : JUDGED,
    )
    expect(currentReadings(dir, skillMd, caseOf('page-long')).rules.get(limit)?.reading).toEqual(
      VAGUE,
    )
  })

  it('stops setting the rule aside once the check, the rule or the case’s request changes', async () => {
    const reworded = await sorted()
    const grader = join(reworded.dir, 'evals/cases/page-long/graders/01-all.md')
    writeFileSync(grader, readFileSync(grader, 'utf8').replace('all 180', 'every one of the 180'))
    const afterCheck = currentReadings(reworded.dir, reworded.skillMd, reworded.caseOf('page-long'))
    expect(afterCheck.rules.get(limit)?.reading).toEqual(JUDGED)

    const ruled = await sorted()
    const md = join(ruled.dir, 'SKILL.md')
    const edited = readFileSync(md, 'utf8').replace('120 words', '150 words')
    writeFileSync(md, edited)
    const afterRule = currentReadings(ruled.dir, edited, ruled.caseOf('page-long'))
    expect(afterRule.rules.size + afterRule.checks.size).toBe(0)

    const asked = await sorted()
    const prompt = join(asked.dir, 'evals/cases/page-long/prompt.md')
    writeFileSync(prompt, `${readFileSync(prompt, 'utf8')}\nKeep it short.\n`)
    const afterAsk = currentReadings(asked.dir, asked.skillMd, asked.caseOf('page-long'))
    expect(afterAsk.checks.size).toBe(0)
    expect(afterAsk.rules.get(limit)?.reading).toEqual(JUDGED)
  })

  it('leaves out a kept entry whose check is in conflict itself', async () => {
    const { dir, skillMd, caseOf } = await sorted()
    const file = JSON.parse(readFileSync(readingsPath(dir), 'utf8'))
    for (const entry of file.readings)
      if (entry.kind === 'check')
        entry.reading = { reading: 'unmarkable', why: 'conflict', with: 'r4', fix: null }
    writeFileSync(readingsPath(dir), JSON.stringify(file))
    const long = currentReadings(dir, skillMd, caseOf('page-long'))
    expect(long.checks.size).toBe(0)
    expect(long.rules.get(limit)?.reading).toEqual(JUDGED)
  })
})

describe('currentReadings', () => {
  async function sorted() {
    const dir = skill()
    await sortSkill(dir, options())
    const skillMd = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    const quote = () => {
      const found = loadCases(dir).find((c) => c.id === 'email-quote')
      if (!found) throw new Error('no email-quote')
      return found
    }
    return { dir, skillMd, quote }
  }

  it('returns every rule and check by the id its verdict carries', async () => {
    const { dir, skillMd, quote } = await sorted()
    const current = currentReadings(dir, skillMd, quote())
    expect(current.rules.size).toBe(19)
    expect([...current.checks.keys()]).toEqual([
      verdictId('check', 'The email names Priya Raman of Slate & Pine Studio.'),
    ])
  })

  it('returns no rule and no check once SKILL.md is edited: a check is read beside the rules', async () => {
    const { dir, skillMd, quote } = await sorted()
    const current = currentReadings(dir, `${skillMd}\nOne more line.\n`, quote())
    expect(current.rules.size).toBe(0)
    expect(current.checks.size).toBe(0)
  })

  it('returns no check of a case whose request or files changed', async () => {
    const { dir, skillMd, quote } = await sorted()
    const prompt = join(dir, 'evals/cases/email-quote/prompt.md')
    writeFileSync(prompt, `${readFileSync(prompt, 'utf8')}\nSay it twice.\n`)
    expect(currentReadings(dir, skillMd, quote()).checks.size).toBe(0)
    expect(currentReadings(dir, skillMd, quote()).rules.size).toBe(19)
    const other = await sorted()
    const brief = join(other.dir, 'evals/cases/email-quote/files/brief.md')
    writeFileSync(brief, `${readFileSync(brief, 'utf8')}Price: 13 USD a month\n`)
    expect(currentReadings(other.dir, other.skillMd, other.quote()).checks.size).toBe(0)
  })

  it('returns no reading for a check reworded, and keeps the case’s others', async () => {
    const { dir, skillMd } = await sorted()
    const grader = join(dir, 'evals/cases/email-crowded/graders/02-date.md')
    writeFileSync(grader, readFileSync(grader, 'utf8').replace('9 June 2027', 'the 9th of June'))
    const crowded = loadCases(dir).find((c) => c.id === 'email-crowded')
    if (!crowded) throw new Error('no email-crowded')
    const current = currentReadings(dir, skillMd, crowded)
    expect([...current.checks.keys()]).toEqual([
      verdictId('check', 'The email names all six features.'),
    ])
  })

  it('reads a case as a run asked it, by the run’s kept fingerprint', async () => {
    const { dir, skillMd, quote } = await sorted()
    const asked = quote()
    const { askOf } = await import('@infrastructure/run-cases.ts')
    const kept = askOf(dir, asked)
    const prompt = join(dir, 'evals/cases/email-quote/prompt.md')
    writeFileSync(prompt, 'Write something else.\n')
    expect(currentReadings(dir, skillMd, quote()).checks.size).toBe(0)
    expect(currentReadings(dir, skillMd, quote(), { ask: kept }).checks.size).toBe(1)
  })

  it('returns nothing made under another version of the prompt', async () => {
    const { dir, skillMd, quote } = await sorted()
    const file = JSON.parse(readFileSync(readingsPath(dir), 'utf8'))
    for (const entry of file.readings) entry.prompt += 1
    writeFileSync(readingsPath(dir), JSON.stringify(file))
    const current = currentReadings(dir, skillMd, quote())
    expect(current.rules.size + current.checks.size).toBe(0)
  })

  it('stamps every reading with the prompt’s version, so raising it finds none', async () => {
    const { dir, skillMd, quote } = await sorted()
    vi.resetModules()
    vi.doMock('@domain/sorting.ts', async (original) => ({
      ...(await original<typeof import('@domain/sorting.ts')>()),
      SORT_PROMPT_VERSION: 999,
    }))
    const raised = await import('@infrastructure/rule-readings.ts')
    const current = raised.currentReadings(dir, skillMd, quote())
    expect(current.rules.size + current.checks.size).toBe(0)
    vi.doUnmock('@domain/sorting.ts')
  })

  it('leaves out an entry that no longer holds to the shape', async () => {
    const { dir, skillMd, quote } = await sorted()
    const file = JSON.parse(readFileSync(readingsPath(dir), 'utf8'))
    for (const entry of file.readings) entry.reading = { reading: 'exact', tests: 'run this' }
    writeFileSync(readingsPath(dir), JSON.stringify(file))
    const current = currentReadings(dir, skillMd, quote())
    expect(current.rules.size + current.checks.size).toBe(0)
  })

  it('leaves out only what the assistant said where it is off its shape, keeps the reading, and says so once', async () => {
    const { dir, skillMd, quote } = await sorted()
    const file = JSON.parse(readFileSync(readingsPath(dir), 'utf8'))
    for (const entry of file.readings) entry.assistant = { reading: 'run this' }
    writeFileSync(readingsPath(dir), JSON.stringify(file))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const kept = readStored(dir)
      expect(kept).toHaveLength(file.readings.length)
      expect(kept.every((entry) => entry.assistant === undefined && entry.reading)).toBe(true)
      expect(currentReadings(dir, skillMd, quote()).rules.size).toBe(19)
      // A sort asks nothing again for them.
      model.requests = []
      await sortSkill(dir, options())
      expect(model.requests).toHaveLength(0)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toContain('left out and the reading kept')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('code’s word on two exact readings', () => {
  const WORDS = 'Write no more than 120 words. Most readers stop after the first screen.'
  const FIX = 'Write no more than 120 words, unless the request asks for a full list.'
  const TEXT = { part: 'text', skip: null } as const
  const opens = (value: string): RuleReading => ({
    reading: 'exact',
    outputs: ['text', 'page'],
    join: 'all',
    tests: [
      {
        test: 'has',
        read: TEXT,
        values: { from: 'listed', items: [value] },
        need: 'all',
        at: 'start',
        match: 'words',
        case: 'exact',
      },
    ],
  })
  const words = (compare: 'at most' | 'at least', n: number): RuleReading => ({
    reading: 'exact',
    outputs: ['text', 'page'],
    join: 'all',
    tests: [{ test: 'count', read: TEXT, what: 'words', compare, n }],
  })
  /** Opens with the request's own value under `label`, as each case's request gives it. */
  const brief = (label: string): RuleReading => ({
    reading: 'exact',
    outputs: ['text', 'page'],
    join: 'all',
    tests: [
      {
        test: 'has',
        read: TEXT,
        values: {
          from: 'request',
          in: 'request and files',
          file: null,
          labels: [label],
          take: 'whole',
          level: null,
        },
        need: 'all',
        at: 'start',
        match: 'words',
        case: 'exact',
      },
    ],
  })
  /** A SKILL.md of `body`, with front matter as launch-note's. */
  const md = (body: string) =>
    `---\nname: launch-note\ndescription: Write a launch note for a release, as an email or as a page.\n---\n\n${body}\n`
  const TOP = 'Keep each note under 500 words. Nobody reads past that.'
  /** A rule above every heading, which grading asks of every output, and the word limit under an email heading. */
  const CHECK_SKILL = md(`- ${TOP}\n\n## Rules for an email\n\n- ${WORDS}`)
  const SHORT = 'Keep the text to no more than 120 words. Short notes get read.'
  const LONG = 'Write at least 300 words of text. A short report leaves gaps.'
  const isLong = (request: AiRequest) => request.messages[0].text.includes('case="page-long"')
  const checks = (request: AiRequest) => request.messages[0].text.includes('The checks to read')

  /** Sorted with the rules and page-long's first check read as `pick` says, and `named` as the rules it names it cannot hold beside. */
  async function sorted(
    pick: Record<string, RuleReading>,
    named: unknown[] = [],
    written?: string,
  ) {
    const dir = skill()
    if (written) writeFileSync(join(dir, 'SKILL.md'), written)
    model.reply = answering(
      (id, request) => {
        const key = checks(request) ? (isLong(request) ? `page-long ${id}` : '') : id
        return pick[key] ?? JUDGED
      },
      (id, request) => (id === 'c1' && isLong(request) ? named : []),
    )
    const result = await sortSkill(dir, options())
    const skillMd = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    const long = loadCases(dir).find((c) => c.id === 'page-long')
    if (!long) throw new Error('no page-long')
    return { dir, result, current: currentReadings(dir, skillMd, long) }
  }
  const rule = (result: Awaited<ReturnType<typeof sorted>>['result'], ref: string) =>
    result.rules.find((item) => item.ref === ref)
  const longCheck = (result: Awaited<ReturnType<typeof sorted>>['result']) =>
    result.cases.find((c) => c.case === 'page-long')?.checks[0]

  it('finds two rules the assistant read as answered by code in conflict, keeps that, and keeps the assistant’s reading beside it', async () => {
    const { dir, result, current } = await sorted({ r1: opens('Hello'), r2: opens('Dear reader') })
    expect(rule(result, 'r1')?.stored).toMatchObject({
      reading: { reading: 'unmarkable', why: 'conflict', with: 'r2', fix: null },
      assistant: { reading: opens('Hello') },
    })
    expect(rule(result, 'r2')?.stored?.reading).toMatchObject({ with: 'r1' })
    expect(result.decided).toEqual([
      expect.objectContaining({
        kind: 'rules',
        ref: 'r1',
        rule: 'r2',
        holds: false,
        assistant: true,
      }),
    ])
    const r1 = rule(result, 'r1')?.text ?? ''
    expect(current.rules.get(verdictId('rule', r1))?.reading).toMatchObject({ why: 'conflict' })
    // Kept, it is decided the same, and nothing is written again.
    const before = readFileSync(readingsPath(dir), 'utf8')
    model.requests = []
    const again = await sortSkill(dir, options())
    expect(model.requests).toHaveLength(0)
    expect(again.decided).toEqual(result.decided)
    expect(readFileSync(readingsPath(dir), 'utf8')).toBe(before)
  })

  it('shows the next sort the assistant’s own reading as the earlier one, not code’s', async () => {
    const { dir } = await sorted({ r1: opens('Hello'), r2: opens('Dear reader') })
    const md = join(dir, 'SKILL.md')
    writeFileSync(md, `${readFileSync(md, 'utf8')}\n- Sign every note with the team's name.\n`)
    model.requests = []
    await sortSkill(dir, options())
    const shown = model.requests.find((r) => !checks(r))?.messages[0].text ?? ''
    expect(shown).toContain(`<earlier for="r1">\n${JSON.stringify(opens('Hello'))}\n</earlier>`)
  })

  it('lets two rules stand that can both hold, and two not both read by code', async () => {
    const both = await sorted({ r1: opens('Ferry'), r2: opens('Ferry 3.2 is here') })
    expect(rule(both.result, 'r1')?.stored?.reading).toEqual(opens('Ferry'))
    expect(rule(both.result, 'r1')?.stored?.assistant).toBeUndefined()
    expect(both.result.decided).toEqual([expect.objectContaining({ holds: true, assistant: true })])
    const one = await sorted({ r1: opens('Hello') })
    expect(rule(one.result, 'r1')?.stored?.reading).toEqual(opens('Hello'))
    expect(one.result.decided).toEqual([])
  })

  it('names a rule above every heading in a check’s against where code finds the two cannot hold, and leaves one under a heading to the assistant', async () => {
    const { result, current } = await sorted(
      {
        r1: words('at most', 499),
        r2: words('at most', 120),
        'page-long c1': words('at least', 600),
      },
      [],
      CHECK_SKILL,
    )
    // Both rules' readings clash with the check's, but grading asks of the email heading whether it is for a page at all.
    expect(longCheck(result)?.stored).toMatchObject({
      against: [{ rule: TOP, fix: null }],
      assistant: { against: [] },
    })
    expect(result.decided).toEqual([
      expect.objectContaining({
        kind: 'check',
        ref: 'c1',
        rule: 'r1',
        holds: false,
        assistant: true,
      }),
    ])
    expect(current.rules.get(verdictId('rule', TOP))?.reading).toEqual({
      reading: 'unmarkable',
      why: 'conflict',
      with: 'c1',
      fix: null,
    })
    expect(current.rules.get(verdictId('rule', WORDS))?.reading).toEqual(words('at most', 120))
  })

  it('takes a rule above every heading out of a check’s against where code finds the two can hold, and says what the assistant said', async () => {
    const said = [
      { rule: 'r1', fix: FIX },
      { rule: 'r2', fix: FIX },
    ]
    const { result, current } = await sorted(
      {
        r1: words('at most', 499),
        r2: words('at most', 120),
        'page-long c1': words('at least', 100),
      },
      said,
      CHECK_SKILL,
    )
    expect(longCheck(result)?.stored).toMatchObject({
      against: [{ rule: WORDS, fix: FIX }],
      assistant: {
        against: [
          { rule: TOP, fix: FIX },
          { rule: WORDS, fix: FIX },
        ],
      },
    })
    expect(result.decided).toEqual([
      expect.objectContaining({
        kind: 'check',
        case: 'page-long',
        ref: 'c1',
        rule: 'r1',
        holds: true,
        assistant: false,
      }),
    ])
    expect(current.rules.get(verdictId('rule', TOP))?.reading).toEqual(words('at most', 499))
  })

  it('leaves the assistant’s against untouched where one reading is not read by code', async () => {
    const { result } = await sorted(
      { r1: words('at most', 499) },
      [{ rule: 'r1', fix: FIX }],
      CHECK_SKILL,
    )
    expect(longCheck(result)?.stored?.against).toEqual([{ rule: TOP, fix: FIX }])
    expect(longCheck(result)?.stored?.assistant).toBeUndefined()
    expect(result.decided).toEqual([])
  })

  it('leaves two rules to the assistant that stand under different headings, and finds the same two under one heading in conflict', async () => {
    const counts = { r1: words('at most', 120), r2: words('at least', 300) }
    const starts = { r1: opens('Hello'), r2: opens('Dear') }
    for (const pick of [counts, starts]) {
      const apart = await sorted(pick, [], md(`## Emails\n\n- ${SHORT}\n\n## Reports\n\n- ${LONG}`))
      expect(apart.result.decided).toEqual([])
      expect(rule(apart.result, 'r1')?.stored?.reading).toEqual(pick.r1)
      expect(rule(apart.result, 'r2')?.stored?.assistant).toBeUndefined()
      const together = await sorted(
        pick,
        [],
        md(`## Rules for every note\n\n- ${SHORT}\n- ${LONG}`),
      )
      expect(together.result.decided).toEqual([
        expect.objectContaining({ kind: 'rules', ref: 'r1', rule: 'r2', holds: false }),
      ])
      expect(rule(together.result, 'r1')?.stored?.reading).toMatchObject({
        why: 'conflict',
        with: 'r2',
      })
    }
  })

  it('leaves two rules to the assistant where one sets a condition of its own', async () => {
    const own = 'When the note is an email, keep the text to no more than 120 words.'
    const { result } = await sorted(
      { r1: words('at most', 120), r2: words('at least', 300) },
      [],
      md(`## Rules for every note\n\n- ${own}\n- ${LONG}`),
    )
    expect(result.decided).toEqual([])
    expect(rule(result, 'r1')?.stored?.reading).toEqual(words('at most', 120))
  })

  it('decides two rules again on the next sort once a case is changed or added, and gives the assistant its word back', async () => {
    const headline = brief('Headline')
    const pick = { r1: headline, r2: opens('Hello') }
    // No brief's headline starts with Hello: the two cannot both hold on any case.
    const edited = await sorted(pick)
    expect(rule(edited.result, 'r1')?.stored?.reading).toMatchObject({ why: 'conflict' })
    const file = join(edited.dir, 'evals/cases/email-price/files/brief.md')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        'Headline: Bookings now confirm themselves.',
        'Headline: Hello, bookings now confirm themselves.',
      ),
    )
    const after = await sortSkill(edited.dir, options())
    expect(after.decided.filter((d) => d.kind === 'rules')).toEqual([])
    expect(rule(after, 'r1')?.stored?.reading).toEqual(headline)
    expect(rule(after, 'r1')?.stored?.assistant).toBeUndefined()
    expect(readStored(edited.dir).some((entry) => entry.assistant)).toBe(false)

    // A case whose brief gives no headline: code gives no answer there, so Jev's would stand.
    const added = await sorted(pick)
    const plain = join(added.dir, 'evals/cases/email-plain')
    cpSync(join(added.dir, 'evals/cases/email-free'), plain, { recursive: true })
    const yaml = join(plain, 'case.yaml')
    writeFileSync(
      yaml,
      readFileSync(yaml, 'utf8').replace(/^title: .*$/m, 'title: Launch email, no headline'),
    )
    const plainBrief = join(plain, 'files/brief.md')
    writeFileSync(plainBrief, readFileSync(plainBrief, 'utf8').replace(/^Headline: .*\r?\n/m, ''))
    const grown = await sortSkill(added.dir, options())
    expect(grown.cases.some((c) => c.case === 'email-plain')).toBe(true)
    expect(rule(grown, 'r1')?.stored?.reading).toEqual(headline)
    expect(rule(grown, 'r2')?.stored?.reading).toEqual(opens('Hello'))
  })

  it('still loads readings kept before code had its word, and asks nothing for them', async () => {
    const dir = skill()
    cpSync(join(FIXTURE, 'evals/rule-readings.json'), readingsPath(dir))
    const kept = readStored(dir)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.every((entry) => entry.assistant === undefined)).toBe(true)
    const result = await sortSkill(dir, options())
    expect(model.requests).toHaveLength(0)
    const items = [...result.rules, ...result.cases.flatMap((c) => c.checks)]
    expect(items.every((item) => item.kept && item.stored)).toBe(true)
    expect(result.decided.filter((d) => d.holds !== d.assistant)).toEqual([])
    expect(readStored(dir)).toEqual(kept)
  })
})

describe('a new exact reading held to the answers kept', () => {
  const WORDS = 'Write no more than 120 words. Most readers stop after the first screen.'
  const LIMIT: RuleReading = {
    reading: 'exact',
    outputs: ['text', 'page'],
    join: 'all',
    tests: [
      {
        test: 'count',
        read: { part: 'text', skip: null },
        what: 'words',
        compare: 'at most',
        n: 120,
      },
    ],
  }
  const HAIKU = '2026-11-20-skill-v1-claude-haiku'
  const SONNET = '2026-11-20-skill-v0-claude-sonnet'

  /** A copy of launch-note with its runs and their gradings, and without its readings. */
  function graded(): string {
    const dir = join(mkdtempSync(join(tmpdir(), 'st-sort-runs-')), 'launch-note')
    made.push(dir)
    cpSync(FIXTURE, dir, { recursive: true })
    rmSync(readingsPath(dir))
    return dir
  }
  const sortedWith = async (dir: string) => {
    model.reply = answering((id, request) =>
      id === 'r4' && !request.messages[0].text.includes('The checks to read') ? LIMIT : JUDGED,
    )
    return (await sortSkill(dir, options())).flagged
  }
  const flag = (
    run: string,
    sample: string,
    code: boolean,
    kept: boolean,
    by: 'jev' | 'reader',
  ) => ({
    kind: 'rule',
    ref: 'r4',
    case: null,
    text: WORDS,
    run,
    sample,
    code,
    kept,
    by,
  })

  it('flags the one output where code’s answer is not Jev’s sure one, and none Jev was not sure of or has no answer on', async () => {
    // On email-crowded Jev was sure the 136 words keep the limit (0.75). Where Jev was not sure
    // (0.59, 0.38) nothing is flagged, nor on page-long, where the limit was set aside and Jev not asked.
    expect(await sortedWith(graded())).toEqual([
      flag(HAIKU, 'email-crowded-s1', false, true, 'jev'),
    ])
  })

  it('holds it to the person’s own mark over Jev’s', async () => {
    const dir = graded()
    const reviews = {
      reviews: {
        [`${HAIKU}/email-crowded-s1`]: { corrections: { [verdictId('rule', WORDS)]: false } },
        [`${SONNET}/email-free-s1`]: { corrections: { [verdictId('rule', WORDS)]: false } },
      },
    }
    writeFileSync(join(dir, 'evals/reviews.json'), JSON.stringify(reviews))
    expect(await sortedWith(dir)).toEqual([flag(SONNET, 'email-free-s1', true, false, 'reader')])
  })

  it('flags nothing on a skill with no runs', async () => {
    expect(await sortedWith(skill())).toEqual([])
  })
})

describe('sortSkill, on the checks for every case', () => {
  const every = (dir: string, statement: string) => {
    mkdirSync(join(dir, 'evals/graders'), { recursive: true })
    writeFileSync(join(dir, 'evals/graders/01-version.md'), `---\n---\n${statement}\n`)
  }

  it('reads each for every case, beside its own, kept until it is reworded', async () => {
    const dir = skill()
    every(dir, 'It names the product with its version.')
    const result = await sortSkill(dir, options())
    const cases = loadCases(dir)
    for (const c of result.cases) {
      const last = c.checks.at(-1)
      expect(last).toMatchObject({ every: true, text: 'It names the product with its version.' })
      expect(last?.stored?.reading).toEqual(JUDGED)
      expect(c.checks.filter((item) => item.every)).toHaveLength(1)
    }
    expect(result.cases.flatMap((c) => c.checks)).toHaveLength(
      cases.reduce((n, c) => n + c.graders.length + 1, 0),
    )
    // A grading finds the reading by the case it is graded on.
    const [first] = cases
    const graded = withEveryCase(first, loadEveryCase(dir))
    const ids = checkIds(graded.graders.map((g) => ({ id: g.id, text: g.statement })))
    const skillMd = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    expect(currentReadings(dir, skillMd, graded).checks.get(ids.at(-1) as string)?.reading).toEqual(
      JUDGED,
    )

    // Sorted again, nothing is current to ask; reworded, it is asked again for every case.
    model.requests = []
    await sortSkill(dir, options())
    expect(model.requests).toHaveLength(0)
    every(dir, 'It names the product with its version number.')
    const reworded = withEveryCase(first, loadEveryCase(dir))
    expect(
      currentReadings(dir, skillMd, reworded).checks.get(
        checkIds(reworded.graders.map((g) => ({ id: g.id, text: g.statement }))).at(-1) as string,
      ),
    ).toBeUndefined()
    const again = await sortSkill(dir, options())
    expect(model.requests).toHaveLength(cases.length)
    expect(again.cases.every((c) => c.checks.filter((i) => !i.kept).length === 1)).toBe(true)
  })
})
