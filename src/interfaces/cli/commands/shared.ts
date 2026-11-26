/** What more than one command does: find the skill, hold its work, ask Jev, print a report. */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { unjudged } from '@application/grade.ts'
import type { PageRenderer } from '@domain/artifact-address.ts'
import { type CallTotal, sumCalls } from '@domain/cost.ts'
import type { BenchConfig, Report } from '@domain/schemas.ts'
import { layerOrder } from '@domain/scoring.ts'
import type { SkillInfo } from '@domain/views.ts'
import { realPath } from '@infrastructure/fs.ts'
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

export function printReport(report: Report): void {
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
 * a pack failed on every one. `print` prints it where it is not JSON.
 */
export function printGraded(
  report: Report,
  json: boolean | undefined,
  print: (report: Report) => void = printReport,
): boolean {
  if (json) console.log(JSON.stringify(withCost(report), null, 2))
  else print(report)
  const { failed, total, reason } = unjudged(report)
  if (total && failed === total)
    console.error(`No output was judged, so no report was written: ${reason}`)
  return total > 0 && failed < total
}

/** A word as a shell reads it back: as it is when it is safe so, else in single quotes. */
export const shellWord = (word: string): string =>
  /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`

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
