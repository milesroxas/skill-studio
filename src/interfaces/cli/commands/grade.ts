import { gradeRun, jevForRun } from '@application/grade.ts'
import { runShown } from '@domain/run-name.ts'
import { listRuns } from '@infrastructure/runs.ts'
import { withMeter } from '@judges/meter.ts'
import { runNameOf } from '../input.ts'
import type { Command, FlagValues } from './command.ts'
import { GRADING, shared } from './flags.ts'
import {
  disagreementsOf,
  drawingOf,
  held,
  noteNoKey,
  oneRun,
  printGraded,
  reportWith,
  runNamer,
  skillOf,
  wantsJev,
} from './shared.ts'

const flags = shared('run', 'all', 'json', 'no-draw', ...GRADING)

export const grade: Command = {
  name: 'grade',
  help: ['  grade                       Grade a run: --run <name> or --all.'],
  flags,
  agents: true,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    const one = oneRun(context.values)
    const names = values.all
      ? listRuns(skill).map((r) => r.name)
      : one
        ? [runNameOf(one, '--run')]
        : []
    if (!names.length) throw new Error('Pass --run <name> or --all.')
    // Asked of every run before any is graded: with no key, a run Jev scored is refused, not written over.
    const runs = names.map((name) => ({
      name,
      useJev: wantsJev(context) && jevForRun(skill, name),
    }))
    noteNoKey(context)
    // One host draws for every run, and only a run Jev grades starts it.
    const render = runs.some((r) => r.useJev) ? drawingOf(context) : undefined
    let judged = true
    const nameRun = runNamer(skill)
    // Each run's JSON carries what its own grading cost.
    for (const { name, useJev } of runs)
      await withMeter(async () => {
        const report = await held(
          context,
          gradeRun(skill, name, { ...context.jev, useJev, render }),
        )
        const named = nameRun(name)
        // Where code and a sure Jev gave different answers, as `st report` says it of the same run.
        const disputed = disagreementsOf(skill, name, report, context.scoring)
        // With --json, the line before each report stays the run's folder alone: its JSON names the version.
        console.log(`\n${values.json ? name : runShown(named)}`)
        judged =
          printGraded(report, values.json, reportWith(disputed), {
            run: named,
            disagreements: disputed,
          }) && judged
      })
    return judged ? 0 : 1
  },
}
