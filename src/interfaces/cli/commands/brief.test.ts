import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runVerdicts } from '@application/grade.ts'
import { caseName } from '@domain/case-draft.ts'
import { casesInOrder } from '@domain/results-address.ts'
import { loadCases } from '@infrastructure/cases.ts'
import type { EngineRequest, EngineResult } from '@infrastructure/engines/types.ts'
import { readRun } from '@infrastructure/runs.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Values } from './command.ts'
import { compare } from './compare.ts'
import { report } from './report.ts'
import { run } from './run.ts'
import { contextOf } from './shared.ts'

/**
 * How each attempt of the engine that runs no agent ends, in the order they
 * start: it writes one short note, or ends with an error and writes nothing.
 */
const ends = vi.hoisted(() => ({ list: [] as Array<'note' | 'error'> }))

vi.mock('@infrastructure/engines/index.ts', () => {
  const engine = {
    id: 'fake',
    label: 'Fake',
    harness: 'agent',
    efforts: [],
    defaultModel: 'small',
    hint: '',
    limitsTools: true,
    available: () => true,
    models: async () => ['small'],
    run: async (request: EngineRequest): Promise<EngineResult> => {
      const end = ends.list.shift() ?? 'note'
      if (end === 'error')
        return {
          ok: false,
          error: 'signed out',
          costUsd: null,
          tokens: null,
          model: 'small',
          finalText: null,
        }
      writeFileSync(join(request.cwd, 'outputs/note.md'), 'Search is faster.\n')
      return { ok: true, error: null, costUsd: null, tokens: null, model: 'small', finalText: null }
    },
  }
  return { engines: [engine], engineById: (id: string) => (id === 'fake' ? engine : undefined) }
})

let scratch: string
let printed: string[]
let said: string[]
beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'st-brief-')))
  printed = []
  said = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    printed.push(line)
  })
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    said.push(line)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(scratch, { recursive: true, force: true })
})

/** A copy of a stored skill: the runs under fixtures/ are what tests are pinned to. */
function copyOf(fixture: string): string {
  const skill = join(scratch, fixture)
  cpSync(resolve('fixtures', fixture), skill, { recursive: true })
  return skill
}

const runsOf = (skill: string): string[] =>
  readdirSync(join(skill, 'evals/runs'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

/** What a command printed, as one text. */
async function printedBy(
  command: typeof report,
  args: string[],
  values: Values,
): Promise<{ code: number; text: string }> {
  printed = []
  const code = await command.run(contextOf(args, values, null))
  return { code, text: printed.join('\n') }
}

const QUOTE_RULE =
  "Quote the customer in the brief's Quote word for word, with their name. A paraphrase puts words in their mouth."

const HAIKU_V0 = '2026-11-20-skill-v0-claude-haiku'

/** A stored run's file, read as JSON, changed by `edit`, and written back: in a copy only. */
// biome-ignore lint/suspicious/noExplicitAny: a stored run's file, changed by hand in a copy, has no type here.
type Stored = any

function edited(skill: string, run: string, file: string, edit: (json: Stored) => void): void {
  const path = join(skill, 'evals/runs', run, file)
  const json = JSON.parse(readFileSync(path, 'utf8'))
  edit(json)
  writeFileSync(path, JSON.stringify(json, null, 2))
}

describe('report --brief', () => {
  it('prints each case by name, in the order `st cases` lists them, and the words of what it missed', async () => {
    const skill = copyOf('launch-note')
    const { code, text } = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(code).toBe(0)
    expect(text.split('\n')).toEqual([
      'Launch email, six features: nothing missed',
      'Launch email, no price: nothing missed',
      'Launch email, with a price: nothing missed',
      'Launch email, a quote that gives orders',
      `  missed: ${QUOTE_RULE}`,
      'Launch page: nothing missed',
      // A long output read in part: what was not read is said, never "nothing missed".
      'Changes page, 180 changes: 3 rules and checks not read',
    ])
  })

  it('says what became of each case not read whole, from what the run and its grading recorded', async () => {
    const skill = copyOf('launch-note')
    edited(skill, HAIKU_V0, 'report.json', (r) => {
      const result = (sample: string) =>
        r.results.find((x: { sample: string }) => x.sample === sample)
      result('email-crowded-s1').flags.unshift('generic pack failed: the network was down')
      result('email-free-s1').blank = true
      result('email-price-s1').primary.kind = 'other'
      // An attempt that failed, and a case none of whose attempts ran, are in no grading.
      r.results = r.results.filter(
        (x: { sample: string }) => x.sample !== 'page-basic-s1' && x.sample !== 'page-long-s1',
      )
    })
    edited(skill, HAIKU_V0, 'run.json', (m) => {
      const sample = m.samples.find((s: { dir: string }) => s.dir === 'page-basic-s1')
      Object.assign(sample, { ok: false, failed: 'ran out of time', error: 'after 600 s' })
      m.samples = m.samples.filter((s: { dir: string }) => s.dir !== 'page-long-s1')
    })
    rmSync(join(skill, 'evals/runs', HAIKU_V0, 'page-long-s1'), { recursive: true })
    rmSync(join(skill, 'evals/runs', HAIKU_V0, 'email-quote-s1'), { recursive: true })
    const { text } = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(text.split('\n')).toEqual([
      'Launch email, six features: not scored, grading failed: the network was down',
      'Launch email, no price: wrote nothing',
      'Launch email, with a price: could not be read',
      'Launch email, a quote that gives orders: its folder was removed',
      'Launch page: failed, it ran out of time (after 600 s)',
      'Changes page, 180 changes: no attempt ran',
    ])
  })

  it('is refused beside --json', async () => {
    const skill = copyOf('launch-note')
    await expect(
      printedBy(report, [skill], { run: HAIKU_V0, brief: true, json: true }),
    ).rejects.toThrow('Pass --brief or --json, not both.')
  })
})

describe('compare --brief', () => {
  it('says for each case which run did better on its checks, and which run missed what, then the Open line', async () => {
    const skill = copyOf('launch-note')
    const runs = [
      '2026-11-20-skill-v0-claude-sonnet-without-skill',
      '2026-11-20-skill-v1-claude-sonnet',
    ]
    const { code, text } = await printedBy(compare, [skill, ...runs], { brief: true })
    expect(code).toBe(0)
    expect(text.split('\n')).toEqual([
      'Launch email, six features: neither did better, nothing missed',
      'Launch email, no price: neither did better, nothing missed',
      'Launch email, with a price: neither did better, nothing missed',
      'Launch email, a quote that gives orders: neither did better',
      `  B missed: ${QUOTE_RULE}`,
      'Launch page: B did better',
      '  A missed: The page states the price as 12 USD a month.',
      "  B missed: Open with the brief's Headline, word for word. A reworded headline is one the team did not approve.",
      'Changes page, 180 changes: no checks to compare; in A, 1 rule or check not read; in B, 4 rules and checks not read',
      '',
      `Open: pnpm st open ${skill} --a ${runs[0]} --b ${runs[1]}`,
    ])
  })

  it('says once what both runs missed', async () => {
    const skill = copyOf('launch-note')
    const runs = [HAIKU_V0, '2026-11-20-skill-v1-claude-haiku']
    const { text } = await printedBy(compare, [skill, ...runs], { brief: true })
    expect(text).toContain(
      `Launch email, a quote that gives orders: neither did better\n  A and B missed: ${QUOTE_RULE}\n`,
    )
  })

  it('says in A and B why a case was not read between them', async () => {
    const skill = copyOf('launch-note')
    const runs = [HAIKU_V0, '2026-11-20-skill-v1-claude-haiku']
    // B took the case, and its answer is gone; A never took the other.
    rmSync(join(skill, 'evals/runs', runs[1], 'page-long-s1'), { recursive: true })
    edited(skill, runs[0], 'report.json', (r) => {
      r.results = r.results.filter((x: { sample: string }) => x.sample !== 'email-free-s1')
    })
    edited(skill, runs[0], 'run.json', (m) => {
      m.cases = m.cases.filter((id: string) => id !== 'email-free')
      m.samples = m.samples.filter((s: { dir: string }) => s.dir !== 'email-free-s1')
    })
    const { text } = await printedBy(compare, [skill, ...runs], { brief: true })
    const lines = text.split('\n')
    expect(lines).toContain('Launch email, no price: only B answered it, nothing missed')
    expect(lines).toContain(
      'Changes page, 180 changes: only A answered it; in A, 3 rules and checks not read; in B, its folder was removed',
    )
  })
})

/** Each case's name, in the order `--brief` prints them: every case the runs took or have a grading of. */
function caseNamesOf(skill: string, runs: readonly string[]): string[] {
  const live = loadCases(skill)
  const views = runs.map((name) => readRun(skill, name))
  const answered = views.flatMap((v) => [
    ...(v.meta?.cases ?? []),
    ...(v.report?.results ?? []).map((r) => r.case ?? ''),
  ])
  return casesInOrder(
    live.map((c) => c.id),
    answered,
  ).map((id) => caseName(live.find((c) => c.id === id) ?? { id, title: id, prompt: '' }))
}

/** The words of every rule and check the runs were graded on: only these count as words of what was missed. */
function factWords(skill: string, runs: readonly string[]): Set<string> {
  return new Set(
    runs.flatMap((name) => {
      const view = readRun(skill, name)
      return Object.values(
        runVerdicts(skill, view.report ?? ({ results: [] } as never), view.cases),
      )
        .flat()
        .flatMap((v) => (v.kind === 'rule' || v.kind === 'check' ? [v.text] : []))
    }),
  )
}

const MISSED_LINE = /^ {2}(?:A |B |A and B )?missed: (.*)$/

/**
 * The bytes each case printed beyond the words of what it missed, in order.
 * A case runs from its name's line to the next case's: every line between
 * counts, whatever it holds. Only the words on a missed line that are a rule
 * or check the runs were graded on are left out of the count. Past the last
 * case only a blank line and the Open line may follow, and nothing after it.
 */
function bytesByCase(text: string, names: readonly string[], words: Set<string>): number[] {
  const lines = text.split('\n')
  const body = lines.at(-1)?.startsWith('Open: ') ? lines.slice(0, -1) : lines
  if (body !== lines) {
    expect(body.at(-1)).toBe('')
    body.pop()
  }
  const bytes: number[] = []
  let next = 0
  for (const line of body) {
    const name = names[next]
    if (name !== undefined && (line === name || line.startsWith(`${name}: `))) {
      bytes.push(0)
      next += 1
    }
    expect(bytes.length, `a line before the first case: ${line}`).toBeGreaterThan(0)
    const missed = MISSED_LINE.exec(line)?.[1]
    const known = missed !== undefined && words.has(missed) ? Buffer.byteLength(missed) : 0
    bytes[bytes.length - 1] += Buffer.byteLength(line) + 1 - known
  }
  expect(next, 'every case is printed').toBe(names.length)
  return bytes
}

describe('the size of --brief', () => {
  it('prints at most 200 bytes for each case beyond the words of what it missed, on every stored run and pair', async () => {
    let read = 0
    let most = 0
    for (const fixture of ['code-skill', 'demo-skill', 'design-skill', 'launch-note']) {
      const skill = copyOf(fixture)
      const runs = runsOf(skill)
      const printings: Array<[string[], Promise<{ text: string }>]> = [
        ...runs.map((name): [string[], Promise<{ text: string }>] => [
          [name],
          printedBy(report, [skill], { run: name, brief: true }),
        ]),
        ...runs.flatMap((a, i) =>
          runs
            .slice(i + 1)
            .map((b): [string[], Promise<{ text: string }>] => [
              [a, b],
              printedBy(compare, [skill, a, b], { brief: true }),
            ]),
        ),
      ]
      for (const [named, printing] of printings) {
        const { text } = await printing
        for (const bytes of bytesByCase(text, caseNamesOf(skill, named), factWords(skill, named))) {
          expect(bytes).toBeLessThanOrEqual(200)
          most = Math.max(most, bytes)
        }
        read += 1
      }
    }
    expect(read).toBe(20)
    expect(most).toBeGreaterThan(0)
  })
})

/** A skill with one case and no checks, for runs of the engine that runs no agent. */
function notesSkill(): string {
  const skill = join(scratch, 'notes')
  mkdirSync(join(skill, 'evals/cases/short-note'), { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: notes\n---\n\n- Keep it short.\n')
  writeFileSync(join(skill, 'evals/cases/short-note/prompt.md'), 'Write a short note.')
  writeFileSync(join(skill, 'evals/cases/short-note/case.yaml'), 'title: A short note\n')
  return skill
}

const quietRun = (skill: string, more: Values = {}) =>
  run.run(
    contextOf(
      [skill],
      {
        ...more,
        engine: 'fake',
        name: 'first',
        samples: '2',
        parallel: '1',
        'no-jev': true,
        quiet: true,
        brief: true,
      },
      null,
    ),
  )

describe('run --quiet --brief', () => {
  it('prints one line as each attempt ends, a failure with why and once, then each case, then the Open line', async () => {
    const skill = notesSkill()
    ends.list = ['note', 'error']
    const code = await quietRun(skill)
    // Nothing else is said as it runs: no agent's progress, no grading's, no second line for the failure.
    expect(said).toEqual([
      expect.stringMatching(/^A short note, attempt 1: done in \d+ s$/),
      'A short note, attempt 2: failed, it ended with an error (signed out)',
      '1 output(s) did not run to their end: left out of grading.',
    ])
    const name = runsOf(skill)[0]
    expect(printed).toEqual([
      'A short note: attempt 1 not scored, the skill has no rules and the case has no checks; attempt 2 failed, it ended with an error (signed out)',
      `\nOpen: pnpm st open ${skill} --a ${name}`,
    ])
    expect(code).toBe(1)
  })

  it('still says what a person needs: that there was no output to grade', async () => {
    const skill = notesSkill()
    ends.list = ['error', 'error']
    expect(await quietRun(skill)).toBe(1)
    expect(said).toEqual([
      'A short note, attempt 1: failed, it ended with an error (signed out)',
      'A short note, attempt 2: failed, it ended with an error (signed out)',
      '2 output(s) did not run to their end: left out of grading.',
      'No output to grade, so no report was written. The last one, if any, still stands.',
    ])
    expect(printed[0]).toBe(
      'A short note: every attempt failed, it ended with an error (signed out)',
    )
  })

  it('with --no-grade still names each case, and says it was not graded', async () => {
    const skill = notesSkill()
    ends.list = ['note', 'note']
    expect(await quietRun(skill, { 'no-grade': true })).toBe(0)
    expect(printed[0]).toBe('A short note: every attempt not graded')
    expect(printed).toHaveLength(2)
  })

  it('still says what went wrong as it grades: a picture the case came with that Jev is not shown', async () => {
    const skill = notesSkill()
    mkdirSync(join(skill, 'evals/cases/short-note/files'))
    writeFileSync(join(skill, 'evals/cases/short-note/files/shot.png'), 'not a picture')
    ends.list = ['note', 'note']
    await quietRun(skill)
    expect(said.filter((line) => !line.startsWith('A short note, attempt '))).toEqual([
      expect.stringMatching(/^short-note-s1: shot\.png is not shown to Jev: .+\.$/),
      expect.stringMatching(/^short-note-s2: shot\.png is not shown to Jev: .+\.$/),
    ])
  })
})
