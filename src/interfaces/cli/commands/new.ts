import { basename, resolve } from 'node:path'
import { TEMPLATE_IDS, type TemplateId, templateById } from '@domain/templates.ts'
import { isSlug, SLUG_RULE } from '@domain/text.ts'
import { saveCase } from '@infrastructure/cases.ts'
import { newSkill } from '@infrastructure/skill.ts'
import type { Command, FlagValues } from './command.ts'
import { shared } from './flags.ts'

const flags = {
  ...shared('name'),
  description: { type: 'string' },
  template: { type: 'string' },
  'with-cases': { type: 'boolean' },
} as const

export const newCommand: Command = {
  name: 'new',
  help: [
    '  new <dir>                   Scaffold a skill: SKILL.md and an empty evals/cases/.',
    '    --name <id>               Skill name; default the folder name.',
    '    --description <text>      Front matter description.',
    '    --template <id>           blank (default), writing, code, workflow or design.',
    "    --with-cases              Also write the template's sample cases.",
  ],
  flags,
  agents: false,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const dir = context.args[0]
    if (!dir) throw new Error('Pass the new skill directory: st new <dir>.')
    const name = values.name ?? basename(resolve(dir))
    if (!isSlug(name)) throw new Error(SLUG_RULE)
    const template = values.template ?? 'blank'
    if (!TEMPLATE_IDS.includes(template as TemplateId))
      throw new Error(`Unknown template ${template}. Use one of ${TEMPLATE_IDS.join(', ')}.`)
    const chosen = templateById(template)
    const md = newSkill(dir, name, values.description ?? '', chosen)
    if (values['with-cases']) for (const sample of chosen.cases) saveCase(dir, sample, true)
    console.log(`Wrote ${md}. Edit it in the app: pnpm st serve ${dir}`)
    return 0
  },
}
