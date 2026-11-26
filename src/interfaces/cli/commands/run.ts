import { generateRun } from '@application/generate.ts'
import { correctionsOf, gradeRun } from '@application/grade.ts'
import type { Report } from '@domain/schemas.ts'
import { loadCases } from '@infrastructure/cases.ts'
import { engineById, engines } from '@infrastructure/engines/index.ts'
import { readRun, runDir } from '@infrastructure/runs.ts'
import { countOf, generateInputOf } from '../input.ts'
import { attemptLine, briefOrJson, printBrief } from './brief.ts'
import type { Command, FlagValues } from './command.ts'
import { GRADING, shared } from './flags.ts'
import { held, noteNoKey, printGraded, printOpen, printReport, skillOf } from './shared.ts'

const flags = {
  ...shared('model', 'effort', 'cases', 'name', 'parallel', 'json', 'brief', ...GRADING),
  engine: { type: 'string' },
  samples: { type: 'string' },
  configuration: { type: 'string' },
  baseline: { type: 'string' },
  from: { type: 'string' },
  note: { type: 'string' },
  'no-grade': { type: 'boolean' },
  quiet: { type: 'boolean' },
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
    '    --from <dir>              Run the skill files in <dir>, outside the skill, as the version.',
    '    --name <text>             Name the skill version when the tree changed.',
    '    --note <text>             Note on the version.',
    '    --parallel <n>            Samples in flight (default 3).',
    '    --no-grade                Skip grading after generation.',
    '    --brief                   Print only each case and the rules and checks it missed.',
    '    --quiet                   Print one line as each attempt ends in place of progress.',
  ],
  flags,
  agents: true,
  async run(context) {
    const values = context.values as FlagValues<typeof flags>
    const brief = briefOrJson(context.values)
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
        from: values.from ?? null,
        skillName: input.skillName,
        note: input.note,
        parallel,
        log: values.quiet ? () => {} : (line) => console.error(line),
        // Quiet, only progress goes: what a person must know is still said.
        ...(values.quiet
          ? { warn: (line: string) => console.error(line), onSample: attemptLine(skill) }
          : {}),
        signal: context.lifecycle?.signal,
      }),
    )
    if (!brief) console.log(`Run: ${runDir(skill, name)}`)
    // An attempt that failed is no answer: the run is not whole, whatever its grading says.
    const failed = meta.samples.filter((s) => s.failed)
    // Quiet, each attempt's own line already said it failed, and why.
    for (const s of values.quiet ? [] : failed)
      console.error(`Failed: ${s.dir}, it ${s.failed}${s.error ? ` (${s.error})` : ''}`)
    const jev = values.quiet
      ? { ...context.jev, log: () => {}, warn: (line: string) => console.error(line) }
      : context.jev
    // Brief, the report is each case and what it missed, scored as `st report --brief` scores it.
    const briefly = (report: Report | null) => {
      const view = readRun(skill, name)
      const samples = view.samples.map((s) => s.name)
      const corrections = correctionsOf(skill, name)
      printBrief(skill, { view, report, cases: view.cases, samples, corrections }, context.scoring)
    }
    // Not graded, a brief still names each case: no attempt of it is graded.
    if (values['no-grade'] && brief) briefly(null)
    const fine =
      values['no-grade'] ||
      printGraded(
        await held(context, gradeRun(skill, name, jev)),
        values.json,
        brief ? briefly : printReport,
      )
    printOpen(values.json, skill, name)
    return fine && !failed.length ? 0 : 1
  },
}
