#!/usr/bin/env node
/**
 * `st`: the Skill Studio command line. Every command takes a skill directory
 * (default: the current directory) and works on its `evals/`.
 *
 *   st cases [skill]
 *   st run [skill] --engine claude --model sonnet --cases a,b --samples 2
 *   st grade [skill] --run <name> | --all   [--no-jev]
 *   st report [skill] --run <name>
 *   st compare [skill] <runA> <runB>
 *   st self-test [skill] [--no-jev]
 *   st versions [skill]
 *   st serve [skill...] [--port 4400] [--tailscale [--tailscale-port 8443]]
 *   st new <dir> [--name <id>] [--description <text>]
 *
 * `run`, `grade` and `serve` start agents, so each ends them before it goes:
 * on Ctrl-C, and when it is asked to stop.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { generateRun } from '@application/generate.ts'
import { compareReports, gradeAnchors, gradeRun, selfTest } from '@application/grade.ts'
import type { BenchConfig, Report } from '@domain/schemas.ts'
import { layerOrder } from '@domain/scoring.ts'
import { TEMPLATE_IDS, type TemplateId, templateById } from '@domain/templates.ts'
import { isSlug, SLUG_RULE } from '@domain/text.ts'
import { loadCases, saveCase } from '@infrastructure/cases.ts'
import { engineById, engines } from '@infrastructure/engines/index.ts'
import { listRuns, readRun, runDir, versionsOf } from '@infrastructure/runs.ts'
import { newSkill, skillInfo } from '@infrastructure/skill.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import { loadEnv } from '../host.ts'
import { TOKEN_PARAM } from '../http/guard.ts'
import { DEFAULT_PORT, startServer } from '../http/server.ts'
import { DEFAULT_TAILSCALE_PORT, serveOnTailnet, tailnetIdentity } from '../http/tailscale.ts'
import { agentLifecycle, keepRunning } from '../lifecycle.ts'
import { countOf, generateInputOf, openCommand, portOf, runNameOf, withHint } from './input.ts'

const HELP = `Usage: st <command> [skill-dir] [options]

Commands
  cases                       List the skill's cases.
  run                         Generate outputs with a headless agent, then grade them.
    --engine <id>             claude (default) or cursor.
    --model <id>              Engine model; default per engine.
    --effort <level>          Engine effort; default per engine.
    --cases <a,b>             Case ids; default every case.
    --samples <n>             Samples per case (default 1).
    --configuration <c>       with_skill (default), without_skill, old_skill.
    --baseline <run>          For old_skill: the run whose _skill/ to use.
    --name <text>             Name the skill version when the tree changed.
    --note <text>             Note on the version.
    --parallel <n>            Samples in flight (default 3).
    --no-grade                Skip grading after generation.
  grade                       Grade a run: --run <name> or --all.
  report                      Print a run's report: --run <name>.
  compare <runA> <runB>       Score deltas between two graded runs.
  self-test                   Grade evals/anchors and check bad anchors lose to good ones.
  versions                    Skill versions seen in runs, and the working tree's.
  new <dir>                   Scaffold a skill: SKILL.md and an empty evals/cases/.
    --name <id>               Skill name; default the folder name.
    --description <text>      Front matter description.
    --template <id>           blank (default), writing, code, workflow or design.
    --with-cases              Also write the template's sample cases.
  serve [skill...]            Start the app (--port ${DEFAULT_PORT}; --open opens a browser).
                              It prints the address to open, which carries this start's token.
                              With no skill it opens on the library of skills on this machine.
                              --tailscale also serves it on this machine's tailnet name
                              (--tailscale-port ${DEFAULT_TAILSCALE_PORT}), for your own Tailscale login only.

Common
  --no-jev                    Grade without TypeSafe calls (code checks only).
  --packs <a,b>               Judge packs to run, instead of bench.json's list.
  --bench <file>              A bench.json laid over the skill's for this grading.
  --jev-model <id>            Jev version to judge with.
  --json                      Print JSON instead of a table.
  -h, --help                  This help.`

const OPTIONS = {
  engine: { type: 'string' },
  model: { type: 'string' },
  effort: { type: 'string' },
  cases: { type: 'string' },
  samples: { type: 'string' },
  configuration: { type: 'string' },
  baseline: { type: 'string' },
  name: { type: 'string' },
  note: { type: 'string' },
  parallel: { type: 'string' },
  'no-grade': { type: 'boolean' },
  run: { type: 'string' },
  all: { type: 'boolean' },
  'no-jev': { type: 'boolean' },
  'jev-model': { type: 'string' },
  packs: { type: 'string' },
  bench: { type: 'string' },
  port: { type: 'string' },
  open: { type: 'boolean' },
  tailscale: { type: 'boolean' },
  'tailscale-port': { type: 'string' },
  description: { type: 'string' },
  template: { type: 'string' },
  'with-cases': { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const

const pad = (value: unknown, width: number): string => String(value ?? '-').padStart(width)
const padEnd = (value: unknown, width: number): string =>
  String(value ?? '-')
    .slice(0, width - 1)
    .padEnd(width)

/** The skill dir among the positionals: the first that has a SKILL.md, else cwd. */
function pickSkill(positionals: string[]): { skill: string; rest: string[] } {
  const index = positionals.findIndex((p) => existsSync(join(resolve(p), 'SKILL.md')))
  if (index < 0) {
    if (!existsSync(join(process.cwd(), 'SKILL.md')))
      throw new Error('No SKILL.md here. Pass the skill directory.')
    return { skill: process.cwd(), rest: positionals }
  }
  return { skill: resolve(positionals[index]), rest: positionals.filter((_, i) => i !== index) }
}

function printReport(report: Report): void {
  const layers = layerOrder(report.config, scorers)
  console.log(
    `\n${padEnd('sample', 36)}${padEnd('case', 22)}${layers.map((l) => pad(l, 11)).join('')}`,
  )
  for (const r of report.results)
    console.log(
      `${padEnd(r.sample, 36)}${padEnd(r.case, 22)}${layers.map((l) => pad(r.scores[l], 11)).join('')}`,
    )
  for (const r of report.results) {
    if (!r.flags.length) continue
    console.log(`\n${r.sample}`)
    for (const flag of r.flags) console.log(`  - ${flag}`)
  }
  console.log(
    `\n${report.results.length} output(s), ${report.model ?? 'no Jev'}, ${report.inputTokens.toLocaleString()} input tokens, ${report.seconds} s`,
  )
}

async function main(): Promise<number> {
  loadEnv()
  const { values, positionals } = parseArgs({ allowPositionals: true, options: OPTIONS })
  const [command, ...args] = positionals
  if (values.help || !command) {
    console.log(HELP)
    // Asking for the help succeeds; running with no command is a usage error.
    return values.help ? 0 : 2
  }
  const jevOptions = {
    useJev: !values['no-jev'] && Jev.available(),
    model: values['jev-model'],
    packs: values.packs ? values.packs.split(',').map((p) => p.trim()) : undefined,
    config: values.bench
      ? (JSON.parse(readFileSync(resolve(values.bench), 'utf8')) as Partial<BenchConfig>)
      : undefined,
    log: (line: string) => console.error(line),
  }
  if (!values['no-jev'] && !Jev.available() && ['run', 'grade', 'self-test'].includes(command))
    console.error('TYPESAFE_API_KEY is not set: grading without Jev.')
  // These start agents: the ones an earlier copy left are ended first, and Ctrl-C ends this copy's.
  if (['run', 'grade', 'serve'].includes(command)) agentLifecycle({ signals: true })
  // A server outlives any one request: an error nothing caught is logged, not the end of every job.
  if (command === 'serve') keepRunning()

  if (command === 'new') {
    const dir = args[0]
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
  }

  if (command === 'serve') {
    const here = existsSync(join(process.cwd(), 'SKILL.md')) ? [process.cwd()] : []
    const skills = args.length ? args.map((p) => resolve(p)) : here
    const port = portOf(values.port, '--port')
    const httpsPort = portOf(values['tailscale-port'], '--tailscale-port')
    if (httpsPort && !values.tailscale) throw new Error('--tailscale-port needs --tailscale.')
    const remote = values.tailscale ? await tailnetIdentity() : null
    const server = await startServer({ skills, port, remote })
    // The address carries the token every request needs, from this machine or the tailnet.
    console.log(`Skill Studio: ${server.url}${skills.length ? `  (${skills.join(', ')})` : ''}`)
    if (remote) {
      try {
        const tailnet = await serveOnTailnet(
          server.port,
          remote.host,
          httpsPort ?? DEFAULT_TAILSCALE_PORT,
        )
        // The tailnet asks for the token too: the login alone can be forged from this machine.
        console.log(
          `tailnet:      ${tailnet.url}/?${TOKEN_PARAM}=${server.token}  (${remote.users.join(', ')} only)`,
        )
      } catch (error) {
        // The local server is already listening and would keep the process alive.
        console.error((error as Error).message)
        process.exit(2)
      }
    }
    if (values.open) {
      // The opener's command line is anyone's to list: it gets a ticket good for one load, never the token.
      const {
        command: opener,
        args: openerArgs,
        verbatim,
      } = openCommand(process.platform, server.ticketUrl())
      const child = spawn(opener, openerArgs, {
        stdio: 'ignore',
        detached: true,
        windowsVerbatimArguments: verbatim,
      })
      // A system with no opener: the server is up all the same, and its address is printed.
      child.on('error', (error) =>
        console.error(`Could not open a browser (${error.message}). Open the address above.`),
      )
      child.unref()
    }
    return 0
  }

  const { skill, rest } = pickSkill(args)
  const info = skillInfo(skill)

  if (command === 'cases') {
    const cases = loadCases(skill)
    if (values.json) console.log(JSON.stringify(cases, null, 2))
    else {
      console.log(`${info.name}: ${cases.length} case(s)`)
      for (const c of cases)
        console.log(
          `  ${padEnd(c.id, 34)} ${c.graders.length} grader(s)${c.files.length ? `, ${c.files.length} file(s)` : ''}  ${c.title}`,
        )
    }
    return 0
  }

  if (command === 'versions') {
    const versions = versionsOf(skill)
    if (values.json) console.log(JSON.stringify(versions, null, 2))
    else {
      for (const v of versions.versions)
        console.log(`  ${v.version}  ${v.hash}  ${v.date ?? ''}  ${v.name}`)
      const c = versions.current
      console.log(
        c.changed
          ? `Working tree: ${c.version} (new, unnamed) ${c.hash}`
          : `Working tree: ${c.version} ${c.name}`,
      )
    }
    return 0
  }

  if (command === 'run') {
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
    const { name } = await generateRun({
      skillDir: skill,
      cases: selected,
      engine,
      model: choice.model || null,
      effort: choice.effort || null,
      samples: input.samples,
      configuration: input.configuration,
      baselineRun: input.baselineRun,
      skillName: input.skillName,
      note: input.note,
      parallel,
      log: (line) => console.error(line),
    })
    console.log(`Run: ${runDir(skill, name)}`)
    if (values['no-grade']) return 0
    const report = await gradeRun(skill, name, jevOptions)
    if (values.json) console.log(JSON.stringify(report, null, 2))
    else printReport(report)
    return 0
  }

  if (command === 'grade') {
    const names = values.all
      ? listRuns(skill).map((r) => r.name)
      : values.run
        ? [runNameOf(values.run, '--run')]
        : []
    if (!names.length) throw new Error('Pass --run <name> or --all.')
    for (const name of names) {
      const report = await gradeRun(skill, name, jevOptions)
      console.log(`\n${name}`)
      if (values.json) console.log(JSON.stringify(report, null, 2))
      else printReport(report)
    }
    return 0
  }

  if (command === 'report') {
    if (!values.run) throw new Error('Pass --run <name>.')
    const view = readRun(skill, runNameOf(values.run, '--run'))
    if (!view.report)
      throw new Error(`${values.run} is not graded. Run: st grade --run ${values.run}`)
    if (values.json) console.log(JSON.stringify(view.report, null, 2))
    else printReport(view.report)
    return 0
  }

  if (command === 'compare') {
    const [a, b] = rest
    if (!a || !b) throw new Error('Pass two run names.')
    const load = (name: string) => {
      const { report } = readRun(skill, runNameOf(name, '`st compare`'))
      if (!report) throw new Error(`${name} has no report.json.`)
      return report
    }
    const rows = compareReports(load(a), load(b))
    const layers = rows.length ? Object.keys(rows[0].deltas) : []
    console.log(`\n${padEnd('sample', 44)}${layers.map((l) => pad(l, 11)).join('')}`)
    for (const row of rows)
      console.log(
        `${padEnd(row.key, 44)}${layers
          .map((l) => {
            const d = row.deltas[l]
            return pad(d === null ? '-' : `${d > 0 ? '+' : ''}${d}`, 11)
          })
          .join('')}`,
      )
    return 0
  }

  if (command === 'self-test') {
    const report = await gradeAnchors(skill, jevOptions)
    printReport(report)
    const { lines, failures } = selfTest(report)
    console.log('\nSelf-test: each bad anchor must score below its good anchor on what it tests.')
    for (const l of lines)
      console.log(
        `  ${l.ok ? 'ok  ' : 'FAIL'} ${padEnd(l.bad, 40)} ${padEnd(l.layer, 12)} good ${pad(l.good, 4)}  bad ${pad(l.badScore, 4)}`,
      )
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
    return failures ? 1 : 0
  }

  throw new Error(`Unknown command ${command}.\n\n${HELP}`)
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: Error) => {
    // The flag that would fix it is the command line's to name.
    console.error(withHint(error.message))
    process.exitCode = 2
  },
)
