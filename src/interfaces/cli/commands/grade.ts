import { gradeRun, jevForRun } from '@application/grade.ts'
import { listRuns } from '@infrastructure/runs.ts'
import { withMeter } from '@judges/meter.ts'
import { runNameOf } from '../input.ts'
import type { Command, FlagValues } from './command.ts'
import { GRADING, shared } from './flags.ts'
import { drawingOf, held, noteNoKey, printGraded, skillOf, wantsJev } from './shared.ts'

const flags = shared('run', 'all', 'json', 'no-draw', ...GRADING)

export const grade: Command = {
  name: 'grade',
  help: ['  grade                       Grade a run: --run <name> or --all.'],
  flags,
  agents: true,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    const names = values.all
      ? listRuns(skill).map((r) => r.name)
      : values.run
        ? [runNameOf(values.run, '--run')]
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
    // Each run's JSON carries what its own grading cost.
    for (const { name, useJev } of runs)
      await withMeter(async () => {
        const report = await held(
          context,
          gradeRun(skill, name, { ...context.jev, useJev, render }),
        )
        console.log(`\n${name}`)
        judged = printGraded(report, values.json) && judged
      })
    return judged ? 0 : 1
  },
}
