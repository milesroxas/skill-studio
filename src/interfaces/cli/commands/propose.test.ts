/**
 * Whether an answer meets a proposed check, from grading: `st propose` asks
 * Jev, of each answer it read, what a grading asks once the check is
 * accepted, and Jev's sure word stands over the assistant's. The assistant
 * and Jev are stood in for, and so is the Jev the code builds itself (the
 * command's and a grading's), so what a grading asks can be held to what was
 * asked here, and what `st propose` prints can be read.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { AiFolderRequest } from '@infrastructure/ai/types.ts'
import { loadBench, loadCases } from '@infrastructure/cases.ts'
import type { StoredProposal } from '@infrastructure/proposals.ts'
import type { JevAsker } from '@judges/jev.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Values } from './command.ts'

/** One request to Jev: its state and its questions. */
type Asked = {
  state: Record<string, unknown>
  questions: Record<string, { instructions?: unknown }>
}

const session = vi.hoisted(() => ({
  reply: (_dir: string): string => '{"proposals":[]}',
  /** Sessions started, each a call of the assistant. */
  calls: 0,
}))
/**
 * The Jev the code builds itself, `st propose`'s and a grading's: what it was
 * asked, and how it answers a check a grading would put. Every other question
 * is answered as the words of a proposal asking for all of it, or not sure.
 */
const built = vi.hoisted(() => ({
  asked: [] as Asked[],
  meets: (_check: string, _state: Record<string, unknown>): number => 0.5,
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    readFolder: async (request: AiFolderRequest) => {
      session.calls += 1
      return {
        text: session.reply(request.dir),
        model: 'claude-test',
        usage: { input: 100, output: 10 },
      }
    },
  }),
  isProviderError: () => false,
}))
vi.mock('@infrastructure/ai/store.ts', () => ({ recordUsage: () => {} }))
vi.mock('@judges/jev.ts', async (original) => {
  const real = await original<typeof import('@judges/jev.ts')>()
  class Jev {
    readonly model = 'jev-test'
    inputTokens = 0
    calls = 0
    modelSeen: string | null = null
    static available = () => true
    async ask(state: Asked['state'], questions: Asked['questions']) {
      built.asked.push({ state, questions })
      return Object.fromEntries(
        Object.entries(questions).map(([name, q]) => {
          const text = String(q.instructions)
          const check = text.startsWith('Is this statement true of')
            ? (/: "([^"]+)"/.exec(text)?.[1] ?? null)
            : null
          const answer =
            check !== null ? built.meets(check, state) : text.includes('Is every value') ? 0.9 : 0.5
          return [name, { noul: answer }]
        }),
      )
    }
  }
  return { ...real, Jev }
})

const { acceptProposals, answersFor, proposeChecks, proposedChecks } = await import(
  '@application/proposing.ts'
)
const { drawnWhenGraded, gradeRun, gradingInput } = await import('@application/grade.ts')
const { genericPack, statementAnswers } = await import('@judges/generic/index.ts')
const { noteReplayed } = await import('@judges/replies.ts')
const { readProposals } = await import('@infrastructure/proposals.ts')
const { commandOf, OPTIONS } = await import('./index.ts')
const { contextOf } = await import('./shared.ts')

const FIXTURE = resolve(import.meta.dirname, '../../../../fixtures/launch-note')
const CASE = 'email-free'
const FAULTY = '2026-11-20-skill-v0-claude-haiku'
const CODENAME = 'The email never names the codename Falcon.'
const FREE = 'The email says the update costs nothing for anyone on a paid plan.'

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A copy of launch-note with its runs, in a folder of its own that goes with it. */
function skill(): string {
  const folder = mkdtempSync(join(tmpdir(), 'st-propose-meets-'))
  made.push(folder)
  const dir = join(folder, 'launch-note')
  cpSync(FIXTURE, dir, { recursive: true })
  return dir
}

/** The copy, with one answer to each case named naming the codename: the answer the fault is found in. */
function withFault(cases: readonly string[] = [CASE]): string {
  const dir = skill()
  for (const id of cases) {
    const email = join(dir, 'evals/runs', FAULTY, `${id}-s1/outputs/email.txt`)
    writeFileSync(email, `${readFileSync(email, 'utf8')}\nBuilt under the name Falcon.\n`)
  }
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

/** `st propose <dir> ...argv`, read as `st.ts` reads it, with what it printed. */
async function st(dir: string, ...argv: string[]): Promise<{ code: number; out: string }> {
  const { values, positionals } = parseArgs({
    args: ['propose', dir, ...argv],
    allowPositionals: true,
    options: OPTIONS,
  })
  const found = commandOf(positionals)
  if (found?.command.name !== 'propose') throw new Error('st propose was not found.')
  const lines: string[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
    lines.push(parts.join(' '))
  })
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const code = await found.command.run(contextOf(found.args, values as Values, null))
    return { code, out: lines.join('\n') }
  } finally {
    log.mockRestore()
    error.mockRestore()
  }
}

/** The letters on a room's sheet, in order. */
const lettersIn = (dir: string): string[] =>
  [...readFileSync(join(dir, 'sheet.md'), 'utf8').matchAll(/^- ([A-Z]): /gm)].map((m) => m[1])

const reply = (...proposals: unknown[]) => JSON.stringify({ proposals })

/** A proposal every answer meets, as the assistant reads them, standing on `quote` in `file`. */
const allMeet = (dir: string, check: string, file: string, quote: string) => ({
  check,
  why: 'A reader needs it.',
  scope: 'case',
  basis_file: file,
  basis_quote: quote,
  answer: '',
  fault_file: '',
  fault_quote: '',
  meets: lettersIn(dir).map((l) => ({ answer: l, meets: 'yes' })),
})

/** The codename proposal: the assistant says the answer that names it misses it, and the rest meet it. */
function codename(dir: string, over: Record<string, unknown> = {}) {
  const letters = lettersIn(dir)
  const names = (l: string) =>
    readFileSync(join(dir, l, 'outputs/email.txt'), 'utf8').includes('Falcon')
  const faulty = letters.find(names) ?? ''
  return {
    ...allMeet(
      dir,
      CODENAME,
      'inputs/brief.md',
      'The codename Falcon must not appear in anything we publish.',
    ),
    answer: faulty,
    fault_file: `${faulty}/outputs/email.txt`,
    fault_quote: 'Falcon',
    meets: letters.map((l) => ({ answer: l, meets: names(l) ? 'no' : 'yes' })),
    ...over,
  }
}

/** The check a question asks about, from its words, for one put as a grading puts a check. */
const statementOf = (text: string): string | null =>
  text.startsWith('Is this statement true of') ? (/: "([^"]+)"/.exec(text)?.[1] ?? null) : null

/** The requests among `asked` that held a check a grading would put. */
const checksIn = (asked: readonly Asked[]): Asked[] =>
  asked.filter((a) => Object.values(a.questions).some((q) => statementOf(String(q.instructions))))

/**
 * A Jev for `st propose`: `meets` answers each check a grading would put,
 * by the check and the state it is put of, and may throw; a proposal's words
 * always ask for all of it. Keeps each request, and the requests that held a check.
 */
function fakeJev(meets: (check: string, state: Asked['state']) => number) {
  const asked: Asked[] = []
  const jev: JevAsker = {
    model: 'jev-test',
    ask: (async (state: Asked['state'], questions: Asked['questions']) => {
      asked.push({ state, questions })
      return Object.fromEntries(
        Object.entries(questions).map(([name, q]) => {
          const text = String(q.instructions)
          const check = statementOf(text)
          const answer =
            check !== null ? meets(check, state) : text.includes('Is every value') ? 0.9 : 0.1
          return [name, { noul: answer }]
        }),
      )
    }) as unknown as JevAsker['ask'],
  }
  return { jev, asked, checked: () => checksIn(asked) }
}

const proposalOf = (proposals: readonly StoredProposal[], check: string): StoredProposal => {
  const found = proposals.find((p) => p.check === check)
  if (!found) throw new Error(`no proposal "${check}"`)
  return found
}

const answerOf = (p: StoredProposal, run: string) => {
  const found = p.answers.find((a) => a.run === run)
  if (!found) throw new Error(`no answer of ${run}`)
  return found
}

/** The answer whose output names the codename. */
const naming = (state: Asked['state']): boolean => String(state.output ?? '').includes('Falcon')

/** The line that says Jev is sure the answer the fault was found in meets a proposal. */
const FAULT_MET = 'Jev is sure it is met by'

beforeEach(() => {
  session.reply = () => reply()
  session.calls = 0
  built.asked = []
  built.meets = () => 0.5
})

describe("meets from grading: Jev's sure word on each answer", () => {
  it("replaces the assistant's word where Jev is sure, and keeps it where Jev is not", async () => {
    const dir = withFault()
    session.reply = (room) =>
      reply(
        codename(room),
        allMeet(room, FREE, 'inputs/brief.md', 'The update is free for everyone on a paid plan.'),
      )
    // Sure the answer the fault was found in meets the codename check, unsure of the rest;
    // sure that answer misses the other check, and sure the rest meet it.
    const { jev, checked } = fakeJev((check, state) =>
      check === CODENAME ? (naming(state) ? 0.9 : 0.5) : naming(state) ? 0.1 : 0.95,
    )
    const result = await proposeChecks(dir, options({ jev }))
    const { proposals, answers } = result.cases[0]
    const others = answers.map((a) => a.run).filter((run) => run !== FAULTY)
    expect(others).toHaveLength(2)

    const code = proposalOf(proposals, CODENAME)
    expect(code.shownBy?.run).toBe(FAULTY)
    expect(answerOf(code, FAULTY)).toMatchObject({ meets: 'yes', said: 'no', jev: 0.9 })
    for (const run of others) {
      expect(answerOf(code, run)).toMatchObject({ meets: 'yes', jev: 0.5 })
      expect(answerOf(code, run)).not.toHaveProperty('said')
    }
    expect(code.tells).toBe('all meet')

    const free = proposalOf(proposals, FREE)
    expect(answerOf(free, FAULTY)).toMatchObject({ meets: 'no', said: 'yes', jev: 0.1 })
    for (const run of others) {
      expect(answerOf(free, run)).toMatchObject({ meets: 'yes', jev: 0.95 })
      expect(answerOf(free, run)).not.toHaveProperty('said')
    }
    expect(free.tells).toBe('apart')

    // One request an answer read, both proposals in it.
    expect(checked().map((a) => Object.keys(a.questions).length)).toEqual([2, 2, 2])

    // Read again, every answer is kept: Jev is asked nothing.
    const again = await proposeChecks(dir, options({ jev, again: true }))
    expect(again.jev.requests).toBe(0)
    expect(answerOf(proposalOf(again.cases[0].proposals, CODENAME), FAULTY).meets).toBe('yes')
  })

  it("keeps Jev's word on each answer whose request did not fail, and the assistant's on the one that did", async () => {
    const dir = withFault()
    session.reply = (room) =>
      reply(
        codename(room),
        allMeet(room, FREE, 'inputs/brief.md', 'The update is free for everyone on a paid plan.'),
      )
    const { jev } = fakeJev((_check, state) => {
      if (naming(state)) throw new Error('Jev is down.')
      return 0.1
    })
    const result = await proposeChecks(dir, options({ jev }))
    const [read] = result.cases
    expect(read.error).toBeNull()
    expect(result.jev.error).toBe('Jev is down.')
    // Kept and shown, both of them.
    expect(read.proposals.map((p) => p.check)).toEqual([CODENAME, FREE])
    expect(readProposals(dir).proposals.map((p) => p.check)).toEqual([CODENAME, FREE])
    for (const p of read.proposals) {
      expect(answerOf(p, FAULTY)).not.toHaveProperty('jev')
      expect(answerOf(p, FAULTY)).not.toHaveProperty('said')
      for (const other of p.answers.filter((a) => a.run !== FAULTY))
        expect(other).toMatchObject({ meets: 'no', said: 'yes', jev: 0.1 })
    }
    expect(answerOf(proposalOf(read.proposals, CODENAME), FAULTY).meets).toBe('no')
    expect(answerOf(proposalOf(read.proposals, FREE), FAULTY).meets).toBe('yes')
  })

  it('asks of each answer what a grading of its run asks once the check is accepted', async () => {
    const dir = withFault()
    session.reply = (room) => reply(codename(room))
    const { jev, checked } = fakeJev(() => 0.5)
    const [code] = (await proposeChecks(dir, options({ jev }))).cases[0].proposals
    const asked = checked().find((a) => naming(a.state))
    if (!asked) throw new Error('the answer that names the codename was not asked')
    const [question] = Object.values(asked.questions)

    acceptProposals(dir, CASE, [code.id])
    await gradeRun(dir, FAULTY, { useJev: true })
    const same = built.asked.filter((a) =>
      Object.values(a.questions).some((q) => q.instructions === question.instructions),
    )
    expect(same).toHaveLength(1)
    expect(same[0].state).toEqual(asked.state)
    expect(Object.values(same[0].questions)).toContainEqual(question)
  })

  it("asks Jev nothing of an answer whose file to grade is a page, and keeps the assistant's word", async () => {
    const dir = skill()
    const CHECK = 'The page gives every change its number.'
    session.reply = (room) => reply(allMeet(room, CHECK, 'request.md', 'each with its number'))
    // Sure every answer misses it: a word that would stand, were it asked.
    const { jev, asked, checked } = fakeJev(() => 0.05)
    const [p] = (await proposeChecks(dir, options({ cases: ['page-long'], jev }))).cases[0]
      .proposals
    // Jev was asked of the proposal's words, and of no answer.
    expect(asked.length).toBeGreaterThan(0)
    expect(checked()).toEqual([])
    expect(p.answers).toHaveLength(3)
    for (const answer of p.answers) {
      expect(answer.meets).toBe('yes')
      expect(answer).not.toHaveProperty('jev')
      expect(answer).not.toHaveProperty('said')
    }
  })

  it("joins a long output's parts as a grading does: parts that differ settle nothing", async () => {
    const dir = skill()
    const testCase = loadCases(dir).find((c) => c.id === 'page-long')
    if (!testCase) throw new Error('no case')
    const page = (run: string) =>
      readFileSync(join(dir, 'evals/runs', run, 'page-long-s1/outputs/index.html'), 'utf8')
    const answers = answersFor(dir, testCase)
    const [both, split, neither] = answers.map((a) => a.ref.run)
    // Each run's answer on its first part and on its second.
    const parts: Record<string, [number, number]> = {
      [both]: [0.9, 0.95],
      [split]: [0.9, 0.1],
      [neither]: [0.1, 0.05],
    }
    const asked: Asked[] = []
    const ask = (async (state: Asked['state'], questions: Asked['questions']) => {
      asked.push({ state, questions })
      const output = String(state.output)
      const run = Object.keys(parts).find((r) => page(r).includes(output))
      if (!run) throw new Error('a part of no answer read')
      const noul = parts[run][page(run).startsWith(output) ? 0 : 1]
      return Object.fromEntries(Object.keys(questions).map((name) => [name, { noul }]))
    }) as unknown as Parameters<typeof statementAnswers>[2]
    const CHECK = 'The page gives every change its number.'
    const words: Array<Array<number | null> | null> = []
    for (const { ref, sample } of answers)
      words.push(
        await statementAnswers(
          gradingInput(dir, ref.run, sample),
          [CHECK],
          ask,
          loadBench(dir),
          () => {},
        ),
      )
    // Two parts an answer, each its own request: both sure, they join; apart, they settle nothing.
    expect(asked).toHaveLength(6)
    expect(words).toEqual([[0.9], [null], [0.1]])
  })

  it('goes room by room as a grading does: a room refused for its size is asked again with less, and said', async () => {
    const dir = skill()
    const testCase = loadCases(dir).find((c) => c.id === 'page-long')
    const [answer] = testCase ? answersFor(dir, testCase) : []
    if (!answer) throw new Error('no answer to page-long')
    const CHECK = 'The page gives every change its number.'
    // Jev refuses, as TypeSafe does for its size, any request with more than 8,000 characters of the
    // page: the first two rooms, so only the last is answered.
    const refusing = (asked: Asked[]) =>
      (async (state: Asked['state'], questions: Asked['questions']) => {
        if (String(state.output ?? '').length > 8000) throw new Error('max_tokens_exceeded')
        asked.push({ state, questions })
        return Object.fromEntries(Object.keys(questions).map((name) => [name, { noul: 0.5 }]))
      }) as unknown as JevAsker['ask']

    const proposing: Asked[] = []
    const said: string[] = []
    const input = gradingInput(dir, answer.ref.run, answer.sample)
    const ask = refusing(proposing) as unknown as Parameters<typeof statementAnswers>[2]
    await statementAnswers(input, [CHECK], ask, loadBench(dir), (line) => said.push(line))

    const grading: Asked[] = []
    const logged: string[] = []
    const graders = [
      ...(input.case?.graders ?? []),
      { id: 'proposed', type: 'llm', focus: null, statement: CHECK, weight: 1, image: null },
    ]
    await genericPack.judge(
      { ...input, case: input.case ? { ...input.case, graders } : null },
      {
        jev: { model: 'jev-test', ask: refusing(grading) },
        useJev: true,
        config: loadBench(dir),
        skillDir: dir,
        log: (line) => logged.push(line),
      },
    )
    const again = 'the output is more than Jev reads at once: asking again with less of it'
    expect(said).toEqual([again, again])
    expect(logged.filter((line) => line === again)).toEqual(said)
    // The same parts of the page, asked in the same order: the second room's last part, short
    // enough to be answered while the others were refused, then the four the last room asks.
    expect(proposing.map((a) => a.state)).toEqual(checksIn(grading).map((a) => a.state))
    expect(proposing).toHaveLength(5)
  })

  it('asks a request refused for its many questions in fewer, in the same room, as a grading does', async () => {
    const dir = skill()
    const testCase = loadCases(dir).find((c) => c.id === 'page-long')
    const [answer] = testCase ? answersFor(dir, testCase) : []
    if (!answer) throw new Error('no answer to page-long')
    const CHECKS = ['The page gives every change its number.', 'The page ends with the footer.']
    // Jev refuses, for its size, any request on the page that holds more than one question.
    const refusing = (asked: Asked[]) =>
      (async (state: Asked['state'], questions: Asked['questions']) => {
        if (state.output && Object.keys(questions).length > 1)
          throw new Error('max_tokens_exceeded')
        asked.push({ state, questions })
        return Object.fromEntries(Object.keys(questions).map((name) => [name, { noul: 0.5 }]))
      }) as unknown as JevAsker['ask']

    const proposing: Asked[] = []
    const said: string[] = []
    const input = gradingInput(dir, answer.ref.run, answer.sample)
    const ask = refusing(proposing) as unknown as Parameters<typeof statementAnswers>[2]
    await statementAnswers(input, CHECKS, ask, loadBench(dir), (line) => said.push(line))

    const grading: Asked[] = []
    const graders = [
      ...(input.case?.graders ?? []),
      ...CHECKS.map((statement, i) => ({
        id: `proposed-${i}`,
        type: 'llm',
        focus: null,
        statement,
        weight: 1,
        image: null,
      })),
    ]
    await genericPack.judge(
      { ...input, case: input.case ? { ...input.case, graders } : null },
      {
        jev: { model: 'jev-test', ask: refusing(grading) },
        useJev: true,
        config: loadBench(dir),
        skillDir: dir,
        log: () => {},
      },
    )
    const states = (asked: readonly Asked[]) => [
      ...new Set(asked.map((a) => JSON.stringify(a.state))),
    ]
    // The first room's two parts, each asked one question at a time: the rooms a grading asked in.
    expect(said).toEqual([
      '2 questions are more than one request holds: asking them in parts',
      '2 questions are more than one request holds: asking them in parts',
    ])
    expect(states(proposing)).toHaveLength(2)
    expect(states(proposing)).toEqual(states(checksIn(grading)))
  })

  it("asks Jev nothing of an answer with a picture beside it, as a grading would draw for it, and keeps the assistant's word", async () => {
    const dir = withFault()
    const sample = join(dir, 'evals/runs', FAULTY, `${CASE}-s1`)
    // A 1 by 1 PNG the agent left beside the email, and wrote as the run records it.
    const meta = join(dir, 'evals/runs', FAULTY, 'run.json')
    const run = JSON.parse(readFileSync(meta, 'utf8')) as {
      samples: Array<{ dir: string; outputs: string[] }>
    }
    for (const s of run.samples) if (s.dir === `${CASE}-s1`) s.outputs.push('outputs/screen.png')
    writeFileSync(meta, JSON.stringify(run, null, 2))
    writeFileSync(
      join(sample, 'outputs', 'screen.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      ),
    )
    session.reply = (room) => reply(codename(room))
    const { jev, checked } = fakeJev(() => 0.9)
    const [p] = (await proposeChecks(dir, options({ jev }))).cases[0].proposals
    expect(checked()).toHaveLength(2)
    expect(checked().some((a) => naming(a.state))).toBe(false)
    expect(answerOf(p, FAULTY)).toMatchObject({ meets: 'no' })
    expect(answerOf(p, FAULTY)).not.toHaveProperty('jev')
    for (const other of p.answers.filter((a) => a.run !== FAULTY))
      expect(other).toMatchObject({ meets: 'yes', jev: 0.9 })

    // A grading says so of the same answers: it would draw for the one with the picture alone.
    const testCase = loadCases(dir).find((c) => c.id === CASE)
    const answers = testCase ? answersFor(dir, testCase) : []
    const report = await gradeRun(dir, FAULTY, { useJev: true })
    for (const { ref, sample: graded } of answers.filter((a) => a.ref.run === FAULTY)) {
      const result = report.results.find((r) => r.sample === ref.sample)
      expect(drawnWhenGraded(gradingInput(dir, FAULTY, graded))).toBe(true)
      expect(result?.graded).toHaveProperty('drawn', false)
    }
    const other = report.results.find((r) => r.sample === 'email-price-s1')
    expect(other?.graded).not.toHaveProperty('drawn')
  })

  it('asks again, the next time, only the answer whose request failed, and the assistant nothing', async () => {
    const dir = withFault()
    session.reply = (room) =>
      reply(
        codename(room),
        allMeet(room, FREE, 'inputs/brief.md', 'The update is free for everyone on a paid plan.'),
      )
    const down = fakeJev((_check, state) => {
      if (naming(state)) throw new Error('Jev is down.')
      return 0.1
    })
    await proposeChecks(dir, options({ jev: down.jev }))
    expect(readProposals(dir).reads[0].unanswered).toEqual([`${FAULTY}/${CASE}-s1`])
    expect(session.calls).toBe(1)

    const up = fakeJev(() => 0.9)
    const result = await proposeChecks(dir, options({ jev: up.jev }))
    expect(session.calls).toBe(1)
    expect(result.cases[0].kept).toBe(true)
    // The one answer, both proposals in its one request.
    expect(up.checked()).toHaveLength(1)
    expect(naming(up.checked()[0].state)).toBe(true)
    expect(up.asked).toHaveLength(1)
    const code = proposalOf(result.cases[0].proposals, CODENAME)
    expect(answerOf(code, FAULTY)).toMatchObject({ meets: 'yes', said: 'no', jev: 0.9 })
    // Read again from the words that now stand: Jev's yes there, its sure no on the others.
    expect(code.tells).toBe('apart')
    const free = proposalOf(result.cases[0].proposals, FREE)
    expect(answerOf(free, FAULTY)).toMatchObject({ meets: 'yes', jev: 0.9 })
    // The answers asked the first time keep what Jev said then.
    for (const p of [code, free])
      for (const other of p.answers.filter((a) => a.run !== FAULTY))
        expect(other).toMatchObject({ meets: 'no', said: 'yes', jev: 0.1 })
    const stored = readProposals(dir)
    expect(stored.reads[0]).not.toHaveProperty('unanswered')
    expect(answerOf(proposalOf(stored.proposals, CODENAME), FAULTY)).toMatchObject({ jev: 0.9 })

    // Nothing left to ask: a third time asks nobody.
    const third = fakeJev(() => 0.5)
    await proposeChecks(dir, options({ jev: third.jev }))
    expect(third.asked).toEqual([])
    expect(session.calls).toBe(1)
  })

  it('keeps each different reason Jev could not be asked, once', async () => {
    const dir = withFault()
    session.reply = (room) => reply(codename(room))
    const reasons = ['Jev is down.', 'Jev took too long.', 'Jev is down.']
    let call = 0
    const { jev } = fakeJev(() => {
      throw new Error(reasons[call++ % reasons.length])
    })
    const result = await proposeChecks(dir, options({ jev }))
    expect(result.jev.error).toBe('Jev is down.; Jev took too long.')
    expect(readProposals(dir).reads[0].unanswered).toHaveLength(3)
  })

  it('leaves out `jev` where Jev was not asked: a case Jev does not judge, and an answer it can read nothing of', async () => {
    const judged = withFault()
    const yaml = join(judged, 'evals/cases', CASE, 'case.yaml')
    writeFileSync(yaml, `${readFileSync(yaml, 'utf8').trimEnd()}\nbench:\n  judge: false\n`)
    session.reply = (room) => reply(codename(room))
    const never = fakeJev(() => 0.9)
    const [p] = (await proposeChecks(judged, options({ jev: never.jev }))).cases[0].proposals
    expect(never.checked()).toEqual([])
    for (const answer of p.answers) expect(answer).not.toHaveProperty('jev')

    const dir = withFault()
    const blank = '2026-11-20-skill-v1-claude-haiku'
    writeFileSync(join(dir, 'evals/runs', blank, `${CASE}-s1/outputs/email.txt`), '  \n')
    const { jev, checked } = fakeJev(() => 0.9)
    const [q] = (await proposeChecks(dir, options({ jev }))).cases[0].proposals
    expect(checked()).toHaveLength(2)
    expect(answerOf(q, blank)).not.toHaveProperty('jev')
    for (const answer of q.answers.filter((a) => a.run !== blank))
      expect(answer).toHaveProperty('jev', 0.9)
  })
})

describe('the replies a replay read', () => {
  it('are noted in a folder made for them, and noting never fails the call', () => {
    const folder = mkdtempSync(join(tmpdir(), 'st-replayed-'))
    made.push(folder)
    const was = process.env.ST_AI_REPLAY_LOG
    const said = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const log = join(folder, 'not', 'yet', 'replayed.txt')
      process.env.ST_AI_REPLAY_LOG = log
      noteReplayed('jev/a.json#b')
      noteReplayed('claude-code/c.json')
      expect(readFileSync(log, 'utf8').split(/\r?\n/)).toEqual([
        'jev/a.json#b',
        'claude-code/c.json',
        '',
      ])
      expect(said).not.toHaveBeenCalled()

      // A file where its folder should be: it cannot be written, and that is said once.
      const file = join(folder, 'a-file')
      writeFileSync(file, '')
      process.env.ST_AI_REPLAY_LOG = join(file, 'replayed.txt')
      expect(() => noteReplayed('jev/a.json#b')).not.toThrow()
      expect(() => noteReplayed('jev/a.json#c')).not.toThrow()
      expect(said).toHaveBeenCalledTimes(1)
      expect(String(said.mock.calls[0][0])).toContain('ST_AI_REPLAY_LOG cannot be written')
    } finally {
      said.mockRestore()
      if (was === undefined) delete process.env.ST_AI_REPLAY_LOG
      else process.env.ST_AI_REPLAY_LOG = was
    }
  })
})

describe('what st propose prints', () => {
  it('prints in full, without --all, a proposal whose faulty answer Jev is sure meets it', async () => {
    const dir = withFault()
    session.reply = (room) => reply(codename(room))
    // Sure every answer meets it, the one the fault was found in too: it tells nothing apart.
    built.meets = () => 0.95
    const { code, out } = await st(dir, '--cases', CASE, '--deep')
    expect(code).toBe(0)
    const [stored] = readProposals(dir).proposals
    expect(stored.tells).toBe('all meet')
    expect(out).toContain(`  ${stored.id}  ${CODENAME}`)
    expect(out).toContain(
      `            ${FAULT_MET} v0 "First draft", where the fault was found, so a grading will count it as met there.`,
    )
    expect(out).not.toContain('that every answer read already meets')
    expect(out).toContain('To keep some: pnpm st propose')
  })

  it('prints in full a proposal for every case whose faulty answers Jev is sure meet it, naming each', async () => {
    const cases = ['email-free', 'email-price']
    const dir = withFault(cases)
    session.reply = (room) => reply(codename(room, { scope: 'every case' }))
    built.meets = () => 0.95
    const { out } = await st(dir, '--cases', cases.join(','), '--deep')
    const [every] = readProposals(dir).every
    expect(every).toBeDefined()
    expect(out).toContain('For every case')
    expect(out).toContain(`  ${every.id}  ${every.check}`)
    expect(out).toContain(
      `${FAULT_MET} v0 "First draft" on email-free and v0 "First draft" on email-price, where the fault was found`,
    )
    expect(out).not.toContain('that every answer read already meets')
  })

  it("prints the assistant's words, and nothing of Jev's, with --no-jev", async () => {
    const dir = withFault()
    session.reply = (room) => reply(codename(room))
    built.meets = () => 0.95
    const { out } = await st(dir, '--cases', CASE, '--deep', '--no-jev')
    const [stored] = readProposals(dir).proposals
    for (const answer of stored.answers) {
      expect(answer).not.toHaveProperty('jev')
      expect(answer).not.toHaveProperty('said')
    }
    expect(stored.tells).toBe('apart')
    expect(out).toContain(`  ${stored.id}  ${CODENAME}`)
    expect(out).not.toContain(FAULT_MET)
    expect(checksIn(built.asked)).toEqual([])
  })

  it('loads and prints a proposals.json written before answers carried Jev’s word', async () => {
    const dir = withFault()
    session.reply = (room) => reply(codename(room))
    // Read with no Jev, the file holds each answer as it was kept before: `meets` alone.
    await proposeChecks(dir, options())
    const file = join(dir, 'evals', 'proposals.json')
    const before = JSON.parse(readFileSync(file, 'utf8')) as { proposals: StoredProposal[] }
    for (const p of before.proposals)
      for (const a of p.answers)
        expect(Object.keys(a).sort()).toEqual([
          'configuration',
          'meets',
          'name',
          'run',
          'sample',
          'version',
        ])

    // Read before, with nothing changed since: kept as it is, Jev asked nothing of its answers.
    const { code, out } = await st(dir, '--cases', CASE, '--deep')
    expect(code).toBe(0)
    const [stored] = before.proposals
    expect(out).toContain('Read before, and nothing changed since.')
    expect(out).toContain(`  ${stored.id}  ${CODENAME}`)
    expect(out).toMatch(/Met by .*; missed by v0 "First draft"\./)
    expect(checksIn(built.asked)).toEqual([])
    expect(proposedChecks(dir).map((p) => p.answers.map((a) => a.meets).sort())).toEqual([
      ['no', 'yes', 'yes'],
    ])
  })
})
