import { generateRun } from '@application/generate.ts'
import { gradeRun } from '@application/grade.ts'
import { loadCases } from '@infrastructure/cases.ts'
import { engineById, engines } from '@infrastructure/engines/index.ts'
import { runDir } from '@infrastructure/runs.ts'
import { countOf, generateInputOf } from '../input.ts'
import type { Command, FlagValues } from './command.ts'
import { GRADING, shared } from './flags.ts'
import { held, noteNoKey, printGraded, skillOf } from './shared.ts'

const flags = {
  ...shared('model', 'effort', 'cases', 'name', 'parallel', 'json', ...GRADING),
  engine: { type: 'string' },
  samples: { type: 'string' },
  configuration: { type: 'string' },
  baseline: { type: 'string' },
  note: { type: 'string' },
  'no-grade': { type: 'boolean' },
} as const

export const run: Command = {
  name: 'run',
  help: [
    '  run                         Generate outputs with a headless agent, then grade them.',
    '    --engine <id>             claude (default) or cursor.',
    '    --model <id>              Engine model; default per engine.',
    '    --effort <level>          Engine effort; default per engine.',
    '    --cases <a,b>             Case ids; default every case.',
    '    --samples <n>             Samples per case (default 1).',
    '    --configuration <c>       with_skill (default), without_skill, old_skill.',
    '    --baseline <v|run>        For old_skill: the version (v1) or run to test.',
    '    --name <text>             Name the skill version when the tree changed.',
    '    --note <text>             Note on the version.',
    '    --parallel <n>            Samples in flight (default 3).',
    '    --no-grade                Skip grading after generation.',
  ],
  flags,
  agents: true,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    noteNoKey(context)
    const { skill } = skillOf(context.args)
    // The same check the app's Run button goes through.
    const input = generateInputOf(skill, {
      engine: values.engine,
      model: values.model,
      effort: values.effort,
      cases: values.cases,
      samples: values.samples,
      configuration: values.configuration,
      baseline: values.baseline,
      name: values.name,
      note: values.note,
    })
    const [choice] = input.configs
    const engine = engineById(choice.engine)
    if (!engine)
      throw new Error(
        `Unknown engine ${choice.engine}. Have: ${engines.map((e) => e.id).join(', ')}.`,
      )
    if (!engine.available()) throw new Error(`${engine.label} is not available. ${engine.hint}`)
    const parallel = countOf(values.parallel, '--parallel')
    const cases = loadCases(skill)
    const wanted = input.cases
    const selected = wanted.length ? cases.filter((c) => wanted.includes(c.id)) : cases
    const missing = wanted.filter((id) => !cases.some((c) => c.id === id))
    if (missing.length) throw new Error(`No case named ${missing.join(', ')}.`)
    if (!selected.length) throw new Error('No cases to run.')
    const { name, meta } = await held(
      context,
      generateRun({
        skillDir: skill,
        cases: selected,
        engine,
        model: choice.model || null,
        effort: choice.effort || null,
        samples: input.samples,
        configuration: input.configuration,
        baseline: input.baseline,
        skillName: input.skillName,
        note: input.note,
        parallel,
        log: (line) => console.error(line),
        signal: context.lifecycle?.signal,
      }),
    )
    console.log(`Run: ${runDir(skill, name)}`)
    // An attempt that failed is no answer: the run is not whole, whatever its grading says.
    const failed = meta.samples.filter((s) => s.failed)
    for (const s of failed)
      console.error(`Failed: ${s.dir}, it ${s.failed}${s.error ? ` (${s.error})` : ''}`)
    const fine =
      values['no-grade'] ||
      printGraded(await held(context, gradeRun(skill, name, context.jev)), values.json)
    return fine && !failed.length ? 0 : 1
  },
}
