import { type ComparedCases, compareCases, compareRuns, correctionsOf } from '@application/grade.ts'
import type { CaseMove, Met } from '@domain/case-result.ts'
import { type RunNamed, runShown } from '@domain/run-name.ts'
import { readRun } from '@infrastructure/runs.ts'
import { runNameOf } from '../input.ts'
import { briefOrJson, printBriefCompare } from './brief.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { pad, padEnd, printOpen, runNamer, skillOf, spentLine, spentOf, widthOf } from './shared.ts'

const flags = shared('json', 'brief', 'packs', 'bench')

/** How a case moved, as a line says it. */
const MOVED: Readonly<Record<CaseMove, string>> = {
  better: 'better',
  same: 'the same',
  worse: 'worse',
  none: 'no checks to compare',
}

/** The two runs, A the first named and B the second, each with the version it ran. */
function printHeads(a: RunNamed, b: RunNamed): void {
  console.log(`A: ${runShown(a)}`)
  console.log(`B: ${runShown(b)}`)
}

/** One end of a case: the checks met on each attempt, "4 of 5" or "4 of 5 and 5 of 5". */
const endWords = (end: readonly Met[]): string =>
  end.map((m) => `${m.met} of ${m.total}`).join(' and ')

/** Print two runs read as cases, on checks: the count of each move, then each case's line. */
function printCases(compared: ComparedCases): void {
  const { better, same, worse, none } = compared
  console.log(
    `\nRead as cases, on checks alone: better on ${better}, the same on ${same}, worse on ${worse}.${
      none ? ` ${none} with no checks to compare.` : ''
    }`,
  )
  // Each case whole, as `--case` takes it: the column widens for a long one.
  const width = widthOf(
    compared.cases.map((c) => c.case),
    28,
  )
  for (const c of compared.cases) {
    const head = `  ${padEnd(c.case, width)}${padEnd(MOVED[c.move], 12)}`
    if (c.move === 'none') {
      console.log(head.trimEnd())
      continue
    }
    const tail = [
      c.alone && c.move !== 'same' ? 'one attempt each, so a small move may be chance' : null,
      c.left ? `${c.left} left out, marked in only one run or set aside` : null,
    ].filter(Boolean)
    console.log(
      `${head}checks met ${endWords(c.a)}, then ${endWords(c.b)}${tail.length ? `; ${tail.join('; ')}` : ''}`,
    )
  }
  if (compared.left.length) {
    console.log('\nCases not read:')
    for (const line of compared.left) console.log(`  ${line}`)
  }
}

export const compare: Command = {
  name: 'compare',
  help: [
    '  compare <runA> <runB>       Score deltas between two graded runs.',
    '    --brief                   Print only each case, the run that did better on its checks,',
    '                              and the rules and checks each run missed.',
  ],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill, rest } = skillOf(context.args)
    const [a, b] = rest
    if (!a || !b) throw new Error('Pass two run names.')
    const brief = briefOrJson(context.values)
    const nameRun = runNamer(skill)
    const load = (name: string) => {
      const run = runNameOf(name, '`st compare`')
      const view = readRun(skill, run)
      const { report, cases, samples } = view
      if (!report) throw new Error(`${name} has no report.json.`)
      return {
        view,
        report,
        cases,
        samples: samples.map((s) => s.name),
        corrections: correctionsOf(skill, run),
        named: nameRun(run, view.meta),
        spent: spentOf(skill, run, report),
      }
    }
    // Both under one scoring, so a difference is the outputs' and not a setting's, read as the app reads a change.
    const before = load(a)
    const after = load(b)
    // The same two runs read as cases, on checks alone.
    const byCase = compareCases(skill, before, after, context.scoring)
    // What each run spent, A's then B's.
    const spentLines = [spentLine(before.spent, 'A'), spentLine(after.spent, 'B')]
    if (brief) {
      printHeads(before.named, after.named)
      printBriefCompare(skill, before, after, byCase, context.scoring)
      for (const line of spentLines) console.log(line)
      printOpen(false, skill, a, b)
      return 0
    }
    const { rows, left, notes } = compareRuns(skill, before, after, context.scoring)
    if (values.json) {
      const ends = { a: before.named, b: after.named, spent: { a: before.spent, b: after.spent } }
      console.log(JSON.stringify({ rows, left, notes, cases: byCase, ...ends }, null, 2))
      return 0
    }
    printHeads(before.named, after.named)
    const layers = rows.length ? Object.keys(rows[0].deltas) : []
    const width = widthOf(
      rows.map((row) => row.key),
      44,
    )
    console.log(`\n${padEnd('sample', width)}${layers.map((l) => pad(l, 11)).join('')}`)
    for (const row of rows)
      console.log(
        `${padEnd(row.key, width)}${layers
          .map((l) => {
            const d = row.deltas[l]
            return pad(d === null ? '-' : `${d > 0 ? '+' : ''}${d}`, 11)
          })
          .join('')}`,
      )
    if (notes.length) {
      console.log('\nA change counts only what was marked in both runs, as in the app:')
      for (const line of notes) console.log(`  ${line}`)
    }
    if (left.length) {
      console.log('\nLeft out, as the app leaves them out:')
      for (const line of left) console.log(`  ${line}`)
    }
    printCases(byCase)
    console.log(`\n${spentLines.join('\n')}`)
    printOpen(values.json, skill, a, b)
    return 0
  },
}
