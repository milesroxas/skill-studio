import { loadCases } from '@infrastructure/cases.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { skillOf } from './shared.ts'

const flags = shared('json')

export const cases: Command = {
  name: 'cases',
  help: ["  cases                       List the skill's cases."],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill, info } = skillOf(context.args)
    const list = loadCases(skill)
    if (values.json) console.log(JSON.stringify(list, null, 2))
    else {
      console.log(`${info.name}: ${list.length} case(s)`)
      // Every id whole, as `--cases` and `--case` take it: the column widens for a long one.
      const width = Math.max(33, ...list.map((c) => c.id.length))
      for (const c of list)
        console.log(
          `  ${c.id.padEnd(width)}  ${c.graders.length} grader(s)${c.files.length ? `, ${c.files.length} file(s)` : ''}  ${c.title}`,
        )
    }
    return 0
  },
}
