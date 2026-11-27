/**
 * The baseline, replayed. The replies under `scripts/reading-bench/replies/`
 * were saved with `ST_AI_RECORD` when `st sort` (both versions, as the reading
 * bench sorts them), `st propose` and `st read --answers` (two runs, blind and
 * not) ran live on a copy of `fixtures/launch-note`. Jev's answers on what a
 * grading will say of each answer `st propose` read were added after, asked
 * live once for those questions alone, with Claude's replies replayed. Here the same commands run
 * under `ST_AI_REPLAY` on a new copy in another folder, with no assistant on
 * the PATH and no key set, and each gives the counts the live run gave. Every
 * call each one makes is answered from a saved reply, so none asks Claude or
 * Jev: a call with no reply would stop the command with code 2.
 *
 * `LIVE` is what the live run counted. A change to what one of these commands
 * sends makes a key no reply has, and fails here by its operation and key.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ProposeResult } from '@application/proposing.ts'
import type { RunReading } from '@application/reading.ts'
import type { SortResult } from '@application/sorting.ts'
import type { CallTotal } from '@domain/cost.ts'
import { readingOf } from '@domain/verdict.ts'
import { loadBench } from '@infrastructure/cases.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { countSorted, gradeRows } from '../../../scripts/reading-bench/count.ts'
import { mergeReadings } from '../../../scripts/reading-bench/readings.ts'

const ROOT = resolve(import.meta.dirname, '../../..')
const FIXTURE = join(ROOT, 'fixtures', 'launch-note')
const BENCH = join(ROOT, 'scripts', 'reading-bench')
const REPLIES = join(BENCH, 'replies')
/** The runs the bench reads: version one, and the run without the skill. */
const RUNS = [
  '2026-11-20-skill-v0-claude-sonnet',
  '2026-11-20-skill-v0-claude-sonnet-without-skill',
] as const
const SONNET = 'claude-sonnet-5-5'
const JEV = 'jev-1.14.0'

/** One command's calls, as the live run counted them: by operation, provider and model. */
type Spent = Array<
  Pick<CallTotal, 'operation' | 'provider' | 'model' | 'calls' | 'input' | 'output'>
>

const sortSpent = (calls: number, input: number, output: number): Spent => [
  { operation: 'sort', provider: 'claude-code', model: SONNET, calls, input, output },
]
const readSpent = (calls: number, input: number, output: number): Spent => [
  { operation: 'read', provider: 'claude-code', model: SONNET, calls, input, output },
]
const agreed = (agree: number, total: number) => ({ agree, total })

/** What the live run counted, on 2026-11-27, under sorting prompt version 12. */
const LIVE = {
  sortV1: {
    counts: { read: 28, exact: 11, judged: 14, unmarkable: 3, kept: 0, calls: 7 },
    refused: { once: 0, twice: 0, failed: 0 },
    spent: sortSpent(7, 97_690, 8_013),
  },
  sortV2: {
    counts: { read: 30, exact: 14, judged: 16, unmarkable: 0, kept: 0, calls: 7 },
    refused: { once: 0, twice: 0, failed: 0 },
    spent: sortSpent(7, 101_448, 7_274),
  },
  /** Version two's readings, with version one's merged in, counted by the bench against the key. */
  sorted: {
    stored: { agreed: 184, disagreed: 0, modelOnly: 0, otherOnly: 314 },
    mutated: { agreed: 1_131, disagreed: 0, modelOnly: 5, otherOnly: 1_871 },
  },
  propose: {
    counts: { proposals: 11, every: 1, overreach: 2, pairs: 69, joined: 1 },
    refused: { once: 0, twice: 0, failed: 0 },
    // 10 requests and 176 questions on the proposals' words and on joining them; 12 and 27 on
    // what a grading will say of each answer read, asked live once more on the same day for those
    // alone. A page's answers are not asked: a grading draws them.
    jev: { requests: 22, questions: 203, kept: 0, error: null },
    /**
     * Jev's word on each answer read, as a grading will give it, over every proposal kept, those
     * joined into one for every case among them: the answers asked, those Jev is sure of, those it
     * is sure of the other word than the assistant's, and those whose parts do not settle it.
     */
    meets: { asked: 27, sure: 23, differ: 1, unsettled: 0 },
    spent: [
      {
        operation: 'propose',
        provider: 'claude-code',
        model: SONNET,
        calls: 6,
        input: 118_758,
        output: 8_192,
      },
      // Jev's tokens are measured live only: a replayed answer carries none (36,400 live, and of the
      // 120,837 asked live on what a grading will say, about 24,000 by their characters are the 12 kept).
      { operation: 'propose', provider: 'jev', model: JEV, calls: 22, input: 0, output: 0 },
    ] satisfies Spent,
  },
  read: {
    [`${RUNS[0]} blind`]: {
      agreement: {
        asked: 66,
        answered: 66,
        cannotTell: 0,
        skipped: 0,
        unfound: 0,
        yours: agreed(60, 62),
        yoursQuoted: agreed(59, 61),
        jev: agreed(3, 3),
        settled: agreed(5, 5),
      },
      spent: readSpent(6, 62_159, 10_101),
    },
    [RUNS[0]]: {
      agreement: {
        asked: 5,
        answered: 5,
        cannotTell: 0,
        skipped: 0,
        unfound: 0,
        yours: agreed(4, 4),
        yoursQuoted: agreed(4, 4),
        jev: agreed(0, 0),
        settled: agreed(5, 5),
      },
      spent: readSpent(3, 86_592, 2_409),
    },
    [`${RUNS[1]} blind`]: {
      agreement: {
        asked: 66,
        answered: 66,
        cannotTell: 0,
        skipped: 0,
        unfound: 0,
        yours: agreed(62, 63),
        yoursQuoted: agreed(60, 61),
        jev: agreed(3, 3),
        settled: agreed(3, 3),
      },
      spent: readSpent(6, 91_550, 17_615),
    },
    [RUNS[1]]: {
      agreement: {
        asked: 3,
        answered: 3,
        cannotTell: 0,
        skipped: 0,
        unfound: 0,
        yours: agreed(3, 3),
        yoursQuoted: agreed(3, 3),
        jev: agreed(0, 0),
        settled: agreed(3, 3),
      },
      spent: readSpent(1, 78_893, 1_157),
    },
  },
}

const made: string[] = []
const scratch = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  made.push(dir)
  return dir
}

/**
 * The environment of a replay that could ask nobody if it tried: no assistant
 * command on the PATH (Windows spells PATH as it likes, so every spelling
 * goes), no provider key, no TypeSafe key, nothing recorded, and Settings of
 * its own.
 */
const replaying = (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATH'),
  ),
  PATH: scratch('st-baseline-path-'),
  ANTHROPIC_API_KEY: '',
  SKILL_STUDIO_ANTHROPIC_API_KEY: '',
  OPENAI_API_KEY: '',
  SKILL_STUDIO_OPENAI_API_KEY: '',
  TYPESAFE_API_KEY: '',
  ST_AI_RECORD: '',
  ST_AI_REPLAY: REPLIES,
  ST_AI_REPLAY_LOG: replayed,
  SKILL_STUDIO_HOME: scratch('st-baseline-home-'),
})

/** Where every command here notes each saved reply it answered from (`noteReplayed`). */
let replayed = ''

/** Run `st` with `args` and `--json` under the replay, and read what it printed. */
function st<T>(args: readonly string[]): T & { cost: CallTotal[] } {
  const run = spawnSync(
    process.execPath,
    ['--import', 'tsx', join('src', 'interfaces', 'cli', 'st.ts'), ...args, '--json'],
    { cwd: ROOT, encoding: 'utf8', env: replaying(), maxBuffer: 64 * 1024 * 1024 },
  )
  // The status alone would hide which call had no reply: stderr names it.
  expect({ status: run.status, stderr: run.status === 0 ? '' : run.stderr }).toEqual({
    status: 0,
    stderr: '',
  })
  return JSON.parse(run.stdout) as T & { cost: CallTotal[] }
}

/** The calls a command made, each answered from a saved reply and taking no time. */
function spentOf(cost: readonly CallTotal[]): Spent {
  for (const total of cost) expect(total).toMatchObject({ source: 'replayed', seconds: 0 })
  return cost.map(({ operation, provider, model, calls, input, output }) => ({
    operation,
    provider,
    model,
    calls,
    input,
    output,
  }))
}

function sortCounts(sorted: SortResult) {
  const items = [...sorted.rules, ...sorted.cases.flatMap((c) => c.checks)]
  const kind = (k: string) => items.filter((i) => i.stored?.reading.reading === k).length
  return {
    counts: {
      read: items.length,
      exact: kind('exact'),
      judged: kind('judged'),
      unmarkable: kind('unmarkable'),
      kept: items.filter((i) => i.kept).length,
      calls: sorted.calls.length,
    },
    refused: {
      once: sorted.calls.reduce((n, c) => n + c.refusedOnce, 0),
      twice: sorted.calls.reduce((n, c) => n + c.refusedTwice, 0),
      failed: sorted.calls.filter((c) => c.error).length,
    },
    spent: spentOf((sorted as SortResult & { cost: CallTotal[] }).cost),
  }
}

let v1 = ''
let v2 = ''

beforeAll(() => {
  // Another folder than the live run's, made the same way: version one's copy, and version two's.
  const root = scratch('st-baseline-')
  v1 = join(root, 'one', 'launch-note')
  v2 = join(root, 'two', 'launch-note')
  cpSync(FIXTURE, v1, { recursive: true })
  cpSync(join(BENCH, 'skill', 'v1.md'), join(v1, 'SKILL.md'))
  cpSync(FIXTURE, v2, { recursive: true })
  // Sorted afresh: without the fixture's readings, every rule and check is read.
  for (const dir of [v1, v2]) rmSync(join(dir, 'evals', 'rule-readings.json'))
  replayed = join(scratch('st-baseline-replayed-'), 'replayed.txt')
})

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('the baseline, replayed on a new copy of launch-note', () => {
  it('sorts version one as the live run did', () => {
    const sorted = st<SortResult>(['sort', v1, '--model', 'sonnet'])
    const { spent, ...counts } = LIVE.sortV1
    expect(sortCounts(sorted)).toEqual({ ...counts, spent })
  }, 30_000)

  it("sorts version two beside version one's readings as the live run did, and agrees with the key as it did", () => {
    mergeReadings(v2, [v1])
    const sorted = st<SortResult>(['sort', v2, '--model', 'sonnet'])
    const { spent, ...counts } = LIVE.sortV2
    expect(sortCounts(sorted)).toEqual({ ...counts, spent })
    const bench = countSorted(v2)
    const side = ({ agreed, disagreed, modelOnly, otherOnly }: typeof bench.stored) => ({
      agreed,
      disagreed,
      modelOnly,
      otherOnly,
    })
    expect({ stored: side(bench.stored), mutated: side(bench.mutated) }).toEqual(LIVE.sorted)
  }, 30_000)

  it('proposes checks as the live run did, Jev answering from the saved replies', () => {
    const result = st<ProposeResult>(['propose', v2])
    const { cases } = result
    // Each case's own, and those joined into one for every case, which a case no longer lists.
    const read = [...cases.flatMap((c) => c.proposals), ...result.every.flatMap((e) => e.made)]
      .filter((p, i, all) => all.findIndex((q) => q.case === p.case && q.id === p.id) === i)
      .flatMap((p) => p.answers)
    const cuts = loadBench(v2)
    const sure = (jev: number | null | undefined) =>
      typeof jev === 'number' && ['met', 'missed'].includes(readingOf(jev, cuts))
    expect({
      counts: {
        proposals: cases.reduce((n, c) => n + c.proposals.length, 0),
        every: result.every.length,
        overreach: cases.reduce((n, c) => n + c.overreach.length, 0),
        pairs: result.joining.pairs.length,
        joined: result.joining.pairs.filter((p) => p.joined).length,
      },
      refused: {
        once: cases.reduce((n, c) => n + c.refusedOnce, 0),
        twice: cases.reduce((n, c) => n + c.refusedTwice, 0),
        failed: cases.filter((c) => c.error).length,
      },
      jev: result.jev,
      meets: {
        asked: read.filter((a) => a.jev !== undefined).length,
        sure: read.filter((a) => sure(a.jev)).length,
        differ: read.filter((a) => a.said !== undefined).length,
        unsettled: read.filter((a) => a.jev === null).length,
      },
      spent: spentOf(result.cost),
    }).toEqual(LIVE.propose)
  }, 30_000)

  for (const run of RUNS)
    for (const blind of [true, false]) {
      const name = blind ? `${run} blind` : run
      it(`reads ${name} against the key as the live run did`, () => {
        // The key, as `scripts/reading-bench/index.ts --out` writes it: by output, then by fact.
        const key: Record<string, Record<string, boolean>> = {}
        for (const row of gradeRows(v2, run).rows) {
          if (row.key === null) continue
          key[row.sample] ??= {}
          key[row.sample][row.fact.id] = row.key
        }
        const answers = join(scratch('st-baseline-key-'), 'key.json')
        writeFileSync(answers, `${JSON.stringify(key, null, 2)}\n`)
        const reading = st<RunReading>([
          'read',
          v2,
          '--run',
          run,
          ...(blind ? ['--blind'] : []),
          '--answers',
          answers,
        ])
        expect(reading.cases.filter((c) => c.error)).toEqual([])
        expect({ agreement: reading.agreement, spent: spentOf(reading.cost) }).toEqual(
          LIVE.read[name],
        )
      }, 30_000)
    }

  // Last, after every command above: a reply none of them read is one no command sends for now.
  it("reads every reply kept, and every answer of Jev's in them", () => {
    const kept = readdirSync(REPLIES, { withFileTypes: true })
      .filter((folder) => folder.isDirectory())
      .flatMap((folder) =>
        readdirSync(join(REPLIES, folder.name))
          .filter((file) => file.endsWith('.json'))
          .flatMap((file) => {
            const name = `${folder.name}/${file}`
            if (folder.name !== 'jev') return [name]
            const answers = JSON.parse(readFileSync(join(REPLIES, folder.name, file), 'utf8'))
            return Object.keys(answers).map((key) => `${name}#${key}`)
          }),
      )
    const read = new Set(readFileSync(replayed, 'utf8').split(/\r?\n/).filter(Boolean))
    expect(kept.filter((name) => !read.has(name))).toEqual([])
    expect([...read].filter((name) => !kept.includes(name))).toEqual([])
  })
})
