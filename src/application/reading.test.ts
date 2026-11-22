/**
 * A reading of a graded run, with the assistant's session stood in for: what
 * it is started in, what it is asked, and how its answers are checked and counted.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Report } from '@domain/schemas.ts'
import { scoreResult } from '@domain/scoring.ts'
import type { AiFolderRequest } from '@infrastructure/ai/types.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** What the session does: each test says how it answers, and reads what it was given. */
const session = vi.hoisted(() => ({
  requests: [] as AiFolderRequest[],
  sheets: [] as string[],
  folders: [] as string[][],
  reply: (_request: AiFolderRequest): string => '{}',
  provider: true,
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () =>
    session.provider
      ? {
          readFolder: async (request: AiFolderRequest) => {
            session.requests.push(request)
            session.sheets.push(readFileSync(join(request.dir, 'sheet.md'), 'utf8'))
            session.folders.push(readdirSync(request.dir).sort())
            return {
              text: session.reply(request),
              model: 'claude-test',
              usage: { input: 100, output: 10 },
            }
          },
        }
      : {},
}))
vi.mock('@infrastructure/ai/store.ts', () => ({ recordUsage: () => {} }))

const { gradeRun } = await import('./grade.ts')
const { readingOfRun } = await import('./reading.ts')

const FIXTURE = resolve(import.meta.dirname, '../../fixtures/demo-skill')
const RUN = '2026-10-30-skill-v0-claude-haiku'
const SAMPLE = 'release-note-s1'
const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
afterEach(() => vi.restoreAllMocks())

/** Jev answers every rule and check 0.9, and is not sure of the first rule. */
beforeEach(() => {
  session.requests = []
  session.sheets = []
  session.folders = []
  session.reply = () => '{}'
  session.provider = true
  vi.spyOn(Jev, 'available').mockReturnValue(true)
  vi.spyOn(Jev.prototype, 'ask').mockImplementation(async (_state, questions) =>
    Object.fromEntries(
      Object.keys(questions).map((id) => [id, { noul: id === 'rule:r1' ? 0.5 : 0.9 } as never]),
    ),
  )
})

async function graded(): Promise<{ dir: string; report: Report }> {
  const dir = join(mkdtempSync(join(tmpdir(), 'st-reading-')), 'demo-skill')
  made.push(dirname(dir))
  cpSync(FIXTURE, dir, { recursive: true, verbatimSymlinks: true })
  return { dir, report: await gradeRun(dir, RUN, { useJev: true }) }
}

const options = (over: Partial<Parameters<typeof readingOfRun>[2]> = {}) => ({
  provider: 'claude-code' as const,
  model: 'sonnet',
  effort: '',
  cases: [],
  blind: false,
  parallel: 2,
  log: () => {},
  signal: new AbortController().signal,
  ...over,
})

/** The first words of the output's main file, long enough to stand as a quote. */
const quoteFrom = (request: AiFolderRequest): { file: string; quote: string } => {
  const outputs = join(request.dir, SAMPLE, 'outputs')
  const [name] = readdirSync(outputs)
  return {
    file: `${SAMPLE}/outputs/${name}`,
    quote: readFileSync(join(outputs, name), 'utf8').trim().slice(0, 40),
  }
}

const answer = (request: AiFolderRequest, fact: string, over: Record<string, string> = {}) => ({
  output: SAMPLE,
  fact,
  answer: 'met',
  why: 'It does.',
  ...quoteFrom(request),
  ...over,
})

describe('readingOfRun', () => {
  it('asks only what Jev was not sure of, in a folder holding the request and the output', async () => {
    const { dir } = await graded()
    session.reply = (request) => JSON.stringify({ marks: [answer(request, 'R1')], note: 'Fine.' })
    const reading = await readingOfRun(dir, RUN, options())
    expect(session.requests).toHaveLength(1)
    expect(session.folders[0]).toEqual([SAMPLE, 'request.md', 'sheet.md', 'skill'])
    expect(session.sheets[0]).toMatch(/## Answer each of these\n- R1[^\n]*\n\n## Already marked/)
    const [read] = reading.cases
    expect(read).toMatchObject({ case: 'release-note', asked: 1, note: 'Fine.', error: null })
    expect(read.marks).toMatchObject([{ answer: 'met', evidence: 'quoted', fact: { ref: 'R1' } }])
    expect(reading.agreement.settled).toEqual({ agree: 1, total: 1 })
    expect(reading).toMatchObject({ model: 'claude-test', usage: { input: 100, output: 10 } })
  })

  it('deletes the folder when the session ends', async () => {
    const { dir } = await graded()
    await readingOfRun(dir, RUN, options())
    expect(existsSync(session.requests[0].dir)).toBe(false)
  })

  it('writes nothing to the skill', async () => {
    const { dir } = await graded()
    const before = readdirSync(join(dir, 'evals/runs', RUN)).sort()
    await readingOfRun(dir, RUN, options())
    expect(readdirSync(join(dir, 'evals/runs', RUN)).sort()).toEqual(before)
  })

  it('sets an answer with an invented quote to cannot tell', async () => {
    const { dir } = await graded()
    session.reply = (request) =>
      JSON.stringify({ marks: [answer(request, 'R1', { quote: 'words the output never says' })] })
    const reading = await readingOfRun(dir, RUN, options())
    expect(reading.cases[0].marks).toMatchObject([
      { answer: 'cannot tell', evidence: 'unfound', said: 'met' },
    ])
    expect(reading.agreement).toMatchObject({ answered: 0, cannotTell: 1, unfound: 1 })
  })

  it('counts its answers against the reader’s own', async () => {
    const { dir, report } = await graded()
    const unsure = scoreResult(report.results[0], report.config, scorers).verdicts.find(
      (v) => v.aside === 'unsure',
    )
    if (!unsure) throw new Error('no fact Jev was not sure of')
    writeFileSync(
      join(dir, 'evals/reviews.json'),
      JSON.stringify({
        reviews: { [`${RUN}/${SAMPLE}`]: { corrections: { [unsure.id]: false }, updatedAt: '' } },
      }),
    )
    session.reply = (request) => JSON.stringify({ marks: [answer(request, 'R1')] })
    const reading = await readingOfRun(dir, RUN, options())
    // The reader's answer is never on the sheet.
    expect(session.sheets[0]).toContain('- R1')
    expect(reading.agreement.yours).toEqual({ agree: 0, total: 1 })
  })

  it('asks every rule and check when blind, and counts against Jev where it was sure', async () => {
    const { dir } = await graded()
    session.reply = (request) =>
      JSON.stringify({
        marks: [answer(request, 'R1'), answer(request, 'R2', { answer: 'missed' })],
      })
    const reading = await readingOfRun(dir, RUN, options({ blind: true }))
    expect(session.sheets[0]).not.toContain('Already marked')
    expect(reading.cases[0].asked).toBeGreaterThan(1)
    expect(reading.agreement.jev).toEqual({ agree: 0, total: 1 })
  })

  it('starts no session for a case Jev was sure of', async () => {
    vi.spyOn(Jev.prototype, 'ask').mockImplementation(async (_state, questions) =>
      Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.9 } as never])),
    )
    const { dir } = await graded()
    const reading = await readingOfRun(dir, RUN, options())
    expect(session.requests).toEqual([])
    expect(reading.cases[0]).toMatchObject({ asked: 0, error: null })
  })

  it('says a session that failed in its case, and deletes its folder', async () => {
    const { dir } = await graded()
    let room = ''
    session.reply = (request) => {
      room = request.dir
      throw new Error('Claude Code could not finish the reply.')
    }
    const reading = await readingOfRun(dir, RUN, options())
    expect(reading.cases[0].error).toBe('Claude Code could not finish the reply.')
    expect(existsSync(room)).toBe(false)
  })

  it('says a case the run did not answer', async () => {
    const { dir } = await graded()
    const reading = await readingOfRun(dir, RUN, options({ cases: ['no-such-case'] }))
    expect(reading.cases[0].error).toBe('The run has no graded output for this case.')
  })

  it('refuses a run with no grading, and an assistant that cannot be held to a folder', async () => {
    const { dir } = await graded()
    session.provider = false
    await expect(readingOfRun(dir, RUN, options())).rejects.toThrow('cannot be held to reading')
    session.provider = true
    rmSync(join(dir, 'evals/runs', RUN, 'report.json'))
    await expect(readingOfRun(dir, RUN, options())).rejects.toThrow('is not graded')
  })
})
