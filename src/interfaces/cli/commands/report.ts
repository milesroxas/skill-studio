import { correctionsOf, runVerdicts, scoredReport } from '@application/grade.ts'
import { type TwoCounts, twoCounts } from '@domain/case-result.ts'
import type { Configuration } from '@domain/schemas.ts'
import { readRun } from '@infrastructure/runs.ts'
import { runNameOf } from '../input.ts'
import { briefOrJson, printBrief } from './brief.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { oneRun, padEnd, printReport, skillOf } from './shared.ts'

const flags = shared('run', 'json', 'brief', 'packs', 'bench')

/** A count as the app writes it: "3 of 4", "3 of 4, 1 not sure", "3 of 4, 1 not read". */
function countWords(count: TwoCounts['checks']): string {
  if (!count) return 'none'
  return (
    [
      count.total ? `${count.met} of ${count.total}` : null,
      count.unsure ? `${count.unsure} not sure` : null,
      count.unread ? `${count.unread} not read` : null,
    ]
      .filter(Boolean)
      .join(', ') || 'none counted'
  )
}

/** Print each output's checks met and rules followed, apart: a run without the skill has no rules count. */
function printCounts(
  counts: ReadonlyArray<[string, TwoCounts]>,
  configuration: Configuration,
): void {
  if (!counts.length) return
  console.log('\nChecks met and rules followed, counted apart')
  for (const [sample, two] of counts)
    console.log(
      `  ${padEnd(sample, 36)}checks ${padEnd(countWords(two.checks), 24)}rules ${
        two.rules
          ? countWords(two.rules)
          : configuration === 'without_skill'
            ? 'none, made without the skill'
            : 'none'
      }`,
    )
}

export const report: Command = {
  name: 'report',
  help: [
    "  report                      Print a run's report: --run <name>.",
    '    --brief                   Print only each case and the rules and checks it missed.',
  ],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    const run = oneRun(context.values)
    if (!run) throw new Error('Pass --run <name>.')
    const brief = briefOrJson(context.values)
    const name = runNameOf(run, '--run')
    const view = readRun(skill, name)
    if (!view.report) throw new Error(`${run} is not graded. Run: st grade --run ${run}`)
    // Scored as the app scores it: under the scoring as it is now, with the reader's corrections.
    const corrections = correctionsOf(skill, name)
    const samples = view.samples.map((s) => s.name)
    if (brief) {
      const side = { view, report: view.report, cases: view.cases, samples, corrections }
      printBrief(skill, side, context.scoring)
      return 0
    }
    const scored = scoredReport(skill, view.report, context.scoring, view.cases, {
      samples,
      corrections,
    })
    if (values.json) console.log(JSON.stringify(scored, null, 2))
    else {
      printReport(scored)
      // The same verdicts the scores above were counted from, read as two counts.
      const verdicts = runVerdicts(skill, view.report, view.cases, corrections)
      const configuration = view.meta?.configuration ?? 'with_skill'
      printCounts(
        scored.results.map((r): [string, TwoCounts] => [
          r.sample,
          twoCounts(verdicts[r.sample] ?? [], configuration),
        ]),
        configuration,
      )
      const fixed = Object.values(corrections).reduce((n, c) => n + Object.keys(c).length, 0)
      if (fixed) console.log(`Your ${fixed} correction(s) in the app count, as they do there.`)
    }
    return 0
  },
}
