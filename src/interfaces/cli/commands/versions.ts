import { versionsOf } from '@infrastructure/runs.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'
import { skillOf } from './shared.ts'

const flags = shared('json')

export const versions: Command = {
  name: 'versions',
  help: ["  versions                    Skill versions seen in runs, and the working tree's."],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const { skill } = skillOf(context.args)
    const seen = versionsOf(skill)
    if (values.json) console.log(JSON.stringify(seen, null, 2))
    else {
      for (const v of seen.versions)
        console.log(`  ${v.version}  ${v.hash}  ${v.date ?? ''}  ${v.name}`)
      const c = seen.current
      console.log(
        c.changed
          ? `Working tree: ${c.version} (new, unnamed) ${c.hash}`
          : `Working tree: ${c.version} ${c.name}`,
      )
    }
    return 0
  },
}
