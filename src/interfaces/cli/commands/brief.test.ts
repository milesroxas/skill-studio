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
import { runNamed, runShown } from '@domain/run-name.ts'
import { loadCases } from '@infrastructure/cases.ts'
import type { EngineRequest, EngineResult } from '@infrastructure/engines/types.ts'
import { GRADING_COST_FILE, readRun, versionsOf } from '@infrastructure/runs.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { caseHead } from './brief.ts'
import type { Values } from './command.ts'
import { compare } from './compare.ts'
import { report } from './report.ts'
import { run } from './run.ts'
import { contextOf, spentLine, spentOf } from './shared.ts'

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

/** What the spent line says of a stored run's grading: the stored runs were graded before gradings kept their cost. */
const OLD = 'grading not counted, as it was graded before gradings kept their cost'

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
      // The run, and the version it ran by the name it was given.
      `Run: ${HAIKU_V0} (v0 · First draft)`,
      // A rule Jev or code was not sure of is no miss, and "nothing missed" never stands alone beside it.
      '[email-crowded] Launch email, six features: nothing missed, 1 of 11 not sure',
      '[email-free] Launch email, no price: nothing missed',
      '[email-price] Launch email, with a price: nothing missed, 1 of 11 not sure',
      '[email-quote] Launch email, a quote that gives orders',
      `  missed: ${QUOTE_RULE}`,
      '[page-basic] Launch page: nothing missed',
      // A long output read in part: what was not read is said, never "nothing missed".
      '[page-long] Changes page, 180 changes: 3 rules and checks not read',
      // Then what the run spent: its grading was kept before gradings kept their cost.
      `Spent: answering 6 attempts, 140 s, 604,099 input and 31,112 output tokens, $0.0426; ${OLD}`,
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
      `Run: ${HAIKU_V0} (v0 · First draft)`,
      '[email-crowded] Launch email, six features: not scored, grading failed: the network was down',
      '[email-free] Launch email, no price: wrote nothing',
      '[email-price] Launch email, with a price: could not be read',
      '[email-quote] Launch email, a quote that gives orders: its folder was removed',
      '[page-basic] Launch page: failed, it ran out of time (after 600 s)',
      '[page-long] Changes page, 180 changes: no attempt ran',
      // Two folders removed: four attempts are left to count, each with its timing.json.
      `Spent: answering 4 attempts, 84 s, 336,642 input and 18,912 output tokens, $0.0246; ${OLD}`,
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
      // A run without the skill tested no version, though it was stamped with the one the skill had.
      `A: ${runs[0]} (without the skill)`,
      `B: ${runs[1]} (v1 · Second draft)`,
      // A run without the skill is held to no rule, so only B has rules not sure.
      '[email-crowded] Launch email, six features: neither did better, nothing missed; in B, 2 of 16 not sure',
      '[email-free] Launch email, no price: neither did better, nothing missed; in B, 1 of 16 not sure',
      '[email-price] Launch email, with a price: neither did better, nothing missed; in B, 1 of 16 not sure',
      '[email-quote] Launch email, a quote that gives orders: neither did better; in B, 1 of 15 not sure',
      `  B missed: ${QUOTE_RULE}`,
      '[page-basic] Launch page: B did better',
      '  A missed: The page states the price as 12 USD a month.',
      "  B missed: Open with the brief's Headline, word for word. A reworded headline is one the team did not approve.",
      '[page-long] Changes page, 180 changes: no checks to compare; in A, 1 rule or check not read; in B, 4 rules and checks not read',
      `A spent: answering 6 attempts, 94 s, 408,430 input and 7,243 output tokens, $0.37; ${OLD}`,
      `B spent: answering 6 attempts, 80 s, 442,589 input and 8,699 output tokens, $0.37; ${OLD}`,
      '',
      `Open: pnpm st open ${skill} --a ${runs[0]} --b ${runs[1]}`,
    ])
  })

  it('says once what both runs missed', async () => {
    const skill = copyOf('launch-note')
    const runs = [HAIKU_V0, '2026-11-20-skill-v1-claude-haiku']
    const { text } = await printedBy(compare, [skill, ...runs], { brief: true })
    expect(text).toContain(
      `[email-quote] Launch email, a quote that gives orders: neither did better; in B, 1 of 15 not sure\n  A and B missed: ${QUOTE_RULE}\n`,
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
    expect(lines).toContain(
      '[email-free] Launch email, no price: only B answered it, nothing missed; in B, 1 of 16 not sure',
    )
    expect(lines).toContain(
      '[page-long] Changes page, 180 changes: only A answered it; in A, 3 rules and checks not read; in B, its folder was removed',
    )
  })
})

/**
 * The lines `--brief` starts with, naming the runs it read and the version
 * each ran: `Run:` for one run, `A:` and `B:` for two.
 */
function runHeadsOf(skill: string, runs: readonly string[]): string[] {
  const { versions } = versionsOf(skill)
  const shown = runs.map((name) => runShown(runNamed(name, readRun(skill, name).meta, versions)))
  return shown.length === 1 ? [`Run: ${shown[0]}`] : [`A: ${shown[0]}`, `B: ${shown[1]}`]
}

/** The lines `--brief` ends its cases with, saying what each run spent: `Spent:` for one, `A spent:` and `B spent:` for two. */
function spentLinesOf(skill: string, runs: readonly string[]): string[] {
  const spent = runs.map((name) => spentOf(skill, name))
  return spent.length === 1
    ? [spentLine(spent[0])]
    : [spentLine(spent[0], 'A'), spentLine(spent[1], 'B')]
}

/** The lines `--brief` prints around its cases for these runs: each run's head, and what each spent. */
const frameOf = (skill: string, runs: readonly string[]) => ({
  heads: runHeadsOf(skill, runs),
  spent: spentLinesOf(skill, runs),
})

/**
 * Each case's id and its head (`caseHead`), in the order `--brief` prints
 * them: every case the runs took or has a grading of.
 */
function caseHeadsOf(skill: string, runs: readonly string[]): Array<{ id: string; head: string }> {
  const live = loadCases(skill)
  const views = runs.map((name) => readRun(skill, name))
  const answered = views.flatMap((v) => [
    ...(v.meta?.cases ?? []),
    ...(v.report?.results ?? []).map((r) => r.case ?? ''),
  ])
  return casesInOrder(
    live.map((c) => c.id),
    answered,
  ).map((id) => ({
    id,
    head: caseHead(id, caseName(live.find((c) => c.id === id) ?? { id, title: id, prompt: '' })),
  }))
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

/** How often a case's attempts missed it, where it had more than one. */
const OFTEN = '(?: in \\d+ of \\d+)?'
const MISSED_LINE = new RegExp(
  `^ {2}(?:(?:A |B |A and B )?missed${OFTEN}|A missed${OFTEN}, B missed${OFTEN}): (.*)$`,
)

/** The longest id `case add` gives a case: each case is counted as though its id were this long. */
const LONGEST_ID = 40

/**
 * The bytes each case printed beyond the words of what it missed, in order,
 * its id counted as though it were `LONGEST_ID` characters long. Before the
 * first case only the lines that name the runs may stand (`runHeadsOf`), and
 * after the last only the lines that say what each run spent
 * (`spentLinesOf`), then a blank line and the Open line, and nothing after
 * it: each as it is expected, and they belong to no case. A case runs from
 * its head's line to the next case's: every line between counts, whatever it
 * holds. Only the words on a missed line that are a rule or check the runs
 * were graded on are left out of the count.
 */
function bytesByCase(
  text: string,
  frame: { heads: readonly string[]; spent: readonly string[] },
  cases: ReadonlyArray<{ id: string; head: string }>,
  words: Set<string>,
): number[] {
  const all = text.split('\n')
  expect(all.slice(0, frame.heads.length)).toEqual(frame.heads)
  const lines = all.slice(frame.heads.length)
  const body = lines.at(-1)?.startsWith('Open: ') ? lines.slice(0, -1) : lines
  if (body !== lines) {
    expect(body.at(-1)).toBe('')
    body.pop()
  }
  expect(body.slice(-frame.spent.length)).toEqual(frame.spent)
  body.splice(-frame.spent.length)
  const bytes: number[] = []
  let next = 0
  for (const line of body) {
    const now = cases[next]
    if (now !== undefined && (line === now.head || line.startsWith(`${now.head}: `))) {
      expect(now.id.length).toBeLessThanOrEqual(LONGEST_ID)
      bytes.push(LONGEST_ID - now.id.length)
      next += 1
    }
    expect(bytes.length, `a line before the first case: ${line}`).toBeGreaterThan(0)
    const missed = MISSED_LINE.exec(line)?.[1]
    const known = missed !== undefined && words.has(missed) ? Buffer.byteLength(missed) : 0
    bytes[bytes.length - 1] += Buffer.byteLength(line) + 1 - known
  }
  expect(next, 'every case is printed').toBe(cases.length)
  return bytes
}

describe('the size of --brief', () => {
  it('prints at most 200 bytes for each case beyond the words of what it missed, on every stored run and pair', async () => {
    let read = 0
    let most = 0
    for (const fixture of ['code-skill', 'demo-skill', 'design-skill', 'launch-note']) {
      const skill = copyOf(fixture)
      const runs = runsOf(skill)
      // Each printed in turn: `printedBy` reads what was printed since it began, so two at once would read each other's.
      const printings: Array<[string[], () => Promise<{ text: string }>]> = [
        ...runs.map((name): [string[], () => Promise<{ text: string }>] => [
          [name],
          () => printedBy(report, [skill], { run: name, brief: true }),
        ]),
        ...runs.flatMap((a, i) =>
          runs
            .slice(i + 1)
            .map((b): [string[], () => Promise<{ text: string }>] => [
              [a, b],
              () => printedBy(compare, [skill, a, b], { brief: true }),
            ]),
        ),
      ]
      for (const [named, printing] of printings) {
        const { text } = await printing()
        for (const bytes of bytesByCase(
          text,
          frameOf(skill, named),
          caseHeadsOf(skill, named),
          factWords(skill, named),
        )) {
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
      `Run: ${name} (v0 · first)`,
      '[short-note] A short note: attempt 1 not scored, the skill has no rules and the case has no checks; attempt 2 failed, it ended with an error (signed out)',
      // An engine that keeps no tokens or price, and a grading without Jev, which asks no model.
      expect.stringMatching(
        /^Spent: answering 2 attempts, [\d.]+ s, no tokens kept, no price kept; grading, no model calls$/,
      ),
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
    expect(printed[1]).toBe(
      '[short-note] A short note: every attempt failed, it ended with an error (signed out)',
    )
  })

  it('with --no-grade still names each case, and says it was not graded', async () => {
    const skill = notesSkill()
    ends.list = ['note', 'note']
    expect(await quietRun(skill, { 'no-grade': true })).toBe(0)
    expect(printed[1]).toBe('[short-note] A short note: every attempt not graded')
    expect(printed[2]).toMatch(/^Spent: answering 2 attempts, .*; no grading kept$/)
    expect(printed).toHaveLength(4)
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

describe('how often --brief says a rule or check was missed', () => {
  /**
   * A copy of the haiku run with three more attempts at the quote case: two
   * graded as the first was, then `edit` changes them, and one that failed.
   */
  function moreAttempts(skill: string, edit: (results: Stored[]) => void): void {
    const runDir = join(skill, 'evals/runs', HAIKU_V0)
    for (const n of [2, 3])
      cpSync(join(runDir, 'email-quote-s1'), join(runDir, `email-quote-s${n}`), { recursive: true })
    edited(skill, HAIKU_V0, 'report.json', (r) => {
      const first = r.results.find((x: { sample: string }) => x.sample === 'email-quote-s1')
      const added = [2, 3].map((n) => ({ ...structuredClone(first), sample: `email-quote-s${n}` }))
      edit(added)
      r.results.push(...added)
    })
    edited(skill, HAIKU_V0, 'run.json', (m) => {
      const first = m.samples.find((s: { dir: string }) => s.dir === 'email-quote-s1')
      for (const n of [2, 3]) m.samples.push({ ...first, dir: `email-quote-s${n}`, index: n })
      m.samples.push({
        ...first,
        dir: 'email-quote-s4',
        index: 4,
        ok: false,
        failed: 'ran out of time',
        error: null,
      })
    })
  }

  /** The quote rule's verdict in one attempt's grading. */
  const quoteRule = (result: Stored): Stored =>
    result.packs.generic.adherence.rules.find((rule: { text: string }) => rule.text === QUOTE_RULE)

  it('says in how many of the attempts marked on it a rule was missed, and not where a case had one attempt', async () => {
    const skill = copyOf('launch-note')
    moreAttempts(skill, () => {})
    const all = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(all.text).toContain(
      `[email-quote] Launch email, a quote that gives orders: attempt 4 failed, it ran out of time\n  missed in 3 of 3: ${QUOTE_RULE}`,
    )
    // A case with one attempt says no count.
    const single = await printedBy(report, [skill], {
      run: '2026-11-20-skill-v1-claude-haiku',
      brief: true,
    })
    expect(single.text).toContain(`\n  missed: ${QUOTE_RULE}`)
  })

  it('counts an attempt Jev did not read on a rule in neither number, and says it was not read', async () => {
    const skill = copyOf('launch-note')
    moreAttempts(skill, ([two, three]) => {
      quoteRule(two).noul = 0.95
      quoteRule(three).noul = null
    })
    const { text } = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(text).toContain(
      `[email-quote] Launch email, a quote that gives orders: attempt 4 failed, it ran out of time; 1 rule or check not read\n  missed in 1 of 2: ${QUOTE_RULE}`,
    )
  })

  it('counts an attempt that met the rule among those marked on it, and one not sure or failed in neither number', async () => {
    const skill = copyOf('launch-note')
    // Met on attempt 2, Jev not sure on attempt 3, and attempt 4 failed: missed on 1 of the 2 marked.
    moreAttempts(skill, ([two, three]) => {
      quoteRule(two).noul = 0.95
      quoteRule(three).noul = 0.5
    })
    const one = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(one.text).toContain(`\n  missed in 1 of 2: ${QUOTE_RULE}`)
    // Beside a run with one attempt at the case, each run says its own.
    const runs = [HAIKU_V0, '2026-11-20-skill-v1-claude-haiku']
    const two = await printedBy(compare, [skill, ...runs], { brief: true })
    expect(two.text).toContain(`\n  A missed in 1 of 2, B missed: ${QUOTE_RULE}\n`)
    const swapped = await printedBy(compare, [skill, ...[...runs].reverse()], { brief: true })
    expect(swapped.text).toContain(`\n  A missed, B missed in 1 of 2: ${QUOTE_RULE}\n`)
    // The count is held to the same size as every other line of a case.
    for (const [named, { text }] of [
      [[HAIKU_V0], one],
      [runs, two],
    ] as const)
      for (const bytes of bytesByCase(
        text,
        frameOf(skill, named),
        caseHeadsOf(skill, named),
        factWords(skill, named),
      ))
        expect(bytes).toBeLessThanOrEqual(200)
  })
})

describe('the lines of --brief', () => {
  /** The ids at the start of the lines of `text`: only a case's head line may start with one. */
  const heads = (text: string): string[] =>
    text.split('\n').flatMap((line) => /^\[([^\]]+)\]/.exec(line)?.[1] ?? [])
  /** The lines that read as a miss: two spaces in, then anything but a space. */
  const missLines = (text: string): string[] =>
    text.split('\n').filter((line) => /^ {2}\S/.test(line))
  const IDS = [
    'email-crowded',
    'email-free',
    'email-price',
    'email-quote',
    'page-basic',
    'page-long',
  ]
  const SECOND = '[email-free] A second paragraph, which reads as a case where it is not indented.'

  /** A copy of launch-note whose quote case's title runs over two lines, and whose quote rule has two paragraphs in both runs. */
  function spoofed(): string {
    const skill = copyOf('launch-note')
    const yaml = join(skill, 'evals/cases/email-quote/case.yaml')
    const before = readFileSync(yaml, 'utf8')
    // `[^\r\n]*` stops at either line end, so the title line is found however the file ends its lines.
    const after = before.replace(
      /^title: [^\r\n]*/m,
      'title: "Launch email\\n[email-free]   spoofed"',
    )
    expect(after).not.toBe(before)
    writeFileSync(yaml, after)
    for (const name of [HAIKU_V0, '2026-11-20-skill-v1-claude-haiku'])
      edited(skill, name, 'report.json', (r) => {
        for (const result of r.results)
          for (const rule of result.packs.generic.adherence.rules)
            if (rule.text === QUOTE_RULE)
              rule.text = `${QUOTE_RULE}\n\n${SECOND}\r\nA missed: spoofed\nmissed: spoofed too`
      })
    return skill
  }

  it('prints a case’s title on its one head line, and every line of a missed rule indented', async () => {
    const skill = spoofed()
    const { text } = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(text.split('\n').slice(4, 10)).toEqual([
      '[email-quote] Launch email [email-free] spoofed',
      `  missed: ${QUOTE_RULE}`,
      '    ',
      `    ${SECOND}`,
      '    A missed: spoofed',
      '    missed: spoofed too',
    ])
    expect(heads(text)).toEqual(IDS)
    // A line that reads as a miss is one: a later line of a rule is indented deeper than its miss line.
    expect(missLines(text)).toEqual([`  missed: ${QUOTE_RULE}`])
  })

  it('finds each case’s id once in compare too, whatever a title or a rule holds', async () => {
    const skill = spoofed()
    const runs = [HAIKU_V0, '2026-11-20-skill-v1-claude-haiku']
    const { text } = await printedBy(compare, [skill, ...runs], { brief: true })
    expect(heads(text)).toEqual(IDS)
    expect(text).toContain(
      `\n  A and B missed: ${QUOTE_RULE}\n    \n    ${SECOND}\n    A missed: spoofed\n    missed: spoofed too\n`,
    )
    expect(missLines(text)).toEqual([
      '  B missed: Write no more than 120 words. Most readers stop after the first screen.',
      `  A and B missed: ${QUOTE_RULE}`,
    ])
    // Nothing but the two runs' lines, a case's head, the blank line before the Open line and the Open line starts at the margin.
    const named = [...runHeadsOf(skill, runs), ...spentLinesOf(skill, runs)]
    for (const line of text.split('\n'))
      expect(
        named.includes(line) ||
          line === '' ||
          line.startsWith('Open: ') ||
          /^\[[^\]]+\]/.test(line) ||
          line.startsWith('  '),
        line,
      ).toBe(true)
    expect(text.split('\n').slice(0, 2)).toEqual(named.slice(0, 2))
  })
})

describe('what --brief keeps out of the terminal', () => {
  it('prints no escape sequence, control or direction character from a title, a version name or a rule', async () => {
    const skill = copyOf('launch-note')
    // A title that would move up a line and erase it, as YAML writes an escape.
    writeFileSync(
      join(skill, 'evals/cases/email-quote/case.yaml'),
      'title: "Launch email\\e[1A\\e[2K, a quote that gives orders"\n',
    )
    edited(skill, HAIKU_V0, 'run.json', (m) => {
      m.skillName = 'First‮ draft\u0007'
    })
    edited(skill, HAIKU_V0, 'report.json', (r) => {
      for (const result of r.results)
        for (const rule of result.packs.generic.adherence.rules)
          if (rule.text === QUOTE_RULE) rule.text = `\u001b[31m${QUOTE_RULE}\u001b]0;owned\u0007`
    })
    const { text } = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    // No control but the line feeds between lines, and no direction override or isolate.
    const acted = [...text].filter((c) => {
      const n = c.codePointAt(0) ?? 0
      return (
        (n < 0x20 && n !== 0x0a) ||
        (n >= 0x7f && n <= 0x9f) ||
        (n >= 0x202a && n <= 0x202e) ||
        (n >= 0x2066 && n <= 0x2069)
      )
    })
    expect(acted).toEqual([])
    expect(text.split('\n').slice(0, 1)).toEqual([`Run: ${HAIKU_V0} (v0 · First draft)`])
    expect(text).toContain(
      `[email-quote] Launch email, a quote that gives orders\n  missed: ${QUOTE_RULE}\n`,
    )
  })
})

describe('the case head of --brief', () => {
  /** The ids at the start of the case lines `--brief` printed: what an agent passes to `--cases`. */
  const idsIn = (lines: readonly string[]): string[] =>
    lines.flatMap((line) => /^\[([^\]]+)\]/.exec(line)?.[1] ?? [])

  it('is the id in brackets, then the name, once where the two are the same text', () => {
    expect(caseHead('email-quote', 'Launch email, a quote')).toBe(
      '[email-quote] Launch email, a quote',
    )
    expect(caseHead('short-note', 'short-note')).toBe('[short-note]')
  })

  it('gives each case its id once, whatever its name holds, one with no title and one since deleted too', async () => {
    const skill = notesSkill()
    const long = 'a-case-whose-id-runs-to-forty-characters'
    expect(long).toHaveLength(40)
    const add = (id: string, prompt: string, yaml?: string) => {
      mkdirSync(join(skill, 'evals/cases', id), { recursive: true })
      writeFileSync(join(skill, 'evals/cases', id, 'prompt.md'), prompt)
      if (yaml) writeFileSync(join(skill, 'evals/cases', id, 'case.yaml'), yaml)
    }
    add(long, 'Write a long note.', 'title: "[email-quote] Notes: long [draft]"\n')
    add('untitled', 'Write a note with no title.')
    ends.list = ['note', 'note', 'note', 'note', 'note', 'note']
    await quietRun(skill)
    const [name] = runsOf(skill)
    const heads = [
      `[${long}] [email-quote] Notes: long [draft]`,
      '[short-note] A short note',
      '[untitled] Write a note with no title.',
    ]
    // The case heads alone: not the lines naming the run above them and what it spent below, nor the missed lines.
    const lines = (printed: string) =>
      printed
        .split('\n')
        .slice(1, -1)
        .filter((line) => !line.startsWith('  '))
    const first = await printedBy(report, [skill], { run: name, brief: true })
    expect(lines(first.text).map((line) => line.split(': every attempt')[0])).toEqual(heads)
    // An id stands at the start of its case's line alone: one a line, and only there.
    expect(idsIn(first.text.split('\n'))).toEqual([long, 'short-note', 'untitled'])
    expect(first.text.split(long)).toHaveLength(2)
    // What it read is what `--cases` takes.
    printed = []
    ends.list = ['note', 'note']
    await quietRun(skill, { cases: idsIn(first.text.split('\n')).slice(1, 2).join(',') })
    const second = runsOf(skill).find((run) => run !== name) ?? ''
    expect(readRun(skill, second).meta?.cases).toEqual(['short-note'])
    // A case deleted since is named as the run kept it.
    rmSync(join(skill, 'evals/cases/untitled'), { recursive: true })
    const after = await printedBy(report, [skill], { run: name, brief: true })
    expect(lines(after.text).map((line) => line.split(': every attempt')[0])).toEqual(heads)
  })
})

describe('how a run is named', () => {
  const SONNET_V1 = '2026-11-20-skill-v1-claude-sonnet'
  const WITHOUT = '2026-11-20-skill-v0-claude-sonnet-without-skill'

  it('heads plain report and compare with each run and the version it ran, and leaves the rest as it was', async () => {
    const skill = copyOf('launch-note')
    const one = await printedBy(report, [skill], { run: SONNET_V1 })
    expect(one.text.split('\n').slice(0, 3)).toEqual([
      `Run: ${SONNET_V1} (v1 · Second draft)`,
      '',
      expect.stringMatching(/^sample +case +adherence/),
    ])
    const two = await printedBy(compare, [skill, WITHOUT, SONNET_V1], {})
    expect(two.text.split('\n').slice(0, 4)).toEqual([
      `A: ${WITHOUT} (without the skill)`,
      `B: ${SONNET_V1} (v1 · Second draft)`,
      '',
      expect.stringMatching(/^sample +total +adherence/),
    ])
  })

  it('names each run in the JSON of report and compare, beside what was there', async () => {
    const skill = copyOf('launch-note')
    const one = JSON.parse((await printedBy(report, [skill], { run: SONNET_V1, json: true })).text)
    expect(one.run).toEqual({
      name: SONNET_V1,
      version: 'v1',
      versionName: 'Second draft',
      configuration: 'with_skill',
    })
    expect(one.results).toHaveLength(6)
    const two = JSON.parse(
      (await printedBy(compare, [skill, WITHOUT, SONNET_V1], { json: true })).text,
    )
    expect([two.a, two.b.versionName]).toEqual([
      { name: WITHOUT, version: null, versionName: null, configuration: 'without_skill' },
      'Second draft',
    ])
    expect(Object.keys(two)).toEqual(['rows', 'left', 'notes', 'cases', 'a', 'b', 'spent'])
  })

  it('reads a version name that is not text as none, in report, grade and a run made after it', async () => {
    const skill = copyOf('launch-note')
    edited(skill, HAIKU_V0, 'run.json', (m) => {
      m.skillName = 5
    })
    const { code, text } = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(code).toBe(0)
    // v0's name is read from its first run, which holds none now.
    expect(text.split('\n')[0]).toBe(`Run: ${HAIKU_V0} (v0)`)
    const notes = notesSkill()
    ends.list = ['note']
    const values = { engine: 'fake', name: 'first', parallel: '1', 'no-jev': true, quiet: true }
    await run.run(contextOf([notes], values, null))
    const [first] = runsOf(notes)
    const path = join(notes, 'evals/runs', first, 'run.json')
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), skillName: 5 }))
    const { grade } = await import('./grade.ts')
    printed = []
    expect(await grade.run(contextOf([notes], { run: first, 'no-jev': true }, null))).toBe(0)
    expect(printed[0]).toBe(`\n${first} (v0)`)
    // The same files run again as v0, named by nothing now, and the run is named after its agents are done.
    printed = []
    ends.list = ['note']
    expect(await run.run(contextOf([notes], { ...values, name: undefined }, null))).toBe(0)
    const second = runsOf(notes).find((r) => r !== first) ?? ''
    expect(printed[0]).toBe(`Run: ${join(notes, 'evals/runs', second)} (v0)`)
  })

  it('names the version on the Run line of st run, the line of st grade, and in their JSON, never before it', async () => {
    const skill = notesSkill()
    ends.list = ['note', 'note']
    const values = { engine: 'fake', name: 'first', parallel: '1', 'no-jev': true, quiet: true }
    await run.run(contextOf([skill], values, null))
    const [name] = runsOf(skill)
    expect(printed[0]).toBe(`Run: ${join(skill, 'evals/runs', name)} (v0 · first)`)
    printed = []
    ends.list = ['note']
    await run.run(contextOf([skill], { ...values, json: true }, null))
    const second = runsOf(skill).find((r) => r !== name) ?? ''
    // JSON alone: the Run line is not printed before it.
    expect(printed).toHaveLength(1)
    expect(JSON.parse(printed[0]).run).toEqual({
      name: second,
      version: 'v0',
      versionName: 'first',
      configuration: 'with_skill',
    })
    // Graded without Jev: a grading that asked no model, kept as such.
    expect(JSON.parse(printed[0]).spent).toMatchObject({
      attempts: 1,
      graded: true,
      grading: { calls: [], whole: true },
    })
    // Not graded, the JSON still names the run it made.
    printed = []
    ends.list = ['note']
    await run.run(contextOf([skill], { ...values, json: true, 'no-grade': true }, null))
    expect(printed).toHaveLength(1)
    expect(JSON.parse(printed[0])).toMatchObject({
      run: { version: 'v0', versionName: 'first' },
      spent: { attempts: 1, graded: false, grading: null },
    })
    const { grade } = await import('./grade.ts')
    printed = []
    await grade.run(contextOf([skill], { run: name, 'no-jev': true }, null))
    expect(printed[0]).toBe(`\n${name} (v0 · first)`)
    printed = []
    await grade.run(contextOf([skill], { run: name, 'no-jev': true, json: true }, null))
    expect(printed[0]).toBe(`\n${name}`)
    expect(JSON.parse(printed[1]).run.versionName).toBe('first')
  })
})

describe('rules and checks --brief says were not sure', () => {
  const HAIKU_V1 = '2026-11-20-skill-v1-claude-haiku'
  /** Every fact one output of a stored grading was asked: its rules, then its checks. */
  const factsOf = (r: Stored, sample: string): Stored[] => {
    const generic = r.results.find((x: { sample: string }) => x.sample === sample).packs.generic
    return [...generic.adherence.rules, ...generic.rubric.statements]
  }
  /** One fact of an output, by id, in a stored grading. */
  const factOf = (r: Stored, sample: string, id: string): Stored =>
    factsOf(r, sample).find((f) => f.id === id)
  /** The head line `--brief` printed for a case. */
  const headOf = (text: string, id: string): string | undefined =>
    text.split('\n').find((line) => line.startsWith(`[${id}]`))

  it('says how many were not sure beside "nothing missed", and with a miss, without printing their words', async () => {
    const skill = copyOf('launch-note')
    const { text } = await printedBy(report, [skill], { run: HAIKU_V1, brief: true })
    // A miss and two rules not sure, one Jev's and one code's.
    expect(text).toContain(
      '[email-crowded] Launch email, six features: 2 of 16 not sure\n  missed: Write no more than 120 words. Most readers stop after the first screen.\n',
    )
    expect(headOf(text, 'email-free')).toBe(
      '[email-free] Launch email, no price: nothing missed, 1 of 16 not sure',
    )
    expect(text).not.toContain('Write plain text with no Markdown')
    // Plain report says which they were, by their words.
    const plain = await printedBy(report, [skill], { run: HAIKU_V1 })
    expect(plain.text).toContain(
      "rule not counted, code could not settle it (differ) (Rules for every announcement): Open with the brief's Headline",
    )
    expect(plain.text).toContain(
      'rule not counted, Jev was not sure (Rules for an email): Write plain text with no Markdown',
    )
  })

  it('does not say "nothing missed" of a case whose every rule and check was not sure, nor count them where it says why', async () => {
    const skill = copyOf('launch-note')
    edited(skill, HAIKU_V0, 'report.json', (r) => {
      for (const fact of factsOf(r, 'email-free-s1'))
        if (!fact.unmarkable) {
          fact.noul = 0.5
          delete fact.code
        }
    })
    const { text } = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(headOf(text, 'email-free')).toBe(
      // With nothing marked the output has no score, and the words for that win.
      '[email-free] Launch email, no price: not scored, none of its rules or checks could be counted',
    )
  })

  it('counts each rule or check once over several attempts, and says one not sure on any of them counts', async () => {
    const skill = copyOf('launch-note')
    const runDir = join(skill, 'evals/runs', HAIKU_V0)
    cpSync(join(runDir, 'email-free-s1'), join(runDir, 'email-free-s2'), { recursive: true })
    edited(skill, HAIKU_V0, 'report.json', (r) => {
      const first = r.results.find((x: { sample: string }) => x.sample === 'email-free-s1')
      r.results.push({ ...structuredClone(first), sample: 'email-free-s2' })
      factOf(r, 'email-free-s2', 'r5').noul = 0.5
    })
    edited(skill, HAIKU_V0, 'run.json', (m) => {
      const first = m.samples.find((s: { dir: string }) => s.dir === 'email-free-s1')
      m.samples.push({ ...first, dir: 'email-free-s2', index: 2 })
    })
    const { text } = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(headOf(text, 'email-free')).toBe(
      '[email-free] Launch email, no price: nothing missed, 1 of 11 not sure at least once',
    )
  })

  it('says it of A and of B in compare, each of its own run', async () => {
    const skill = copyOf('launch-note')
    const { text } = await printedBy(compare, [skill, HAIKU_V0, HAIKU_V1], { brief: true })
    expect(headOf(text, 'email-price')).toBe(
      '[email-price] Launch email, with a price: neither did better, nothing missed; in A, 1 of 11 not sure; in B, 1 of 16 not sure',
    )
    expect(headOf(text, 'email-free')).toBe(
      '[email-free] Launch email, no price: neither did better, nothing missed; in B, 1 of 16 not sure',
    )
  })

  it('says only what became of an attempt not read whole, as before, and never "nothing missed" there', async () => {
    const skill = copyOf('launch-note')
    edited(skill, HAIKU_V0, 'report.json', (r) => {
      // Read in part, and another of its rules not sure; and an answer that wrote nothing.
      factOf(r, 'page-long-s1', 'r5').parts = [0.5, 0.5]
      r.results.find((x: { sample: string }) => x.sample === 'email-free-s1').blank = true
      factOf(r, 'email-free-s1', 'r5').noul = 0.5
    })
    const one = await printedBy(report, [skill], { run: HAIKU_V0, brief: true })
    expect(headOf(one.text, 'page-long')).toBe(
      '[page-long] Changes page, 180 changes: 3 rules and checks not read',
    )
    expect(headOf(one.text, 'email-free')).toBe(
      '[email-free] Launch email, no price: wrote nothing',
    )
    const two = await printedBy(compare, [skill, HAIKU_V0, HAIKU_V1], { brief: true })
    // B's own rule not sure is not said either where A's attempt was not read whole.
    expect(headOf(two.text, 'email-free')).toBe(
      '[email-free] Launch email, no price: no checks to compare; in A, wrote nothing',
    )
  })

  it('reads a grading kept from before code or headings answered as its own answers say, as plain report does', async () => {
    const skill = copyOf('launch-note')
    // As a grading made before code read rules, or Jev was asked whether a heading applies.
    edited(skill, HAIKU_V1, 'report.json', (r) => {
      for (const result of r.results)
        for (const fact of factsOf(r, result.sample)) {
          delete fact.code
          delete fact.applies
          delete fact.comesUp
        }
    })
    const brief = await printedBy(report, [skill], { run: HAIKU_V1, brief: true })
    const plain = await printedBy(report, [skill], { run: HAIKU_V1 })
    // Each output's "N not sure" in plain report's counts, rules and checks added up, by case.
    const plainUnsure = new Map(
      [...plain.text.matchAll(/^ {2}(\S+)-s1 +checks (.*?) {2,}rules (.*)$/gm)].map((m) => [
        m[1],
        [m[2], m[3]].reduce(
          (sum, count) => sum + Number(/(\d+) not sure/.exec(count)?.[1] ?? 0),
          0,
        ),
      ]),
    )
    const briefUnsure = new Map(
      brief.text
        .split('\n')
        .flatMap((line) => /^\[([^\]]+)\]/.exec(line)?.[1] ?? [])
        .map((id) => [
          id,
          Number(/(\d+) of \d+ not sure/.exec(headOf(brief.text, id) ?? '')?.[1] ?? 0),
        ]),
    )
    // page-long is read in part, so what became of it is said in place of a count.
    plainUnsure.delete('page-long')
    briefUnsure.delete('page-long')
    expect(briefUnsure).toEqual(plainUnsure)
    // Without code's word, the rules code settled or could not settle stand on Jev's answers, met here;
    // without the headings' answers, every rule is asked of every case.
    expect(headOf(brief.text, 'email-crowded')).toBe(
      '[email-crowded] Launch email, six features: nothing missed, 1 of 21 not sure',
    )
  })
})

describe('what a run spent', () => {
  /** Keep `cost` as a run's gradings would have kept it, in its file. */
  const keepCost = (skill: string, run: string, cost: Stored) =>
    writeFileSync(join(skill, 'evals/runs', run, GRADING_COST_FILE), JSON.stringify(cost))
  const HAIKU_V1 = '2026-11-20-skill-v1-claude-haiku'
  const WITHOUT = '2026-11-20-skill-v0-claude-sonnet-without-skill'
  const ALL = [
    'email-crowded-s1',
    'email-free-s1',
    'email-price-s1',
    'email-quote-s1',
    'page-basic-s1',
    'page-long-s1',
  ]
  /** The line a report ends with. */
  const spentIn = async (skill: string, run: string, more: Values = {}) =>
    (await printedBy(report, [skill], { run, ...more })).text.split('\n').at(-1)
  /** A stored attempt's timing.json, read here apart from the command. */
  const timingOf = (skill: string, run: string, sample: string): Stored =>
    JSON.parse(readFileSync(join(skill, 'evals/runs', run, sample, 'timing.json'), 'utf8'))
  /** The attempts' timing.json files of a stored run, added up here apart from the command. */
  function summed(skill: string, run: string, samples: readonly string[]) {
    const timings = samples.map((sample) => timingOf(skill, run, sample))
    const add = (of: (t: Stored) => number) => timings.reduce((n, t) => n + of(t), 0)
    return {
      ms: add((t) => t.durationMs),
      input: add((t) => t.tokens.input).toLocaleString('en-US'),
      output: add((t) => t.tokens.output).toLocaleString('en-US'),
      usd: add((t) => t.costUsd),
    }
  }

  it('adds up each attempt’s answer, in plain report and in --brief, and says its grading kept no cost', async () => {
    const skill = copyOf('launch-note')
    const sum = summed(skill, HAIKU_V1, ALL)
    const line = `Spent: answering 6 attempts, ${Math.round(sum.ms / 1000)} s, ${sum.input} input and ${sum.output} output tokens, $${sum.usd.toFixed(4)}; ${OLD}`
    expect(await spentIn(skill, HAIKU_V1, { brief: true })).toBe(line)
    const plain = (await printedBy(report, [skill], { run: HAIKU_V1 })).text.split('\n')
    expect(plain.slice(-2)).toEqual(['', line])
  })

  it('says over how many attempts a figure is counted, for one with no timing.json and one stopped half way', async () => {
    const skill = copyOf('launch-note')
    // Cut off before its agent ended: no timing.json.
    const cut = join(skill, 'evals/runs', HAIKU_V1, 'page-long-s1/timing.json')
    rmSync(cut)
    expect(await spentIn(skill, HAIKU_V1)).toMatch(
      / s for 5 of them, [\d,]+ input and [\d,]+ output tokens for 5 of them, \$[\d.]+ for 5 of them; /,
    )
    // Stopped: its agent was ended, so it kept its time but no tokens and no price.
    const stopped = timingOf(skill, HAIKU_V1, 'page-basic-s1')
    writeFileSync(
      join(skill, 'evals/runs', HAIKU_V1, 'page-basic-s1/timing.json'),
      JSON.stringify({ ...stopped, tokens: null, costUsd: null }),
    )
    edited(skill, HAIKU_V1, 'run.json', (m) => {
      const sample = m.samples.find((s: { dir: string }) => s.dir === 'page-basic-s1')
      Object.assign(sample, { stopped: true, tokens: null, costUsd: null })
    })
    const sum = summed(skill, HAIKU_V1, ALL.slice(0, 4))
    const seconds = Math.round((sum.ms + stopped.durationMs) / 1000)
    expect(await spentIn(skill, HAIKU_V1)).toBe(
      `Spent: answering 6 attempts, ${seconds} s for 5 of them, ${sum.input} input and ${sum.output} output tokens for 4 of them, $${sum.usd.toFixed(4)} for 4 of them; ${OLD}`,
    )
  })

  it('says no price where no attempt kept one, never a nought', async () => {
    const skill = copyOf('launch-note')
    for (const sample of ALL)
      writeFileSync(
        join(skill, 'evals/runs', HAIKU_V1, sample, 'timing.json'),
        JSON.stringify({ ...timingOf(skill, HAIKU_V1, sample), costUsd: null }),
      )
    const line = await spentIn(skill, HAIKU_V1)
    expect(line).toMatch(/ output tokens, no price kept; /)
    expect(line).not.toContain('$')
  })

  it('counts the answers of a run without the skill as any run’s', async () => {
    const skill = copyOf('launch-note')
    const sum = summed(skill, WITHOUT, ALL)
    expect(await spentIn(skill, WITHOUT)).toBe(
      `Spent: answering 6 attempts, ${Math.round(sum.ms / 1000)} s, ${sum.input} input and ${sum.output} output tokens, $${sum.usd.toFixed(2)}; ${OLD}`,
    )
  })

  it('counts what the gradings kept, a grading again among them, and says what is not in it', async () => {
    const skill = copyOf('launch-note')
    const calls = (n: number, source: 'asked' | 'replayed' = 'asked') => ({
      operation: 'grade',
      provider: 'jev',
      model: 'jev-1.14.0',
      source,
      calls: n,
      input: 1000 * n,
      output: 0,
      seconds: 1.5 * n,
    })
    const kept = (gradingCost: Stored) => keepCost(skill, HAIKU_V1, gradingCost)
    // Two gradings of 3 and 5 calls, the second added to the first, as a grading again keeps them.
    kept({ calls: [calls(8)], whole: true })
    expect(await spentIn(skill, HAIKU_V1, { brief: true })).toMatch(
      /; grading, 8 calls to Jev, 8,000 input tokens, 12 s$/,
    )
    kept({ calls: [calls(3), calls(5, 'replayed')], whole: false })
    expect(await spentIn(skill, HAIKU_V1, { brief: true })).toMatch(
      /; grading, 3 calls to Jev, 3,000 input tokens, 4.5 s, 5 replayed from saved replies, which cost nothing, and an earlier grading not counted$/,
    )
    kept({ calls: [], whole: true })
    expect(await spentIn(skill, HAIKU_V1, { brief: true })).toMatch(/; grading, no model calls$/)
  })

  it('reads a grading cost kept in another shape as not kept: never a crash, never a wrong number', async () => {
    const skill = copyOf('launch-note')
    const good = {
      operation: 'grade',
      provider: 'jev',
      model: 'jev-1.14.0',
      source: 'asked',
      calls: 2,
      input: 900,
      output: 0,
      seconds: 1,
    }
    const shapes: Stored[] = [
      { whole: true },
      5,
      'x',
      null,
      { calls: [null], whole: true },
      { calls: [good], whole: 'yes' },
      { calls: [{ ...good, input: '900' }], whole: true },
      { calls: [{ ...good, calls: -1 }], whole: true },
      { calls: [{ ...good, calls: 1.5 }], whole: true },
      { calls: [{ ...good, seconds: Number.NaN }], whole: true },
      { calls: [{ ...good, source: 'guessed' }], whole: true },
    ]
    for (const shape of shapes) {
      keepCost(skill, HAIKU_V1, shape)
      const line = await spentIn(skill, HAIKU_V1, { brief: true })
      expect(line, JSON.stringify(shape)).toMatch(new RegExp(`; ${OLD}$`))
      const json = JSON.parse(
        (await printedBy(report, [skill], { run: HAIKU_V1, json: true })).text,
      )
      expect(json.spent.grading).toBeNull()
      expect(json).not.toHaveProperty('gradingCost')
      const two = await printedBy(compare, [skill, HAIKU_V0, HAIKU_V1], { brief: true })
      expect(two.text).toMatch(new RegExp(`\\nB spent: .*; ${OLD}\\n`))
    }
    // The same in its shape is read and counted.
    keepCost(skill, HAIKU_V1, { calls: [good], whole: true })
    expect(await spentIn(skill, HAIKU_V1, { brief: true })).toMatch(
      /; grading, 2 calls to Jev, 900 input tokens, 1 s$/,
    )
  })

  it('carries the totals in the JSON of report and compare, beside what was there', async () => {
    const skill = copyOf('launch-note')
    const one = JSON.parse((await printedBy(report, [skill], { run: HAIKU_V1, json: true })).text)
    expect(one.spent).toMatchObject({
      attempts: 6,
      answering: { seconds: { attempts: 6 }, tokens: { attempts: 6 }, usd: { attempts: 6 } },
      graded: true,
      grading: null,
    })
    expect(one.results).toHaveLength(6)
    const two = JSON.parse(
      (await printedBy(compare, [skill, WITHOUT, HAIKU_V1], { json: true })).text,
    )
    expect(two.spent.b).toEqual(one.spent)
    expect(two.spent.a.answering.usd.total).toBeCloseTo(0.371141, 6)
  })

  it('ends plain compare with what A and B spent, before the Open line', async () => {
    const skill = copyOf('launch-note')
    const lines = (await printedBy(compare, [skill, WITHOUT, HAIKU_V1], {})).text.split('\n')
    expect(lines.slice(-5)).toEqual([
      '',
      expect.stringMatching(/^A spent: answering 6 attempts, 94 s, /),
      expect.stringMatching(/^B spent: answering 6 attempts, 111 s, /),
      '',
      expect.stringMatching(/^Open: /),
    ])
  })
})
