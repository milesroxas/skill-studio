/**
 * `st read` asks Jev again first. On a copy of `fixtures/launch-note`, whose
 * stored gradings left the long page's facts not read (its parts join each as
 * a whole) and one email's word count to code, which would not call it, a
 * stand-in Jev is asked again each fact a narrower state can be built for,
 * and a stand-in assistant is asked only what Jev is still not sure of.
 */
import { spawnSync } from 'node:child_process'
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
import type { Artifact, Case } from '@domain/schemas.ts'
import { replyKey } from '@infrastructure/ai/metered.ts'
import type { AiRequest } from '@infrastructure/ai/types.ts'
import { putPage } from '@infrastructure/reading-room.ts'
import { askAgain } from '@judges/generic/index.ts'
import type { JevAsker } from '@judges/jev.ts'
import type { JudgeInput } from '@judges/types.ts'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gradeRows } from '../../scripts/reading-bench/count.ts'

/** The assistant: every request it was sent, and how it answers each. */
const assistant = vi.hoisted(() => ({
  requests: [] as Array<{ text: string; request: AiRequest }>,
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: async (request: AiRequest) => {
      const text = request.messages[0]?.text ?? ''
      assistant.requests.push({ text, request })
      // "met" on every fact the sheet asks, with no quote.
      const marks = asked(sheetOf(text)).map(({ output, fact }) => ({
        output,
        fact,
        answer: 'met',
        why: 'It does.',
        file: '',
        quote: '',
      }))
      return {
        text: JSON.stringify({ marks, findings: [], note: 'Read.' }),
        model: 'claude-test',
        usage: { input: 1000, output: 10 },
      }
    },
  }),
}))
vi.mock('@infrastructure/ai/store.ts', () => ({ recordUsage: () => {} }))

const { readingOfRun } = await import('./reading.ts')

const ROOT = resolve(import.meta.dirname, '../..')
const FIXTURE = join(ROOT, 'fixtures', 'launch-note')
/** Version one, written by Sonnet: the run the reading bench reads first. */
const RUN = '2026-11-20-skill-v0-claude-sonnet'
/** The run without the skill: the other the reading bench reads. */
const WITHOUT = '2026-11-20-skill-v0-claude-sonnet-without-skill'
const PAGE = join('evals', 'runs', RUN, 'page-long-s1', 'outputs', 'index.html')
const REPLIES = join(ROOT, 'scripts', 'reading-bench', 'replies')

/** Two of version one's rules, by the names their verdicts go under. */
const ONE_FILE =
  'rule:Write one file with its styles in a <style> tag, no script and no outside file. The page is pasted into a CMS that strips both.'
const NO_MARKDOWN =
  'rule:Write plain text with no Markdown: no #, no ** and no list marks (-, * or •). Most mail apps show the marks as they are typed.'

/** The page's main column, as the window measured it: 640 px wide, its words at 18px. */
const layoutElement = {
  parent: 0,
  name: 'main',
  text: 'Everything that changed',
  x: 320,
  y: 0,
  width: 640,
  height: 900,
  scale: 1,
  unscaled: null,
  background: null,
  color: '#0b3d5c (hsl 203 79% 20%)',
  font: '18px',
  radius: null,
  padding: null,
  border: null,
  gap: null,
  shadows: 0,
}

/** The run's stored report on a copy, changed by `change` and written back. */
function changeReport(
  dir: string,
  run: string,
  change: (result: { graded: { drawn?: boolean } }) => void,
) {
  const path = join(dir, 'evals', 'runs', run, 'report.json')
  const report = JSON.parse(readFileSync(path, 'utf8'))
  change(report.results.find((r: { sample: string }) => r.sample === 'page-long-s1'))
  writeFileSync(path, JSON.stringify(report))
  return report
}

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/**
 * The reply keys the baseline saved for the long page, read without the
 * skill and with it, when the assistant was sent all Jev left: nothing asks
 * for them since, so their files were taken out of `replies/`.
 */
const LONG_PAGE_KEYS = {
  [RUN]: 'e2de33df6133ba7bf960808c7dd025a49183addbaf1002e4f1e6458aa23217df',
  [WITHOUT]: 'a2ec4a3de4ed5a5ff598bd263df327aba22af81cff1c18aad989587c9c9a911c',
}

/**
 * Run `st` with `args` under a replay of the baseline's replies, which asks
 * nobody: no assistant on the PATH (every spelling of it goes), no key, and
 * Settings of its own.
 */
function stReplayed(args: readonly string[]) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', join('src', 'interfaces', 'cli', 'st.ts'), ...args],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATH'),
        ),
        PATH: scratchDir('st-reading-again-path-'),
        ANTHROPIC_API_KEY: '',
        SKILL_STUDIO_ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: '',
        SKILL_STUDIO_OPENAI_API_KEY: '',
        TYPESAFE_API_KEY: '',
        ST_AI_RECORD: '',
        ST_AI_REPLAY: REPLIES,
        ST_AI_REPLAY_LOG: '',
        SKILL_STUDIO_HOME: scratchDir('st-reading-again-home-'),
      },
    },
  )
}

/** A new empty folder, taken out when the tests end. */
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  made.push(dir)
  return dir
}

/** A new copy of launch-note: the fixture is never read from in place. */
function copy(): string {
  const parent = mkdtempSync(join(tmpdir(), 'st-reading-again-'))
  made.push(parent)
  const dir = join(parent, 'launch-note')
  cpSync(FIXTURE, dir, { recursive: true })
  return dir
}

/** The sheet in a message: the text of its `sheet.md` block. */
function sheetOf(text: string): string {
  const start = text.indexOf('<file path="sheet.md">\n')
  if (start < 0) return ''
  const from = start + '<file path="sheet.md">\n'.length
  return text.slice(from, text.indexOf('\n</file>', from))
}

/** Each fact a sheet asks, by its output and its short name. */
function asked(sheet: string): Array<{ output: string; fact: string }> {
  return sheet
    .split(/^# Output /m)
    .slice(1)
    .flatMap((part) => {
      const output = part.slice(0, part.indexOf('\n'))
      const answer = part.split('## Answer each of these\n')[1]?.split('\n\n')[0] ?? ''
      return [...answer.matchAll(/^- ([RC]\d+)/gm)].map((m) => ({ output, fact: m[1] }))
    })
}

/** Each request Jev was asked: its state and its questions' names. */
type Asked = { state: Record<string, unknown>; questions: string[] }

/** A stand-in Jev that answers each question by its name, and keeps what it was asked. */
function jevOf(noul: (name: string, state: Record<string, unknown>) => number): {
  jev: JevAsker
  asked: Asked[]
} {
  const asked: Asked[] = []
  const jev = {
    model: 'jev-test',
    ask: async (state: unknown, questions: Record<string, unknown>) => {
      const held = state as Record<string, unknown>
      asked.push({ state: held, questions: Object.keys(questions) })
      return Object.fromEntries(
        Object.keys(questions).map((name) => [name, { noul: noul(name, held) }]),
      )
    },
  } as unknown as JevAsker
  return { jev, asked }
}

const options = (over: Partial<Parameters<typeof readingOfRun>[2]> = {}) => ({
  provider: 'claude-code' as const,
  model: 'sonnet',
  effort: '',
  cases: [],
  blind: false,
  inline: true,
  parallel: 1,
  log: () => {},
  signal: new AbortController().signal,
  ...over,
})

/** The sheet sent for one case, by the output it names. */
const sheetFor = (output: string): string =>
  sheetOf(assistant.requests.find((r) => r.text.includes(`# Output ${output}`))?.text ?? '')

beforeEach(() => {
  assistant.requests = []
})

describe('st read asks Jev again first', () => {
  it('asks a long output whole, and the assistant only the rest', async () => {
    const dir = copy()
    const { jev, asked: jevAsked } = jevOf((name) => (name === 'C1' ? 0.5 : 0.95))
    const answers = {
      'page-long-s1': { [ONE_FILE]: true },
      'email-free-s1': { [NO_MARKDOWN]: false },
    }
    const reading = await readingOfRun(dir, RUN, options({ jev, answers }))
    // One request: the long page read whole.
    expect(jevAsked.map((a) => a.questions)).toEqual([['R5', 'R7', 'C1']])
    const [{ state: page }] = jevAsked
    expect(page.output).toBe(readFileSync(join(dir, PAGE), 'utf8'))
    // Read whole, it is no part, so nothing says it is one.
    expect(page.fields).not.toHaveProperty('output')
    // The email whose open rule no narrower state holds goes to the assistant as it did.
    expect(asked(sheetFor('email-free-s1'))).toEqual([{ output: 'email-free-s1', fact: 'R7' }])
    // Of the long page, only what Jev is still not sure of; the rest are shown as marked.
    const sheet = sheetFor('page-long-s1')
    expect(asked(sheet)).toEqual([{ output: 'page-long-s1', fact: 'C1' }])
    expect(sheet).toMatch(/## Already marked, for you to know\n[^#]*- R5[^\n]*\[met\]/)
    expect(reading.cases.find((c) => c.case === 'page-long')?.marks).toMatchObject([
      { fact: { ref: 'R5' }, jev: { state: 'whole', noul: 0.95 } },
      { fact: { ref: 'R7' }, jev: { state: 'whole' } },
      { fact: { ref: 'C1' }, answer: 'met', evidence: 'unquoted' },
    ])
    expect(reading.again).toEqual({ asked: 3, settled: 2, failed: [] })
    // Every fact Jev left is answered once, by Jev asked again or by the assistant: the totals
    // hold both, and the split tells them apart.
    expect(reading.agreement).toMatchObject({
      asked: 5,
      answered: 5,
      yours: { agree: 1, total: 2 },
      settled: { total: 5 },
    })
    expect(reading.split?.jev).toMatchObject({
      asked: 2,
      answered: 2,
      yours: { agree: 1, total: 1 },
    })
    expect(reading.split?.assistant).toMatchObject({
      asked: 3,
      answered: 3,
      yours: { agree: 0, total: 1 },
    })
  })

  it('leaves a fact code would not call to the assistant, and asks with what code saw where code left it to Jev', async () => {
    const dir = copy()
    const { jev, asked: jevAsked } = jevOf(() => 0.95)
    await readingOfRun(dir, RUN, options({ jev, cases: ['email-crowded'] }))
    // Its counts fall on both sides of 120: Jev's word there would be a guess.
    expect(jevAsked).toEqual([])
    expect(asked(sheetFor('email-crowded-s1'))).toEqual([
      { output: 'email-crowded-s1', fact: 'R2' },
    ])
    // The same counts, where code found what it reads not there, leave the fact to Jev, who was not sure.
    const path = join(dir, 'evals', 'runs', RUN, 'report.json')
    const report = JSON.parse(readFileSync(path, 'utf8'))
    const email = report.results.find((r: { sample: string }) => r.sample === 'email-crowded-s1')
    const words = email.packs.generic.adherence.rules.find((r: { id: string }) => r.id === 'r4')
    words.noul = 0.5
    words.code.why = 'not there'
    writeFileSync(path, JSON.stringify(report))
    assistant.requests = []
    const reading = await readingOfRun(dir, RUN, options({ jev, cases: ['email-crowded'] }))
    expect(jevAsked.map((a) => a.questions)).toEqual([['R2']])
    const [{ state }] = jevAsked
    expect(state.code).toEqual([{ counted: [125, 118, 125, 118], bound: 'at most 120' }])
    expect(state.fields).toHaveProperty('code')
    expect(assistant.requests).toEqual([])
    expect(reading.cases[0].marks).toMatchObject([
      { fact: { ref: 'R2', jev: 'not sure' }, answer: 'met', jev: { state: 'code', noul: 0.95 } },
    ])
  })

  it('asks the assistant nothing for a case Jev settles, and says so', async () => {
    const dir = copy()
    const { jev } = jevOf(() => 0.05)
    const lines: string[] = []
    const reading = await readingOfRun(
      dir,
      RUN,
      options({ jev, cases: ['page-long'], log: (line) => lines.push(line) }),
    )
    expect(assistant.requests).toEqual([])
    expect(lines).toContain(
      'page-long: nothing left to ask the assistant, Jev was sure of every rule and check it was asked again.',
    )
    expect(reading.cases[0]).toMatchObject({ asked: 3, error: null, again: { settled: 3 } })
    expect(reading.cases[0].marks.map((m) => m.answer)).toEqual(['missed', 'missed', 'missed'])
    expect(reading.usage).toEqual({ input: 0, output: 0 })
  })

  it('sends the assistant what it would have, when a request to Jev fails', async () => {
    const dir = copy()
    await readingOfRun(dir, RUN, options())
    const before = assistant.requests.map((r) => r.text)
    assistant.requests = []
    const lines: string[] = []
    const jev = {
      model: 'jev-test',
      ask: async () => {
        throw new Error('TypeSafe is down.')
      },
    } as unknown as JevAsker
    const reading = await readingOfRun(dir, RUN, options({ jev, log: (line) => lines.push(line) }))
    expect(assistant.requests.map((r) => r.text)).toEqual(before)
    expect(reading.again).toEqual({ asked: 3, settled: 0, failed: ['TypeSafe is down.'] })
    expect(lines).toContain(
      'page-long-s1: Jev could not be asked R5, R7, C1 again: TypeSafe is down.',
    )
    expect(reading.agreement).toMatchObject({ asked: 5, answered: 5 })
  })

  it('asks as before with no Jev, and never asks Jev of a blind reading', async () => {
    const dir = copy()
    const without = await readingOfRun(dir, RUN, options())
    const sent = assistant.requests.map((r) => r.text)
    expect(without).not.toHaveProperty('again')
    expect(without).not.toHaveProperty('split')
    expect(without.cases.flatMap((c) => c.marks).some((m) => m.jev)).toBe(false)
    expect(sent).toHaveLength(3)
    assistant.requests = []
    const { jev, asked: jevAsked } = jevOf(() => 0.95)
    const blind = await readingOfRun(dir, RUN, options({ jev, blind: true, cases: ['email-free'] }))
    expect(jevAsked).toEqual([])
    expect(blind).not.toHaveProperty('again')
  })

  it('asks a fact joined at the end of an output too long to read whole of that end alone', async () => {
    const dir = copy()
    // The page made longer than one state holds, and its check of the whole made one about its end.
    const page = readFileSync(join(dir, PAGE), 'utf8')
    const longer = page.replace('<main>', `<main><!--${'x'.repeat(20_000)}-->`)
    writeFileSync(join(dir, PAGE), longer)
    const reportPath = join(dir, 'evals', 'runs', RUN, 'report.json')
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    const result = report.results.find((r: { sample: string }) => r.sample === 'page-long-s1')
    result.packs.generic.rubric.statements[0].span = 'end'
    writeFileSync(reportPath, JSON.stringify(report))
    const { jev, asked: jevAsked } = jevOf(() => 0.5)
    await readingOfRun(dir, RUN, options({ jev, cases: ['page-long'] }))
    // The rules joined as a whole cannot be read whole, and are not asked again.
    expect(jevAsked.map((a) => a.questions)).toEqual([['C1']])
    const [{ state }] = jevAsked
    expect(longer.endsWith(state.output as string)).toBe(true)
    expect((state.output as string).length).toBeLessThan(longer.length)
    expect((state.fields as Record<string, string>).output).toMatch(/the end of the file/)
  })

  it('asks a fact about a measure with the layout the page was measured at, unless the grading held that layout', async () => {
    const dir = copy()
    const renders = join(dir, 'evals', 'runs', RUN, 'page-long-s1', 'renders')
    mkdirSync(renders, { recursive: true })
    writeFileSync(join(renders, 'desktop-1280x960.png'), '')
    writeFileSync(
      join(renders, 'desktop-1280x960.json'),
      JSON.stringify({
        window: [1280, 960],
        page: [1280, 40_000],
        elements: [layoutElement],
        leftOut: 0,
      }),
    )
    // Graded without the page drawn, as the fixture's runs were: the layout kept since is new to Jev.
    const { jev, asked: jevAsked } = jevOf(() => 0.5)
    await readingOfRun(dir, RUN, options({ jev, cases: ['page-long'] }))
    expect(jevAsked.map((a) => a.questions)).toEqual([['R5', 'C1'], ['R7']])
    const { state } = jevAsked[1]
    expect(state.layout).toMatch(/^window 1280 × 960 px/)
    expect(state).not.toHaveProperty('picture')
    expect(state.fields).toHaveProperty('layout')
    expect(jevAsked[0].state).not.toHaveProperty('layout')
    // Graded with it drawn, the grading's state held the layout, and the rest need the page's
    // picture, which is not drawn here: nothing is asked again.
    changeReport(dir, RUN, (result) => {
      result.graded.drawn = true
    })
    jevAsked.length = 0
    await readingOfRun(dir, RUN, options({ jev, cases: ['page-long'] }))
    expect(jevAsked).toEqual([])
  })

  it('gives the case files no more room than the grading gave them, beside a part of a long output', async () => {
    const page: Artifact = { file: 'outputs/index.html', kind: 'html' }
    const input: JudgeInput = {
      text: 'x'.repeat(70_000),
      units: [],
      case: { id: 'c1', prompt: 'Write the page.', graders: [], bench: {} } as unknown as Case,
      images: [],
      requestFiles: [1, 2, 3, 4, 5].map((n) => ({ file: `notes-${n}.md`, text: 'y'.repeat(8000) })),
      rules: [{ id: 'r1', text: 'End the page with a footer.', section: 'Rules' }],
      artifacts: [page],
      primary: page,
      others: [],
      skill: null,
      notes: null,
      transcript: null,
      dir: '/sample',
      renders: [],
    }
    const states: Array<Record<string, unknown>> = []
    await askAgain(
      input,
      [{ name: 'R1', kind: 'rule', id: 'r1', span: 'end', saw: [] }],
      { parted: { read: 2, of: 2 }, drawn: false, layout: null, skillDir: '/s' },
      async (state, questions) => {
        states.push(state as Record<string, unknown>)
        return Object.fromEntries(Object.keys(questions).map((name) => [name, { noul: 0.5 }]))
      },
      () => {},
    )
    const files = Object.values(states[0].request_files as Record<string, string>).join('')
    // The first room's 24,000 characters, though the end part leaves 50,000.
    expect(files).toHaveLength(24_000)
  })

  it('puts the page into a room though its layout cannot be written there', () => {
    const sample = mkdtempSync(join(tmpdir(), 'st-reading-again-sample-'))
    const room = mkdtempSync(join(tmpdir(), 'st-reading-again-room-'))
    made.push(sample, room)
    mkdirSync(join(sample, 'renders'))
    writeFileSync(join(sample, 'renders', 'desktop-1280x960.png'), '')
    writeFileSync(
      join(sample, 'renders', 'desktop-1280x960.json'),
      JSON.stringify({
        window: [1280, 960],
        page: [1280, 960],
        elements: [layoutElement],
        leftOut: 0,
      }),
    )
    // Where the layout would go, a folder: writing it fails.
    mkdirSync(join(room, 'page-s1', 'layout.txt', 'in-the-way'), { recursive: true })
    const texts: Record<string, string> = {}
    expect(() => putPage(room, 'page-s1', sample, texts)).not.toThrow()
    expect(existsSync(join(room, 'page-s1', 'page.png'))).toBe(true)
    expect(texts).toEqual({})
  })

  it('counts a reading saved before Jev was asked again, as it was saved', () => {
    const dir = copy()
    const saved = join(dir, 'reading.json')
    // A reading as `--out` wrote one before this: no `again`, and no mark of Jev's.
    const mark = {
      output: 'page-long-s1',
      fact: {
        id: 'check:The page lists all 180 changes.',
        ref: 'C1',
        kind: 'check',
        text: 'The page lists all 180 changes.',
        jev: 'not read',
        yours: null,
      },
      answer: 'met',
      why: 'It lists all 180.',
      file: 'page-long-s1/outputs/index.html',
      quote: '<li id="c180">',
      evidence: 'quoted',
    }
    const old = {
      run: RUN,
      provider: 'claude-code',
      model: 'claude-test',
      blind: false,
      cases: [
        {
          case: 'page-long',
          outputs: ['page-long-s1'],
          asked: 1,
          marks: [mark],
          findings: [],
          note: '',
          usage: { input: 1, output: 1 },
          seconds: 1,
          error: null,
        },
      ],
      agreement: {},
      usage: { input: 1, output: 1 },
    }
    writeFileSync(saved, JSON.stringify(old))
    const st = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        join('src', 'interfaces', 'cli', 'st.ts'),
        'read',
        dir,
        '--recount',
        saved,
      ],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } },
    )
    expect({ status: st.status, stderr: st.stderr }).toEqual({ status: 0, stderr: '' })
    expect(st.stdout).toMatch(/page-long-s1 +C1 +met +\(Jev: not read\)/)
    expect(st.stdout).toContain('1 asked, 1 answered')
    expect(st.stdout).not.toContain('asked again')
  }, 30_000)
  it('sends the assistant, with no Jev, what it was sent before Jev was asked again', async () => {
    for (const [run, key] of Object.entries(LONG_PAGE_KEYS)) {
      assistant.requests = []
      const dir = copy()
      await readingOfRun(dir, run, options({ cases: ['page-long'], jev: null }))
      expect(assistant.requests.map((r) => replyKey('claude-code', r.request))).toEqual([key])
    }
  })

  it('sends the assistant what it was sent before with --no-jev, so a replay looks for the reply taken out', () => {
    const dir = copy()
    const st = stReplayed(['read', dir, '--run', WITHOUT, '--no-jev'])
    expect(st.status).toBe(2)
    expect(st.stderr).toContain(`claude-code/${LONG_PAGE_KEYS[WITHOUT]}.json`)
    expect(st.stderr).not.toContain('jev/')
  }, 30_000)

  it('prints what Jev settled when asked again apart from what the assistant answered', () => {
    const dir = copy()
    const key: Record<string, Record<string, boolean>> = {}
    for (const row of gradeRows(dir, WITHOUT).rows) {
      if (row.key === null) continue
      key[row.sample] ??= {}
      key[row.sample][row.fact.id] = row.key
    }
    const answers = join(scratchDir('st-reading-again-key-'), 'key.json')
    writeFileSync(answers, JSON.stringify(key))
    const st = stReplayed(['read', dir, '--run', WITHOUT, '--answers', answers])
    expect({ status: st.status, stderr: st.status === 0 ? '' : st.stderr }).toEqual({
      status: 0,
      stderr: '',
    })
    expect(st.stdout).toContain('Against the answers given: 3 of 3 agree')
    expect(st.stdout).toContain(
      'Jev, asked again: 3 answered; against the answers given: 3 of 3 agree.',
    )
    expect(st.stdout).toContain(
      'The assistant: 0 asked, 0 answered; against the answers given: none to compare',
    )
  }, 30_000)
})
