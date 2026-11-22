/**
 * The reading gate, live: what a release that changes a question's words,
 * the scoring, the sorting prompt or the set of exact tests runs first.
 *
 *   pnpm reading-gate [--model sonnet] [--cached] [--yes] [--keep] [--json]
 *
 * On a scratch copy it makes itself under the system's temp folder, it sorts
 * both versions of `launch-note` with the assistant set in Settings (version
 * one first, then version two beside version one's readings, as one skill
 * folder is sorted over its life), grades the five stored runs with Jev, and
 * counts both against the answer key. It prints one table beside the numbers
 * last pinned (`pinned.ts`), and exits 1 when a sure answer of code's
 * disagrees with the key, or sure and wrong passes its ceiling.
 *
 * It never writes under `fixtures/`. It says what it will spend and asks
 * before it starts (`--yes` skips the question). `--cached` keeps Jev's
 * stored answers to questions whose words have not changed, so only changed
 * questions are asked; without it every question is asked again. `--keep`
 * leaves the scratch copy; `--json` prints the counts to pin from.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { gradeRun } from '@application/grade.ts'
import { sortChoice, sortSkill } from '@application/sorting.ts'
import { realPath } from '@infrastructure/fs.ts'
import { listRuns, runDir } from '@infrastructure/runs.ts'
import { Jev } from '@judges/jev.ts'
import { countGrading, countSorted } from './count.ts'
import { LIVE, type PinnedLive, STORED } from './pinned.ts'
import { mergeReadings } from './readings.ts'

const REPO = resolve(import.meta.dirname, '../..')
const FIXTURE = join(REPO, 'fixtures/launch-note')
const V1 = join(import.meta.dirname, 'skill/v1.md')

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'sonnet' },
    cached: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
})

const say = (line = '') => console.error(line)
const number = (n: number) => n.toLocaleString('en-US')

// ---------------------------------------------------------------- what it needs, and what it spends

if (!Jev.available()) {
  say(
    'TYPESAFE_API_KEY is not set. The gate grades with Jev, so it needs the key. Nothing was run.',
  )
  process.exit(2)
}
let choice: Awaited<ReturnType<typeof sortChoice>>
try {
  choice = await sortChoice({ model: values.model })
} catch (error) {
  say(`${(error as Error).message} The gate sorts with the assistant. Nothing was run.`)
  process.exit(2)
}

const runs = listRuns(FIXTURE).map((r) => r.name)
// The fixture's own readings are its baseline: the gate sorts afresh on its copy, and never writes them.
const FIXTURE_READINGS = join(FIXTURE, 'evals/rule-readings.json')
const readingsBefore = existsSync(FIXTURE_READINGS) ? readFileSync(FIXTURE_READINGS, 'utf8') : null
const cases = new Set(
  runs.flatMap((run) => {
    const report = JSON.parse(readFileSync(join(runDir(FIXTURE, run), 'report.json'), 'utf8'))
    return (report.results as Array<{ case: string | null }>).map((r) => r.case)
  }),
).size
const asked = runs.reduce(
  (sum, run) => {
    const report = JSON.parse(readFileSync(join(runDir(FIXTURE, run), 'report.json'), 'utf8'))
    return {
      questions: sum.questions + (report.asked?.questions ?? 0),
      tokens: sum.tokens + (report.asked?.inputTokens ?? 0),
    }
  },
  { questions: 0, tokens: 0 },
)
const sortRequests = 2 * (1 + cases)
const lastSpent = LIVE?.spent

say('The reading gate grades launch-note again, on a scratch copy, and counts it against the key.')
say('')
say('It will spend:')
say(
  `- ${choice.provider} (${choice.model}): ${sortRequests} requests to sort both versions${
    lastSpent
      ? `, about ${number(lastSpent.assistantInput)} input and ${number(lastSpent.assistantOutput)} output tokens last time`
      : ', about 190,000 input and 14,000 output tokens'
  }. It counts toward that account's usage.`,
)
say(
  values.cached
    ? `- TypeSafe (Jev): only the questions whose words changed since the stored gradings, of the ${number(asked.questions)} they asked.`
    : `- TypeSafe (Jev): up to ${number(asked.questions)} questions over ${runs.length} runs, about ${number(asked.tokens)} input tokens, as the stored gradings asked. A question code answers is not asked.`,
)
const aboutMinutes = lastSpent ? Math.max(1, Math.round(lastSpent.minutes)) : 5
say(`- About ${aboutMinutes} minute${aboutMinutes === 1 ? '' : 's'}.`)
say('')
if (!values.yes) {
  const prompt = createInterface({ input: process.stdin, output: process.stderr })
  const answer = (await prompt.question('Type yes to go on: ')).trim().toLowerCase()
  prompt.close()
  if (answer !== 'yes') {
    say('Nothing was run.')
    process.exit(0)
  }
}

// ---------------------------------------------------------------- the scratch copy

const controller = new AbortController()
process.on('SIGINT', () => controller.abort())
const begun = Date.now()
const scratch = realPath(mkdtempSync(join(tmpdir(), 'reading-gate-')))
const inside = (dir: string, root: string) => {
  const rel = relative(realPath(root), dir)
  return !rel.startsWith('..') && !rel.startsWith('/')
}
if (inside(scratch, join(REPO, 'fixtures'))) throw new Error(`${scratch} is under fixtures/.`)
const v1 = join(scratch, 'v1')
const v2 = join(scratch, 'v2')
cpSync(FIXTURE, v1, { recursive: true })
cpSync(V1, join(v1, 'SKILL.md'))
cpSync(FIXTURE, v2, { recursive: true })
for (const dir of [v1, v2]) rmSync(join(dir, 'evals/rule-readings.json'), { force: true })
if (!values.cached)
  for (const run of runs) rmSync(join(runDir(v2, run), 'judge-cache.json'), { force: true })
say(`Scratch copy: ${scratch}`)

const finish = (code: number): never => {
  if (values.keep) say(`Kept ${scratch}.`)
  else rmSync(scratch, { recursive: true, force: true })
  process.exit(code)
}

// ---------------------------------------------------------------- sort, grade, count

const usage = { input: 0, output: 0 }
for (const [name, dir] of [
  ['version one', v1],
  ['version two', v2],
] as const) {
  if (dir === v2) mergeReadings(v2, [v1])
  say(`\nSorting ${name}.`)
  const result = await sortSkill(dir, {
    model: values.model,
    again: false,
    parallel: 3,
    log: (line) => say(`  ${line}`),
    signal: controller.signal,
  })
  usage.input += result.usage.input
  usage.output += result.usage.output
  const failed = result.calls.filter((c) => c.error)
  if (failed.length) {
    for (const c of failed) say(`  ${c.what}: ${c.error}`)
    say('A sort request failed, so the count would not be whole.')
    finish(1)
  }
}

let questions = 0
for (const run of runs) {
  say(`\nGrading ${run}.`)
  const report = await gradeRun(v2, run, {
    useJev: true,
    log: (line) => say(`  ${line}`),
    signal: controller.signal,
  })
  questions += report.asked?.questions ?? 0
}

const grading = countGrading(v2)
const sorted = countSorted(v2)
const minutes = Math.round((Date.now() - begun) / 6000) / 10
const counted: PinnedLive = {
  at: new Date().toISOString().slice(0, 10),
  sortModel: choice.model,
  grading: {
    wrongCeiling: grading.total.wrong,
    right: grading.total.right,
    unsure: grading.total.unsure,
    unread: grading.total.unread,
    inapplicable: grading.total.inapplicable,
    unmarkable: grading.total.unmarkable,
    byCode: grading.total.byCode,
  },
  stored: { agreed: sorted.stored.agreed, disagreedCeiling: 0 },
  mutated: { agreed: sorted.mutated.agreed, disagreedCeiling: 0 },
  readings: {
    exact: sorted.kinds.exact ?? 0,
    judged: sorted.kinds.judged ?? 0,
    unmarkable: sorted.kinds.unmarkable ?? 0,
  },
  spent: {
    minutes,
    assistantInput: usage.input,
    assistantOutput: usage.output,
    jevQuestions: questions,
  },
}

// ---------------------------------------------------------------- the table

const cell = (value: number | string | undefined) => String(value ?? '-').padStart(12)
const rows: Array<[string, number, number | undefined, number | undefined]> = [
  ['Sure and right', grading.total.right, LIVE?.grading.right, STORED.grading.right],
  ['Sure and wrong', grading.total.wrong, LIVE?.grading.wrongCeiling, STORED.grading.wrongCeiling],
  ['Not sure', grading.total.unsure, LIVE?.grading.unsure, STORED.grading.unsure],
  ['Not read', grading.total.unread, LIVE?.grading.unread, STORED.grading.unread],
  [
    'Does not apply',
    grading.total.inapplicable,
    LIVE?.grading.inapplicable,
    STORED.grading.inapplicable,
  ],
  ['Answered by code', grading.total.byCode, LIVE?.grading.byCode, STORED.grading.byCode],
  [
    'Cannot be marked',
    grading.total.unmarkable,
    LIVE?.grading.unmarkable,
    STORED.grading.unmarkable,
  ],
]
const lines = [
  '',
  `The grading against the key, over ${runs.length} runs${LIVE ? ` (pinned live on ${LIVE.at})` : ''}:`,
  `${''.padEnd(34)}${cell('now')}${cell('pinned live')}${cell('stored')}`,
  ...rows.map(
    ([name, now, live, stored]) => `${name.padEnd(34)}${cell(now)}${cell(live)}${cell(stored)}`,
  ),
  '',
  'The assistant’s exact readings, answered by code, against the key:',
  `${'On the stored outputs: agreed'.padEnd(34)}${cell(sorted.stored.agreed)}${cell(LIVE?.stored.agreed)}`,
  `${'  disagreed'.padEnd(34)}${cell(sorted.stored.disagreed)}${cell(0)}`,
  `${'Changed to miss: agreed'.padEnd(34)}${cell(sorted.mutated.agreed)}${cell(LIVE?.mutated.agreed)}`,
  `${'  disagreed'.padEnd(34)}${cell(sorted.mutated.disagreed)}${cell(0)}`,
  `${'Read as exact / judged / not markable'.padEnd(34)}${cell(`${counted.readings.exact} / ${counted.readings.judged} / ${counted.readings.unmarkable}`)}${cell(LIVE ? `${LIVE.readings.exact} / ${LIVE.readings.judged} / ${LIVE.readings.unmarkable}` : undefined)}`,
  '',
  `Spent: ${minutes} minute${minutes === 1 ? '' : 's'}; the assistant ${number(usage.input)} input and ${number(usage.output)} output tokens; Jev ${number(questions)} questions.`,
]
console.log(lines.join('\n'))
for (const line of [...sorted.stored.disagreements, ...sorted.mutated.disagreements])
  console.log(`  disagreed: ${line}`)
if (grading.total.byCodeWrong)
  console.log(`  ${grading.total.byCodeWrong} sure answer(s) of code's disagree with the key.`)
if (values.json) console.log(JSON.stringify(counted, null, 2))

const ceiling = LIVE?.grading.wrongCeiling ?? STORED.grading.wrongCeiling
const failures = [
  sorted.stored.disagreed + sorted.mutated.disagreed > 0 &&
    'an exact reading of the assistant’s answers otherwise than the key',
  grading.total.byCodeWrong > 0 && 'code gave a sure answer the key does not share',
  grading.total.wrong > ceiling &&
    `sure and wrong is ${grading.total.wrong}, past its ceiling of ${ceiling}`,
].filter(Boolean)
if (failures.length) console.log(`\nThe gate fails: ${failures.join('; ')}.`)
else console.log('\nThe gate passes.')
const readingsAfter = existsSync(FIXTURE_READINGS) ? readFileSync(FIXTURE_READINGS, 'utf8') : null
if (readingsAfter !== readingsBefore)
  console.log(
    'fixtures/launch-note/evals/rule-readings.json changed while the gate ran: the gate does not write it, so something else did.',
  )
finish(failures.length ? 1 : 0)
