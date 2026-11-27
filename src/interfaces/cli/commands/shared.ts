/** What more than one command does: find the skill, hold its work, ask Jev, print a report. */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { unjudged } from '@application/grade.ts'
import type { PageRenderer } from '@domain/artifact-address.ts'
import { type CallTotal, dollars, type RunSpent, runSpent, sumCalls } from '@domain/cost.ts'
import { type RunNamed, runNamed } from '@domain/run-name.ts'
import type { BenchConfig, Report, RunMeta } from '@domain/schemas.ts'
import { layerOrder } from '@domain/scoring.ts'
import type { SkillInfo, SkillVersion } from '@domain/views.ts'
import { realPath } from '@infrastructure/fs.ts'
import { answerCosts, readRunMeta, versionsOf } from '@infrastructure/runs.ts'
import { skillInfo } from '@infrastructure/skill.ts'
import { Jev } from '@judges/jev.ts'
import { meterNow } from '@judges/meter.ts'
import { scorers } from '@judges/scorers.ts'
import type { Lifecycle } from '../../lifecycle.ts'
import { drawingHost } from '../drawing.ts'
import type { Context, FlagValues, Values } from './command.ts'
import { GRADING, shared } from './flags.ts'

export const pad = (value: unknown, width: number): string => String(value ?? '-').padStart(width)
export const padEnd = (value: unknown, width: number): string =>
  String(value ?? '-')
    .slice(0, width - 1)
    .padEnd(width)

/**
 * The width of a column that holds each of `values` whole with a space after
 * it, as `padEnd` prints them: `least` while every one fits in that, so a
 * table of short names prints as it always has.
 */
export const widthOf = (values: readonly unknown[], least: number): number =>
  Math.max(least, ...values.map((value) => String(value ?? '-').length + 1))

const grading = shared(...GRADING)

/** The context a command runs in: what followed its name, the flags, and the grading they ask for. */
export function contextOf(
  args: readonly string[],
  values: Values,
  lifecycle: Lifecycle | null,
): Context {
  const flags = values as FlagValues<typeof grading>
  /** The scoring the flags ask for, laid over the skill's `bench.json`. */
  const scoring = {
    packs: flags.packs ? flags.packs.split(',').map((p) => p.trim()) : undefined,
    config: flags.bench
      ? (JSON.parse(readFileSync(resolve(flags.bench), 'utf8')) as Partial<BenchConfig>)
      : undefined,
  }
  const jev = {
    ...scoring,
    useJev: !flags['no-jev'] && Jev.available(),
    model: flags['jev-model'],
    log: (line: string) => console.error(line),
    // Ctrl-C stops a grading as Stop does in the app: a check it cut short is no answer.
    signal: lifecycle?.signal,
  }
  return { args, values, lifecycle, scoring, jev }
}

/**
 * `value` as `--json` prints it: with `cost`, every model call made under the
 * meter it is printed in, added up by operation, provider, model and source.
 */
export const withCost = <T extends object>(value: T): T & { cost: CallTotal[] } => ({
  ...value,
  cost: sumCalls(meterNow()?.calls ?? []),
})

/** Whether the flags ask for Jev: they do unless `--no-jev` is given. */
export const wantsJev = (context: Context): boolean => !context.values['no-jev']

/** Say that a grading goes on without Jev, when it does for want of a key. */
export function noteNoKey(context: Context): void {
  if (wantsJev(context) && !Jev.available())
    console.error('TYPESAFE_API_KEY is not set: grading without Jev.')
}

/**
 * What a grading draws pages with: the drawing host, as the desktop app
 * draws them. None with `--no-draw`, and none when Jev does not grade, since
 * only Jev looks at a page. The host starts at the first page drawn; where it
 * cannot, the reason is said then, once, and the grading is undrawn.
 */
export function drawingOf(context: Context): PageRenderer | undefined {
  if (context.values['no-draw'] || !context.jev.useJev) return undefined
  return drawingHost({ warn: (line) => console.error(line), signal: context.lifecycle?.signal })
}

/** The command's own run or grading, held so a Ctrl-C lets it write what it has as it stops. */
export const held = <T>(context: Context, work: Promise<T>): Promise<T> =>
  context.lifecycle?.during(work) ?? work

/**
 * The one run `--run` names, for a command that reads one: the last given.
 * The flag is given once for each run where `st sheet` reads it.
 */
export function oneRun(values: Context['values']): string | undefined {
  const run = values.run
  return typeof run === 'string' ? run : Array.isArray(run) ? run.at(-1) : undefined
}

/** What stops the command's work: Ctrl-C, through its lifecycle. */
export const signalOf = (context: Context): AbortSignal =>
  context.lifecycle?.signal ?? new AbortController().signal

/**
 * The skill dir among the positionals: the first that has a SKILL.md, else
 * cwd. Links on the way are resolved, as the app resolves them, so the folder
 * a sample is in is the one its agent named in its transcript.
 */
function pickSkill(positionals: readonly string[]): { skill: string; rest: string[] } {
  const index = positionals.findIndex((p) => existsSync(join(resolve(p), 'SKILL.md')))
  if (index < 0) {
    if (!existsSync(join(process.cwd(), 'SKILL.md')))
      throw new Error('No SKILL.md here. Pass the skill directory.')
    return { skill: realPath(process.cwd()), rest: [...positionals] }
  }
  return {
    skill: realPath(resolve(positionals[index])),
    rest: positionals.filter((_, i) => i !== index),
  }
}

/** The skill a command works on, what else was passed, and the skill's name and path. */
export function skillOf(args: readonly string[]): {
  skill: string
  rest: string[]
  info: SkillInfo
} {
  const { skill, rest } = pickSkill(args)
  return { skill, rest, info: skillInfo(skill) }
}

/**
 * How a command names each run of the skill to a reader (`runNamed`): by its
 * folder and the version it ran, with that version's name as `st versions`
 * lists it. The versions are read once, at the first run named; a run's
 * `run.json` is read where its `meta` is not handed in. Naming a run is only
 * for show, and comes after work that must not be lost, such as a run's
 * agents: where the files cannot be read, the run is named by what can be,
 * or by its folder alone, and nothing is thrown.
 */
export function runNamer(skill: string): (run: string, meta?: RunMeta | null) => RunNamed {
  let versions: SkillVersion[] | null = null
  return (run, given) => {
    try {
      versions ??= versionsOf(skill).versions
    } catch {
      versions = []
    }
    try {
      return runNamed(run, given === undefined ? readRunMeta(skill, run) : given, versions)
    } catch {
      return runNamed(run, null, [])
    }
  }
}

/** What a run spent, from each attempt's `timing.json` and its `report`, as `st report` prints it. */
export const spentOf = (skill: string, run: string, report: Report | null): RunSpent =>
  runSpent(answerCosts(skill, run), report)

/** A count as the report writes one: "83,305". */
const counted = (n: number): string => n.toLocaleString('en-US')

/** Seconds added up: tenths under ten, whole from there. */
const secondsOf = (seconds: number): string =>
  `${seconds < 10 ? Math.round(seconds * 10) / 10 : Math.round(seconds)} s`

/** What answering cost: each figure over the attempts that kept it, said where they are not all. */
function answeringWords({ attempts, answering }: RunSpent): string {
  if (!attempts) return 'no attempt ran'
  const over = (n: number): string => (n < attempts ? ` for ${n} of them` : '')
  const { seconds, tokens, usd } = answering
  return [
    `answering ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`,
    seconds.attempts ? `${secondsOf(seconds.total)}${over(seconds.attempts)}` : 'no time kept',
    tokens.attempts
      ? `${counted(tokens.input)} input and ${counted(tokens.output)} output tokens${over(tokens.attempts)}`
      : 'no tokens kept',
    // Only a price the attempts kept: none is made up from tokens.
    usd.attempts ? `${dollars(usd.total)}${over(usd.attempts)}` : 'no price kept',
  ].join(', ')
}

/** What grading cost, as the report keeps it: never a nought where it kept nothing. */
function gradingWords({ graded, grading }: RunSpent): string {
  // Not graded, or graded with nothing judged, so no report was written.
  if (!graded) return 'no grading kept'
  if (!grading) return 'grading not counted, as it was graded before gradings kept their cost'
  const asked = grading.calls.filter((c) => c.source === 'asked')
  const sum = (key: 'calls' | 'input' | 'output' | 'seconds'): number =>
    asked.reduce((total, c) => total + c[key], 0)
  const replayed = grading.calls
    .filter((c) => c.source === 'replayed')
    .reduce((total, c) => total + c.calls, 0)
  const calls = sum('calls')
  const to = asked.every((c) => c.provider === 'jev') ? 'to Jev' : 'to models'
  return [
    'grading',
    ...(calls
      ? [
          `${calls} ${calls === 1 ? 'call' : 'calls'} ${to}`,
          `${counted(sum('input'))} input${sum('output') ? ` and ${counted(sum('output'))} output` : ''} tokens`,
          secondsOf(sum('seconds')),
        ]
      : replayed
        ? []
        : ['no model calls']),
    ...(replayed ? [`${replayed} replayed from saved replies, which cost nothing`] : []),
    ...(grading.whole ? [] : ['and an earlier grading not counted']),
  ].join(', ')
}

/**
 * The one line that says what a run spent: answering, over its attempts, and
 * grading, as its report keeps it. `who` names the run where two are printed:
 * "A spent:".
 */
export const spentLine = (spent: RunSpent, who = ''): string =>
  `${who ? `${who} spent` : 'Spent'}: ${answeringWords(spent)}; ${gradingWords(spent)}`

export function printReport(report: Report): void {
  const layers = layerOrder(report.config, scorers)
  // Each sample and case whole, as `--case` takes it: a column widens for a long one.
  const samples = widthOf(
    report.results.map((r) => r.sample),
    36,
  )
  const cases = widthOf(
    report.results.map((r) => r.case),
    22,
  )
  console.log(
    `\n${padEnd('sample', samples)}${padEnd('case', cases)}${layers.map((l) => pad(l, 11)).join('')}`,
  )
  for (const r of report.results)
    console.log(
      `${padEnd(r.sample, samples)}${padEnd(r.case, cases)}${layers.map((l) => pad(r.scores[l], 11)).join('')}`,
    )
  for (const r of report.results) {
    if (!r.flags.length) continue
    console.log(`\n${r.sample}`)
    for (const flag of r.flags) console.log(`  - ${flag}`)
  }
  const { overrides } = report
  if (overrides)
    console.log(
      `\nGraded with ${[
        overrides.packs ? `--packs ${overrides.packs.join(',')}` : null,
        overrides.bench ? '--bench' : null,
      ]
        .filter(Boolean)
        .join(
          ' and ',
        )} laid over bench.json: the app scores it under bench.json, and gives no total where they changed what was asked.`,
    )
  console.log(
    `\n${report.results.length} output(s), ${report.model ?? 'no Jev'}, ${report.inputTokens.toLocaleString()} input tokens${report.asked ? ` (${report.asked.inputTokens.toLocaleString()} paid by this grading)` : ''}, ${report.seconds} s`,
  )
}

/**
 * Print what a grading made of a run. False when it judged no output, so it
 * wrote no report and the command has not done what it was asked: the grading
 * said so itself when there was no output, and the reason is printed here when
 * a pack failed on every one. `print` prints it where it is not JSON, and
 * `more` is laid beside the report where it is.
 */
export function printGraded(
  report: Report,
  json: boolean | undefined,
  print: (report: Report) => void = printReport,
  more: object = {},
): boolean {
  if (json) console.log(JSON.stringify(withCost({ ...report, ...more }), null, 2))
  else print(report)
  const { failed, total, reason } = unjudged(report)
  if (total && failed === total)
    console.error(`No output was judged, so no report was written: ${reason}`)
  return total > 0 && failed < total
}

/**
 * A word as a shell reads it back: as it is when it is safe so, else quoted.
 * On macOS and Linux in single quotes. On Windows, where PowerShell and
 * cmd.exe both keep a backslash and a tilde as they are, and read double
 * quotes but cmd.exe does not read single ones, in double quotes: a Windows
 * path cannot hold one.
 */
export const shellWord = (word: string, platform: NodeJS.Platform = process.platform): string => {
  if (platform === 'win32') return /^[\w.:\\/~-]+$/.test(word) ? word : `"${word}"`
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`
}

/**
 * The line that says how to open Results on one or two runs: `st run` and
 * `st compare` start no server to give an address on, so they print the
 * command that does. Not with `--json`, whose output is read as JSON.
 */
export function printOpen(json: boolean | undefined, skill: string, a: string, b?: string): void {
  if (json) return
  const runs = [`--a ${shellWord(a)}`, b === undefined ? null : `--b ${shellWord(b)}`]
  console.log(`\nOpen: pnpm st open ${shellWord(skill)} ${runs.filter(Boolean).join(' ')}`)
}
