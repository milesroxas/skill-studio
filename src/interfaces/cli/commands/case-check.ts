import { caseProblems } from '@infrastructure/cases.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { skillOf } from './shared.ts'

const flags = shared('json')

export const caseCheck: Command = {
  name: 'case check',
  help: [
    '  case check                  List each case and check file that will not load or is skipped,',
    '                              and each title two cases share. Exits 1 when it lists any.',
  ],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill, info } = skillOf(context.args)
    const found = caseProblems(skill)
    if (values.json) console.log(JSON.stringify(found, null, 2))
    else {
      console.log(
        `${info.name}: ${found.cases} case(s), ${found.checks} check(s), ${found.problems.length ? `${found.problems.length} problem(s)` : 'no problems'}`,
      )
      for (const problem of found.problems) console.log(`  - ${problem}`)
    }
    return found.problems.length ? 1 : 0
  },
}
