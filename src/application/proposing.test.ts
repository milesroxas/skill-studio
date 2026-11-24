/**
 * Proposing checks with the session stood in for: which answers are read and
 * what the folder holds, how a proposal that does not fit is asked for again,
 * what is kept, when a case is read again, and accepting and dropping.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AiFolderRequest } from '@infrastructure/ai/types.ts'
import { loadCases, loadEveryCase } from '@infrastructure/cases.ts'
import type { JevAsker } from '@judges/jev.ts'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** What the session does: each test says how it answers, and sees what it was given. */
const session = vi.hoisted(() => ({
  requests: [] as AiFolderRequest[],
  sheets: [] as string[],
  skillSeen: [] as boolean[],
  /** One message's text and brief, when the material is sent in one. */
  messages: [] as string[],
  systems: [] as string[],
  reply: (_request: AiFolderRequest, _turn: number): string => '{"proposals":[]}',
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: async (request: { system: string; messages: Array<{ text: string }> }) => {
      session.messages.push(request.messages[0]?.text ?? '')
      session.systems.push(request.system)
      return {
        text: session.reply({ dir: '' } as AiFolderRequest, session.messages.length),
        model: 'claude-test',
        usage: { input: 100, output: 10 },
      }
    },
    readFolder: async (request: AiFolderRequest) => {
      session.requests.push(request)
      session.sheets.push(readFileSync(join(request.dir, 'sheet.md'), 'utf8'))
      session.skillSeen.push(
        existsSync(join(request.dir, 'skill')) || existsSync(join(request.dir, 'SKILL.md')),
      )
      return {
        text: session.reply(request, session.requests.length),
        model: 'claude-test',
        usage: { input: 100, output: 10 },
      }
    },
  }),
  isProviderError: () => false,
}))
vi.mock('@infrastructure/ai/store.ts', () => ({ recordUsage: () => {} }))

const {
  acceptEveryCase,
  acceptProposals,
  answersFor,
  dropEveryCase,
  dropProposals,
  restoreEveryCase,
  restoreProposals,
  proposeChecks,
  proposedChecks,
} = await import('./proposing.ts')
const { readProposals } = await import('@infrastructure/proposals.ts')

const FIXTURE = resolve(import.meta.dirname, '../../fixtures/launch-note')
const CASE = 'email-free'
const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** A copy of launch-note with its runs. */
function skill(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'st-propose-')), 'launch-note')
  made.push(dir)
  cpSync(FIXTURE, dir, { recursive: true })
  return dir
}

const options = (over: Record<string, unknown> = {}) => ({
  provider: 'claude-code' as const,
  model: 'sonnet',
  effort: '',
  cases: [CASE],
  again: false,
  parallel: 1,
  jev: null as JevAsker | null,
  inline: false,
  log: () => {},
  signal: new AbortController().signal,
  ...over,
})

/** The letters on a sheet, in order. */
const lettersIn = (sheet: string): string[] =>
  [...sheet.matchAll(/^- ([A-Z]): /gm)].map((m) => m[1])

/** The answer whose email holds `word`, by letter, and the one that does not. */
function split(dir: string, word: string): { has: string[]; lacks: string[] } {
  const letters = lettersIn(readFileSync(join(dir, 'sheet.md'), 'utf8'))
  const text = (l: string) => readFileSync(join(dir, l, 'outputs/email.txt'), 'utf8')
  return {
    has: letters.filter((l) => text(l).includes(word)),
    lacks: letters.filter((l) => !text(l).includes(word)),
  }
}

/** A proposal on the brief's free note, quoted from the brief, every answer meeting it. */
const free = (dir: string, over: Record<string, unknown> = {}) => ({
  check: 'The email says the update costs nothing for anyone on a paid plan.',
  why: 'A reader on a paid plan wants to know whether to pay.',
  scope: 'case',
  basis_file: 'inputs/brief.md',
  basis_quote: 'The update is free for everyone on a paid plan.',
  answer: '',
  fault_file: '',
  fault_quote: '',
  meets: lettersIn(readFileSync(join(dir, 'sheet.md'), 'utf8')).map((l) => ({
    answer: l,
    meets: 'yes',
  })),
  ...over,
})

/** A proposal on the codename, quoted from an answer that names it. */
function codename(dir: string, over: Record<string, unknown> = {}) {
  const { has, lacks } = split(dir, 'Falcon')
  return {
    check: 'The email never names the codename Falcon.',
    why: 'The brief keeps the codename for the team alone.',
    scope: 'case',
    basis_file: 'inputs/brief.md',
    basis_quote: 'must not appear in anything we publish',
    answer: has[0] ?? '',
    fault_file: has[0] ? `${has[0]}/outputs/email.txt` : '',
    fault_quote: has[0] ? 'Falcon' : '',
    meets: [
      ...has.map((l) => ({ answer: l, meets: 'no' })),
      ...lacks.map((l) => ({ answer: l, meets: 'yes' })),
    ],
    ...over,
  }
}

const reply = (...proposals: unknown[]) => JSON.stringify({ proposals })

beforeEach(() => {
  session.requests = []
  session.sheets = []
  session.skillSeen = []
  session.messages = []
  session.systems = []
  session.reply = () => reply()
})

describe('the answers read', () => {
  it('reads the latest answer of each version and the one without the skill, and no part of the skill', async () => {
    const dir = skill()
    const testCase = loadCases(dir).find((c) => c.id === CASE)
    if (!testCase) throw new Error('no case')
    const answers = answersFor(dir, testCase).map((a) => a.ref.run)
    expect(answers).toEqual([
      '2026-11-20-skill-v0-claude-sonnet-without-skill',
      '2026-11-20-skill-v1-claude-haiku',
      '2026-11-20-skill-v0-claude-haiku',
    ])
    const result = await proposeChecks(dir, options())
    expect(result.cases[0].answers.map((a) => a.letter)).toEqual(['A', 'B', 'C'])
    expect(session.skillSeen).toEqual([false])
    expect(session.requests[0].system).not.toContain('Never use the word users')
  })

  it('passes over a run that answered the case as it once asked', async () => {
    const dir = skill()
    const prompt = join(dir, 'evals/cases', CASE, 'prompt.md')
    writeFileSync(prompt, `${readFileSync(prompt, 'utf8')}\nKeep it short.\n`)
    const result = await proposeChecks(dir, options())
    expect(result.cases[0].skipped).toContain('No run has an answer')
    expect(session.requests).toHaveLength(0)
  })
})

describe('in one message', () => {
  it("sends the room's files in one message, with no tools and nothing of the skill, and keeps what it proposes", async () => {
    const dir = skill()
    session.reply = () => {
      const message = session.messages.at(-1) ?? ''
      return reply({
        check: 'The email says the update costs nothing for anyone on a paid plan.',
        why: 'A reader on a paid plan wants to know whether to pay.',
        scope: 'case',
        basis_file: 'inputs/brief.md',
        basis_quote: 'The update is free for everyone on a paid plan.',
        answer: '',
        fault_file: '',
        fault_quote: '',
        meets: lettersIn(message).map((l) => ({ answer: l, meets: 'yes' })),
      })
    }
    const result = await proposeChecks(dir, options({ inline: true }))
    expect(session.requests).toEqual([])
    expect(session.messages).toHaveLength(1)
    const [message] = session.messages
    // What was asked comes first, then the answers; a page's picture is never sent.
    const paths = [...message.matchAll(/<file path="([^"]+)">/g)].map((m) => m[1])
    expect(paths.slice(0, 2)).toEqual(['sheet.md', 'request.md'])
    expect(paths).toContain('inputs/brief.md')
    expect(paths.some((path) => /^[A-Z]\/outputs\/email\.txt$/.test(path))).toBe(true)
    expect(paths.some((path) => path.endsWith('.png'))).toBe(false)
    expect(message).not.toContain('name: launch-note')
    expect(session.systems[0]).toContain('The message holds one request')
    expect(session.systems[0]).not.toContain('You can only read files in this folder')
    expect(result.cases[0].proposals.map((p) => p.check)).toEqual([
      'The email says the update costs nothing for anyone on a paid plan.',
    ])
  })
})

describe('proposing', () => {
  it('keeps a proposal with where it was seen and which answers meet it', async () => {
    const dir = skill()
    const email = join(
      dir,
      'evals/runs/2026-11-20-skill-v0-claude-haiku',
      `${CASE}-s1/outputs/email.txt`,
    )
    writeFileSync(email, `${readFileSync(email, 'utf8')}\nBuilt under the name Falcon.\n`)
    session.reply = (request) => reply(codename(request.dir), free(request.dir))
    const result = await proposeChecks(dir, options())
    const [first, second] = result.cases[0].proposals
    expect(first.check).toBe('The email never names the codename Falcon.')
    expect(first.scope).toBe('case')
    expect(first.basis).toEqual({
      in: 'input',
      file: 'brief.md',
      quote: 'must not appear in anything we publish',
    })
    expect(first.fault).toEqual({ file: 'outputs/email.txt', quote: 'Falcon' })
    expect(first.shownBy?.run).toBe('2026-11-20-skill-v0-claude-haiku')
    expect(first.answers).toHaveLength(3)
    expect(second.shownBy).toBeNull()
    expect(second.tells).toBe('all meet')
    expect(readProposals(dir).proposals.map((p) => p.state)).toEqual(['proposed', 'proposed'])
  })

  it('asks again for a proposal that does not fit, with what was wrong, and keeps nothing it refused twice', async () => {
    const dir = skill()
    session.reply = (request, turn) =>
      turn === 1
        ? reply(
            free(request.dir),
            codename(request.dir, { basis_quote: 'the codename Hawk' }),
            free(request.dir, { check: 'The email gives the date, 18 May 2027.', basis_quote: '' }),
          )
        : reply(codename(request.dir), free(request.dir, { check: 'The date.', basis_quote: '' }))
    const result = await proposeChecks(dir, options())
    expect(session.requests).toHaveLength(2)
    expect(session.requests[1].prompt).toContain(
      '- proposal 2: basis_quote: "the codename Hawk" is not in',
    )
    expect(session.requests[1].prompt).toContain('- proposal 3: basis_quote: is empty')
    const c = result.cases[0]
    expect(c.refusedOnce).toBe(2)
    expect(c.refusedTwice).toBe(1)
    expect(c.proposals.map((p) => p.check)).toEqual([
      'The email says the update costs nothing for anyone on a paid plan.',
      'The email never names the codename Falcon.',
    ])
    expect(readProposals(dir).reads[0].refused).toHaveLength(3)
  })

  it('stores nothing when the reply does not fit twice', async () => {
    const dir = skill()
    session.reply = () => 'not json'
    const result = await proposeChecks(dir, options())
    expect(result.cases[0].error).toContain('did not fit twice')
    expect(readProposals(dir)).toEqual({ proposals: [], reads: [], every: [], asked: [] })
  })

  it('leaves out what a check of the case says, and a second of the same', async () => {
    const dir = skill()
    session.reply = (request) =>
      reply(
        free(request.dir, { check: 'The email gives the support address, help@ferry.example' }),
        codename(request.dir),
        codename(request.dir, { check: 'the email never names the codename "Falcon"' }),
      )
    const result = await proposeChecks(dir, options())
    expect(result.cases[0].proposals.map((p) => p.check)).toEqual([
      'The email never names the codename Falcon.',
    ])
    expect(result.cases[0].left.map((l) => l.why)).toEqual(['same as a check', 'said twice'])
  })
})

describe('checks for every case', () => {
  it('shows them beside the case’s own, and leaves out a proposal that says one again', async () => {
    const dir = skill()
    mkdirSync(join(dir, 'evals/graders'), { recursive: true })
    writeFileSync(
      join(dir, 'evals/graders/01-codename.md'),
      '---\n---\n\nThe email never names the codename Falcon.\n',
    )
    let checks = ''
    session.reply = (request) => {
      checks = readFileSync(join(request.dir, 'checks.md'), 'utf8')
      return reply(codename(request.dir))
    }
    const result = await proposeChecks(dir, options())
    expect(checks).toContain(
      '- C3: The email never names the codename Falcon. (asked of every request of this kind)',
    )
    expect(result.cases[0].proposals).toEqual([])
    expect(result.cases[0].left).toEqual([
      { check: 'The email never names the codename Falcon.', why: 'same as a check' },
    ])
  })
})

describe('when a case is read again', () => {
  it('reads nothing again while nothing changed, and again when the note or an answer changes', async () => {
    const dir = skill()
    session.reply = (request) => reply(codename(request.dir))
    await proposeChecks(dir, options())
    const again = await proposeChecks(dir, options())
    expect(session.requests).toHaveLength(1)
    expect(again.cases[0].kept).toBe(true)
    expect(again.cases[0].proposals).toHaveLength(1)

    const yaml = join(dir, 'evals/cases', CASE, 'case.yaml')
    writeFileSync(
      yaml,
      readFileSync(yaml, 'utf8').replace('names no price', 'names no price at all'),
    )
    const noted = await proposeChecks(dir, options())
    expect(session.requests).toHaveLength(2)
    expect(noted.cases[0].kept).toBe(false)

    const email = join(
      dir,
      'evals/runs/2026-11-20-skill-v1-claude-haiku',
      `${CASE}-s1/outputs/email.txt`,
    )
    writeFileSync(email, `${readFileSync(email, 'utf8')}\nOne more line.\n`)
    await proposeChecks(dir, options())
    expect(session.requests).toHaveLength(3)
    // A new reading replaces the proposals still proposed: one of each, never two.
    expect(readProposals(dir).proposals).toHaveLength(1)
  })

  it('asks again with --again', async () => {
    const dir = skill()
    await proposeChecks(dir, options())
    await proposeChecks(dir, options({ again: true }))
    expect(session.requests).toHaveLength(2)
  })

  it('leaves a request change unread, with its old proposals out of date', async () => {
    const dir = skill()
    session.reply = (request) => reply(codename(request.dir))
    await proposeChecks(dir, options())
    const prompt = join(dir, 'evals/cases', CASE, 'prompt.md')
    writeFileSync(prompt, `${readFileSync(prompt, 'utf8')}\nKeep it short.\n`)
    const result = await proposeChecks(dir, options())
    expect(result.cases[0].proposals).toEqual([])
    expect(session.requests).toHaveLength(1)
  })
})

describe('accepting and dropping', () => {
  it('adds an accepted one to the case through the case writer', async () => {
    const dir = skill()
    session.reply = (request) => reply(codename(request.dir), free(request.dir))
    const [codenameOne] = (await proposeChecks(dir, options())).cases[0].proposals
    const { added } = acceptProposals(dir, CASE, [codenameOne.id])
    expect(added.map((p) => p.check)).toEqual(['The email never names the codename Falcon.'])
    const testCase = loadCases(dir).find((c) => c.id === CASE)
    expect(testCase?.graders.map((g) => g.statement)).toEqual([
      'The email says the update is free for everyone on a paid plan.',
      'The email gives the support address, help@ferry.example.',
      'The email never names the codename Falcon.',
    ])
    const stored = readProposals(dir).proposals.find((p) => p.id === codenameOne.id)
    expect(stored).toMatchObject({ state: 'accepted', scope: 'case' })
    expect(stored?.decidedAt).toBeTruthy()
    expect(() => acceptProposals(dir, CASE, [codenameOne.id])).toThrow('accepted already')
    expect(() => acceptProposals(dir, CASE, ['nothere'])).toThrow('No proposal nothere')
  })

  it('keeps a dropped one dropped: shown as turned down, and left out when proposed again', async () => {
    const dir = skill()
    session.reply = (request) => reply(codename(request.dir))
    const [one] = (await proposeChecks(dir, options())).cases[0].proposals
    dropProposals(dir, CASE, [one.id])
    const again = await proposeChecks(dir, options({ again: true }))
    expect(session.sheets[1]).toContain('- The email never names the codename Falcon.')
    expect(again.cases[0].proposals).toEqual([])
    expect(again.cases[0].left).toEqual([
      { check: 'The email never names the codename Falcon.', why: 'turned down' },
    ])
    expect(readProposals(dir).proposals.map((p) => p.state)).toEqual(['dropped'])
    expect(() => dropProposals(dir, CASE, [one.id])).toThrow('dropped already')
  })

  it('proposes again one that was turned down, with no time of decision', async () => {
    const dir = skill()
    session.reply = (request) => reply(codename(request.dir))
    const [one] = (await proposeChecks(dir, options())).cases[0].proposals
    expect(() => restoreProposals(dir, CASE, [one.id])).toThrow('proposed already')
    dropProposals(dir, CASE, [one.id])
    restoreProposals(dir, CASE, [one.id])
    const [stored] = readProposals(dir).proposals
    expect(stored?.state).toBe('proposed')
    expect(stored?.decidedAt).toBeUndefined()
    dropProposals(dir, CASE, [one.id])
    expect(readProposals(dir).proposals.map((p) => p.state)).toEqual(['dropped'])
  })
})

// ---------------------------------------------------------------- with Jev

/** What the fake Jev was asked, counted. */
const jevCount = { requests: 0, questions: 0 }

/**
 * A Jev that answers by the words of each question: `same` for two checks
 * (by their words, in either order), `fair` for a check on its basis. Each
 * question is asked both ways round, so the other way is answered with the
 * opposite.
 */
function fakeJev(says: {
  same?: (a: string, b: string) => number
  fair?: (check: string) => number
}): JevAsker {
  // The checks' own words, not the words each stands on.
  const quoted = (text: string) =>
    [...text.matchAll(/(the words )?"([^"]+)"/g)].filter((m) => !m[1]).map((m) => m[2])
  return {
    model: 'jev-test',
    ask: (async (_state: unknown, questions: Record<string, { instructions?: unknown }>) => {
      jevCount.requests += 1
      const entries = Object.entries(questions)
      jevCount.questions += entries.length
      return Object.fromEntries(
        entries.map(([name, q]) => {
          const text = String(q.instructions)
          const [a, b] = quoted(text)
          const answer = text.startsWith('Do these two checks')
            ? (says.same?.(a, b) ?? 0.5)
            : text.startsWith('Could one answer')
              ? 1 - (says.same?.(a, b) ?? 0.5)
              : text.includes('Is every value')
                ? (says.fair?.(a) ?? 0.9)
                : 1 - (says.fair?.(a) ?? 0.9)
          return [name, { noul: answer }]
        }),
      )
    }) as unknown as JevAsker['ask'],
  }
}

/** The case a room is for, by the version its brief gives. */
const VERSIONS: Record<string, string> = {
  '3.2': 'email-price',
  '3.3': 'email-free',
  '3.4': 'email-quote',
  '3.5': 'email-crowded',
}
const caseOf = (dir: string): string =>
  VERSIONS[/Version: (\S+)/.exec(readFileSync(join(dir, 'inputs/brief.md'), 'utf8'))?.[1] ?? '']

/** The codename proposed for every case, in the words `check` gives. */
const everyCodename = (dir: string, check: string) =>
  codename(dir, {
    check,
    scope: 'every case',
    basis_quote: 'The codename Falcon must not appear in anything we publish.',
  })

const TWO = ['email-free', 'email-price']
const SAME_THING = (a: string, b: string) => ([a, b].every((x) => /Falcon/.test(x)) ? 0.95 : 0.05)

beforeEach(() => {
  jevCount.requests = 0
  jevCount.questions = 0
})

describe('the proposals as a screen lists them', () => {
  it("lists one for every case first and once, then each case's own, with the answers by their keys", async () => {
    const dir = skill()
    session.reply = (request) =>
      reply(
        codename(request.dir, {
          check: 'The answer never names the codename Falcon.',
          basis_quote: 'The codename Falcon must not appear in anything we publish.',
        }),
        ...(caseOf(request.dir) === CASE ? [free(request.dir)] : []),
      )
    const result = await proposeChecks(dir, options({ cases: TWO }))
    const [every] = result.every
    const listed = proposedChecks(dir)
    expect(listed.map((p) => [p.case, p.check])).toEqual([
      [null, 'The answer never names the codename Falcon.'],
      [CASE, 'The email says the update costs nothing for anyone on a paid plan.'],
    ])
    expect(listed[0]).toMatchObject({
      id: every.id,
      cases: ['email-free', 'email-price'],
      tells: every.tells,
      state: 'proposed',
      basis: {
        in: 'input',
        file: 'brief.md',
        quote: 'The codename Falcon must not appear in anything we publish.',
      },
    })
    // Every member's answers, each named as the app names an output.
    const read = every.made.flatMap((p) => p.answers.map((a) => `${a.run}/${a.sample}`))
    expect(listed[0].answers.map((a) => a.key)).toEqual(read)
    const shownBy = every.made.find((p) => p.shownBy)?.shownBy
    expect(listed[0].fault).toEqual(
      shownBy
        ? { key: `${shownBy.run}/${shownBy.sample}`, file: 'outputs/email.txt', quote: 'Falcon' }
        : null,
    )
    expect(listed[1]).toMatchObject({ cases: [], fault: null, tells: 'all meet' })

    acceptEveryCase(dir, [every.id])
    dropProposals(dir, CASE, [listed[1].id])
    expect(proposedChecks(dir).map((p) => p.state)).toEqual(['accepted', 'dropped'])
  })

  it('lists nothing for a skill never read', () => {
    expect(proposedChecks(skill())).toEqual([])
  })
})

describe('one proposal for every case', () => {
  it('joins proposals of two cases whatever scope they were given, each case\'s name for its answer read as "The answer"', async () => {
    const dir = skill()
    session.reply = (request) =>
      reply(
        codename(request.dir, {
          check:
            caseOf(request.dir) === 'email-free'
              ? 'The email never names the codename Falcon.'
              : 'The answer never names the codename Falcon.',
          basis_quote: 'The codename Falcon must not appear in anything we publish.',
        }),
      )
    const result = await proposeChecks(dir, options({ cases: TWO }))
    expect(result.every.map((e) => [e.check, e.cases])).toEqual([
      ['The answer never names the codename Falcon.', ['email-free', 'email-price']],
    ])
    expect(result.every[0].made.map((p) => p.scope)).toEqual(['case', 'case'])
  })

  it('joins proposals of two cases in other words when Jev is sure they ask the same', async () => {
    const dir = skill()
    session.reply = (request) =>
      reply(
        everyCodename(
          request.dir,
          caseOf(request.dir) === 'email-free'
            ? 'The answer never names the codename Falcon.'
            : 'The answer leaves out the codename Falcon.',
        ),
      )
    const result = await proposeChecks(
      dir,
      options({ cases: TWO, jev: fakeJev({ same: SAME_THING }) }),
    )
    expect(result.every).toHaveLength(1)
    expect(result.every[0].cases).toEqual(['email-free', 'email-price'])
    expect(result.every[0].members).toHaveLength(2)
    expect(result.joining.nearer).toBe(true)
    expect(result.joining.pairs).toHaveLength(1)
    expect(result.joining.pairs[0]).toMatchObject({
      a: 'The answer never names the codename Falcon.',
      b: 'The answer leaves out the codename Falcon.',
      same: 0.95,
      joined: true,
    })
    expect(result.joining.pairs[0].differ).toBeCloseTo(0.05)
    // Neither case lists it as its own.
    expect(result.cases.flatMap((c) => c.proposals)).toEqual([])
    expect(readProposals(dir).every.map((e) => e.state)).toEqual(['proposed'])
  })

  it('keeps them apart when Jev is not sure, or sure they differ', async () => {
    for (const same of [0.5, 0.1]) {
      const dir = skill()
      session.reply = (request) =>
        reply(
          everyCodename(
            request.dir,
            caseOf(request.dir) === 'email-free'
              ? 'The answer never names the codename Falcon.'
              : 'The answer does not contain the word Falcon.',
          ),
        )
      const result = await proposeChecks(
        dir,
        options({ cases: TWO, jev: fakeJev({ same: () => same }) }),
      )
      // Each seen on one case alone stays that case's.
      expect(result.every).toEqual([])
      expect(result.cases.map((c) => c.proposals.length)).toEqual([1, 1])
      expect(result.joining.pairs[0].joined).toBe(false)
    }
  })

  it('joins only proposals in the same words without Jev, and says nearer ones were not looked for', async () => {
    const dir = skill()
    session.reply = (request) =>
      reply(
        everyCodename(
          request.dir,
          caseOf(request.dir) === 'email-free'
            ? 'The answer never names the codename "Falcon".'
            : 'the answer never names the codename Falcon',
        ),
        free(request.dir, {
          scope: 'every case',
          ...(caseOf(request.dir) === 'email-free'
            ? { check: 'The answer says what the update costs.' }
            : {
                check: 'The answer gives what the update costs.',
                basis_quote: 'Price: 12 USD a month',
              }),
        }),
      )
    const result = await proposeChecks(dir, options({ cases: TWO }))
    expect(result.jevAsked).toBe(false)
    expect(result.joining.nearer).toBe(false)
    expect(result.every.map((e) => [e.check, e.cases])).toEqual([
      ['The answer never names the codename "Falcon".', ['email-free', 'email-price']],
    ])
    expect(result.cases.map((c) => c.proposals.map((p) => p.check))).toEqual([
      ['The answer says what the update costs.'],
      ['The answer gives what the update costs.'],
    ])
    expect(jevCount.requests).toBe(0)
  })

  it('leaves out one a check for every case says already in other words', async () => {
    const dir = skill()
    mkdirSync(join(dir, 'evals/graders'), { recursive: true })
    writeFileSync(
      join(dir, 'evals/graders/01-codename.md'),
      '---\n---\n\nThe answer does not name the internal codename.\n',
    )
    session.reply = (request) =>
      reply(everyCodename(request.dir, 'The answer never names the codename Falcon.'))
    const result = await proposeChecks(
      dir,
      options({ cases: TWO, jev: fakeJev({ same: () => 0.9 }) }),
    )
    expect(result.every).toEqual([])
    expect(result.joining.left).toEqual([
      {
        check: 'The answer never names the codename Falcon.',
        cases: ['email-free', 'email-price'],
        like: 'The answer does not name the internal codename.',
      },
    ])
  })

  it('writes one check for every case when accepted, and changes no case', async () => {
    const dir = skill()
    session.reply = (request) =>
      reply(everyCodename(request.dir, 'The answer never names the codename Falcon.'))
    const before = loadCases(dir).map((c) => c.graders.map((g) => g.statement))
    const [one] = (await proposeChecks(dir, options({ cases: TWO }))).every
    expect(() => acceptProposals(dir, 'email-free', [one.members[0].id])).toThrow(
      `Name ${one.id} without --case`,
    )
    const { added } = acceptEveryCase(dir, [one.id])
    expect(added.map((a) => a.grader)).toEqual(['every/01-the-answer-never-names-the-coden'])
    expect(loadEveryCase(dir).map((g) => g.statement)).toEqual([
      'The answer never names the codename Falcon.',
    ])
    expect(loadCases(dir).map((c) => c.graders.map((g) => g.statement))).toEqual(before)
    const file = readProposals(dir)
    expect(file.every[0].state).toBe('accepted')
    expect(file.proposals.map((p) => p.state)).toEqual(['accepted', 'accepted'])
    expect(() => acceptEveryCase(dir, [one.id])).toThrow('accepted already')

    // Read again: the new check is the case's, so the same words are left out, and nothing comes back.
    const again = await proposeChecks(dir, options({ cases: TWO, again: true }))
    expect(again.every).toEqual([])
    expect(again.cases[0].left).toEqual([
      { check: 'The answer never names the codename Falcon.', why: 'same as a check' },
    ])
  })

  it('turns one down for every case, with the proposals it is made of', async () => {
    const dir = skill()
    session.reply = (request) =>
      reply(everyCodename(request.dir, 'The answer never names the codename Falcon.'))
    const [one] = (await proposeChecks(dir, options({ cases: TWO }))).every
    dropEveryCase(dir, [one.id])
    expect(readProposals(dir).proposals.map((p) => p.state)).toEqual(['dropped', 'dropped'])
    const again = await proposeChecks(dir, options({ cases: TWO, again: true }))
    expect(again.every).toEqual([])
    expect(loadEveryCase(dir)).toEqual([])
  })

  it('proposes again one for every case that was turned down, with the proposals it is made of', async () => {
    const dir = skill()
    session.reply = (request) =>
      reply(everyCodename(request.dir, 'The answer never names the codename Falcon.'))
    const [one] = (await proposeChecks(dir, options({ cases: TWO }))).every
    dropEveryCase(dir, [one.id])
    restoreEveryCase(dir, [one.id])
    const file = readProposals(dir)
    expect(file.every.map((e) => [e.state, e.decidedAt])).toEqual([['proposed', undefined]])
    expect(file.proposals.map((p) => p.state)).toEqual(['proposed', 'proposed'])
    expect(() => restoreEveryCase(dir, [one.id])).toThrow('proposed already')
  })
})

describe('a check asks no more than its words', () => {
  const FAIR = 'The email says the update costs nothing for anyone on a paid plan.'
  const MORE = 'The email says the update costs nothing for anyone on a paid plan before June.'

  it('leaves out one Jev is sure asks more, stores it as not proposed, and keeps one it is not sure of', async () => {
    const dir = skill()
    const unsure = 'The email says the update is free for paid plans.'
    session.reply = (request) =>
      reply(
        free(request.dir),
        free(request.dir, { check: MORE }),
        free(request.dir, { check: unsure }),
      )
    const result = await proposeChecks(
      dir,
      options({
        jev: fakeJev({ fair: (check) => (check === MORE ? 0.1 : check === unsure ? 0.5 : 0.9) }),
      }),
    )
    const c = result.cases[0]
    expect(c.basisChecked).toBe(true)
    expect(c.proposals.map((p) => [p.check, p.basisCheck?.reading])).toEqual([
      [FAIR, 'yes'],
      [unsure, 'not sure'],
    ])
    expect(c.overreach).toEqual([
      expect.objectContaining({
        check: MORE,
        basis: {
          in: 'input',
          file: 'brief.md',
          quote: 'The update is free for everyone on a paid plan.',
        },
        basisCheck: { forward: 0.1, inverse: 0.9, reading: 'no' },
      }),
    ])
    expect(readProposals(dir).proposals.map((p) => p.check)).toEqual([FAIR, unsure])
    // One request for the case, each proposal asked both ways round.
    expect(jevCount).toEqual({ requests: 1, questions: 6 })
  })

  it('reads the whole line a quote stands in', async () => {
    const dir = skill()
    let asked = ''
    session.reply = (request) => reply(free(request.dir, { basis_quote: 'free for everyone' }))
    const jev = fakeJev({})
    const ask = jev.ask
    jev.ask = (async (state: unknown, questions: Record<string, { instructions?: unknown }>) => {
      asked = String(Object.values(questions)[0].instructions)
      return (ask as unknown as (s: unknown, q: unknown) => Promise<unknown>)(state, questions)
    }) as unknown as JevAsker['ask']
    await proposeChecks(dir, options({ jev }))
    expect(asked).toContain('"Note: The update is free for everyone on a paid plan."')
  })

  it('skips the step without Jev, and says so', async () => {
    const dir = skill()
    session.reply = (request) => reply(free(request.dir, { check: MORE }))
    const result = await proposeChecks(dir, options())
    expect(result.cases[0].basisChecked).toBe(false)
    expect(result.cases[0].proposals[0].basisCheck).toBeNull()
  })
})

describe('every fact of the note', () => {
  it('names what covers each fact, and shows one nothing covers', async () => {
    const dir = skill()
    session.reply = (request) =>
      JSON.stringify({
        proposals: [
          free(request.dir, { basis_file: 'note.md', basis_quote: 'says the update is free' }),
        ],
        note_facts: [
          {
            quote: 'outputs/email.txt',
            covered_by: '',
            why_not: 'It says where the file is saved.',
          },
          { quote: 'a short plain-text email', covered_by: '', why_not: '' },
          { quote: 'says the update is free', covered_by: 'P1', why_not: '' },
          { quote: 'names no price', covered_by: 'C9', why_not: '' },
        ],
      })
    const c = (await proposeChecks(dir, options())).cases[0]
    const [kept] = c.proposals
    expect(c.facts).toEqual([
      {
        fact: 'outputs/email.txt',
        by: 'reason',
        check: null,
        proposal: null,
        why: 'It says where the file is saved.',
      },
      { fact: 'a short plain-text email', by: 'nothing', check: null, proposal: null, why: '' },
      {
        fact: 'says the update is free',
        by: 'proposal',
        check: kept.check,
        proposal: kept.id,
        why: '',
      },
    ])
    // C9 is no check of the case, so that fact is not taken, and its words show as unlisted.
    expect(readProposals(dir).reads[0].factsRefused).toEqual([
      '"names no price": C9 is not a check in checks.md',
    ])
    expect(c.unlisted).toEqual(['names no price'])
  })

  it('says a fact is not covered when the proposal it names was left out', async () => {
    const dir = skill()
    session.reply = (request) =>
      JSON.stringify({
        proposals: [
          free(request.dir, { basis_file: 'note.md', basis_quote: 'says the update is free' }),
        ],
        note_facts: [{ quote: 'says the update is free', covered_by: 'P1', why_not: '' }],
      })
    const c = (await proposeChecks(dir, options({ jev: fakeJev({ fair: () => 0.1 }) }))).cases[0]
    expect(c.proposals).toEqual([])
    expect(c.facts).toEqual([
      {
        fact: 'says the update is free',
        by: 'nothing',
        check: null,
        proposal: null,
        why: 'Its proposal asked for more than its words, so it was left out.',
      },
    ])
  })
})

describe('the same answer twice', () => {
  it('makes no call of the assistant or of Jev when nothing changed', async () => {
    const dir = skill()
    session.reply = (request) =>
      caseOf(request.dir) === 'email-free'
        ? reply(
            everyCodename(request.dir, 'The answer never names the codename Falcon.'),
            free(request.dir),
          )
        : reply(everyCodename(request.dir, 'The answer leaves out the codename Falcon.'))
    const jev = fakeJev({ same: SAME_THING })
    await proposeChecks(dir, options({ cases: TWO, jev }))
    const first = { ...jevCount }
    expect(session.requests).toHaveLength(2)
    const again = await proposeChecks(dir, options({ cases: TWO, jev }))
    expect(session.requests).toHaveLength(2)
    expect(jevCount).toEqual(first)
    expect(again.jev.requests).toBe(0)
    expect(again.every).toHaveLength(1)
    expect(again.cases.every((c) => c.kept)).toBe(true)
  })

  it('shows a new reading the proposals made before, and what was left out for asking more', async () => {
    const dir = skill()
    const MORE = 'The email says the update costs nothing until June.'
    session.reply = (request) => reply(free(request.dir), free(request.dir, { check: MORE }))
    await proposeChecks(dir, options({ jev: fakeJev({ fair: (c) => (c === MORE ? 0.1 : 0.9) }) }))
    let earlier = ''
    session.reply = (request) => {
      earlier = readFileSync(join(request.dir, 'earlier.md'), 'utf8')
      return reply(free(request.dir))
    }
    await proposeChecks(dir, options({ again: true }))
    expect(earlier).toContain('# Proposed before')
    expect(earlier).toContain(
      '- The email says the update costs nothing for anyone on a paid plan.',
    )
    expect(earlier).toContain(
      'basis: inputs/brief.md, "The update is free for everyone on a paid plan."',
    )
    expect(earlier).toContain(`# Left out before\n\nEach asked for more than its words do.`)
    expect(earlier).toContain(`- ${MORE}`)
  })

  it('holds no earlier.md on a first reading', async () => {
    const dir = skill()
    let seen = true
    session.reply = (request) => {
      seen = existsSync(join(request.dir, 'earlier.md'))
      return reply()
    }
    await proposeChecks(dir, options())
    expect(seen).toBe(false)
  })
})
