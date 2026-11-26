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
import { caseHead } from './brief.ts'
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
      '[email-crowded] Launch email, six features: nothing missed',
      '[email-free] Launch email, no price: nothing missed',
      '[email-price] Launch email, with a price: nothing missed',
      '[email-quote] Launch email, a quote that gives orders',
      `  missed: ${QUOTE_RULE}`,
      '[page-basic] Launch page: nothing missed',
      // A long output read in part: what was not read is said, never "nothing missed".
      '[page-long] Changes page, 180 changes: 3 rules and checks not read',
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
      '[email-crowded] Launch email, six features: not scored, grading failed: the network was down',
      '[email-free] Launch email, no price: wrote nothing',
      '[email-price] Launch email, with a price: could not be read',
      '[email-quote] Launch email, a quote that gives orders: its folder was removed',
      '[page-basic] Launch page: failed, it ran out of time (after 600 s)',
      '[page-long] Changes page, 180 changes: no attempt ran',
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
      '[email-crowded] Launch email, six features: neither did better, nothing missed',
      '[email-free] Launch email, no price: neither did better, nothing missed',
      '[email-price] Launch email, with a price: neither did better, nothing missed',
      '[email-quote] Launch email, a quote that gives orders: neither did better',
      `  B missed: ${QUOTE_RULE}`,
      '[page-basic] Launch page: B did better',
      '  A missed: The page states the price as 12 USD a month.',
      "  B missed: Open with the brief's Headline, word for word. A reworded headline is one the team did not approve.",
      '[page-long] Changes page, 180 changes: no checks to compare; in A, 1 rule or check not read; in B, 4 rules and checks not read',
      '',
      `Open: pnpm st open ${skill} --a ${runs[0]} --b ${runs[1]}`,
    ])
  })

  it('says once what both runs missed', async () => {
    const skill = copyOf('launch-note')
    const runs = [HAIKU_V0, '2026-11-20-skill-v1-claude-haiku']
    const { text } = await printedBy(compare, [skill, ...runs], { brief: true })
    expect(text).toContain(
      `[email-quote] Launch email, a quote that gives orders: neither did better\n  A and B missed: ${QUOTE_RULE}\n`,
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
      '[email-free] Launch email, no price: only B answered it, nothing missed',
    )
    expect(lines).toContain(
      '[page-long] Changes page, 180 changes: only A answered it; in A, 3 rules and checks not read; in B, its folder was removed',
    )
  })
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
 * its id counted as though it were `LONGEST_ID` characters long. A case runs
 * from its head's line to the next case's: every line between counts,
 * whatever it holds. Only the words on a missed line that are a rule or check
 * the runs were graded on are left out of the count. Past the last case only
 * a blank line and the Open line may follow, and nothing after it.
 */
function bytesByCase(
  text: string,
  cases: ReadonlyArray<{ id: string; head: string }>,
  words: Set<string>,
): number[] {
  const lines = text.split('\n')
  const body = lines.at(-1)?.startsWith('Open: ') ? lines.slice(0, -1) : lines
  if (body !== lines) {
    expect(body.at(-1)).toBe('')
    body.pop()
  }
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
        for (const bytes of bytesByCase(text, caseHeadsOf(skill, named), factWords(skill, named))) {
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
      '[short-note] A short note: attempt 1 not scored, the skill has no rules and the case has no checks; attempt 2 failed, it ended with an error (signed out)',
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
      '[short-note] A short note: every attempt failed, it ended with an error (signed out)',
    )
  })

  it('with --no-grade still names each case, and says it was not graded', async () => {
    const skill = notesSkill()
    ends.list = ['note', 'note']
    expect(await quietRun(skill, { 'no-grade': true })).toBe(0)
    expect(printed[0]).toBe('[short-note] A short note: every attempt not graded')
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
      for (const bytes of bytesByCase(text, caseHeadsOf(skill, named), factWords(skill, named)))
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
    expect(text.split('\n').slice(3, 9)).toEqual([
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
    // Nothing but a head, the blank line before the Open line and the Open line starts at the margin.
    for (const line of text.split('\n'))
      expect(
        line === '' ||
          line.startsWith('Open: ') ||
          /^\[[^\]]+\]/.test(line) ||
          line.startsWith('  '),
        line,
      ).toBe(true)
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
    const lines = (printed: string) => printed.split('\n').filter((line) => !line.startsWith('  '))
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
