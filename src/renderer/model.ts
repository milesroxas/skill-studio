/** Outputs across runs, their scores under the current knobs, and display names. */
import { mergeConfig } from '@domain/config.ts'
import type { PackScoring } from '@domain/pack.ts'
import { parseSampleDir } from '@domain/run-name.ts'
import type { BenchConfig, LayerHome, ReportResult, Review, Writer } from '@domain/schemas.ts'
import { checkReaders, layerOrder, type Scored, scoreResult } from '@domain/scoring.ts'
import { scorers } from '@judges/scorers.ts'
import type { RunView, Sample, State } from './api.ts'

export interface Output {
  /** `<run>/<sample>` */
  key: string
  run: RunView
  sample: Sample
  result: ReportResult | null
  caseId: string
  index: number
  /** Samples of the same case in the same run. */
  samples: number
}

/** `v2` as 2. A run with no version sorts last; v0 is a version like any other. */
const versionNumber = (run: RunView): number => {
  const number = Number(run.meta?.skillVersion.slice(1) || Number.NaN)
  return Number.isNaN(number) ? 999 : number
}

/** Every output across runs: version, then writer, then run, then sample. */
export function outputsOf(state: State): Output[] {
  const list: Output[] = []
  for (const run of state.runs) {
    const results = new Map((run.report?.results ?? []).map((r) => [r.sample, r]))
    for (const sample of run.samples) {
      const result = results.get(sample.name) ?? null
      const parsed = parseSampleDir(sample.name)
      const caseId = result?.case ?? parsed?.case ?? sample.name
      list.push({
        key: `${run.name}/${sample.name}`,
        run,
        sample,
        result,
        caseId,
        index: parsed?.index ?? 1,
        samples: run.samples.filter((s) => parseSampleDir(s.name)?.case === caseId).length,
      })
    }
  }
  return list.sort(
    (x, y) =>
      versionNumber(x.run) - versionNumber(y.run) ||
      writerName(x.run.meta?.writer).localeCompare(writerName(y.run.meta?.writer)) ||
      x.run.name.localeCompare(y.run.name) ||
      x.caseId.localeCompare(y.caseId) ||
      x.index - y.index,
  )
}

export const outputByKey = (outputs: Output[], key: string | null): Output | null =>
  key ? (outputs.find((o) => o.key === key) ?? null) : null

export const reviewOf = (state: State, key: string): Review | null =>
  state.reviews.reviews[key] ?? null

/** Scores under `config`, from the stored raw answers; null when the output is ungraded. */
export const scoreOf = (output: Output, config: BenchConfig): Scored | null =>
  output.result ? scoreResult(output.result, config, scorers) : null

/** Total under `config`; null when ungraded or no weighted layer scored. */
export const totalOf = (output: Output, config: BenchConfig): number | null =>
  scoreOf(output, config)?.scores.total ?? null

/** The mean total of a version's outputs run with the skill, under `config`; null when none is graded. */
export function versionScore(
  outputs: Output[],
  config: BenchConfig,
  version: string,
): number | null {
  const totals = outputs
    .filter(
      (o) => o.run.meta?.skillVersion === version && o.run.meta.configuration === 'with_skill',
    )
    .map((o) => totalOf(o, config))
    .filter((t): t is number => t !== null)
  return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null
}

export const mergedConfig = (saved: Partial<BenchConfig> | null): BenchConfig =>
  mergeConfig(saved, scorers)

/** Layers the active packs score, without the total. */
export const layersOf = (config: BenchConfig): string[] =>
  layerOrder(config, scorers).filter((l) => l !== 'total')

/** The active packs that mark a case's checks; empty when no judge reads them. */
export const checkReadersOf = (config: BenchConfig): PackScoring[] => checkReaders(config, scorers)

/** The packs that would mark a case's checks if they were active. */
export const CHECK_READERS: PackScoring[] = scorers.filter((p) => p.checks !== null)

export const layerHomeOf = (layer: string): LayerHome | null => {
  for (const pack of scorers) if (pack.layerHome[layer]) return pack.layerHome[layer]
  return null
}

/** How good a score out of 100 is, from high to very low; `na` when there is none. */
export type ScoreBand = 'hi' | 'mid' | 'lo' | 'vlo' | 'na'

export function scoreBand(total: number | null | undefined): ScoreBand {
  if (total === null || total === undefined) return 'na'
  if (total >= 90) return 'hi'
  if (total >= 75) return 'mid'
  if (total >= 60) return 'lo'
  return 'vlo'
}

const CLAUDE_ALIASES: Record<string, string> = {
  sonnet: 'Sonnet',
  opus: 'Opus',
  haiku: 'Haiku',
  fable: 'Fable',
}
export const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

function modelName(engine: string, model: string | null): string {
  if (!model || model === 'default') return `${capital(engine)}, default model`
  if (engine === 'claude') {
    if (CLAUDE_ALIASES[model]) return `Claude ${CLAUDE_ALIASES[model]}`
    const id = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model)
    return id ? `Claude ${capital(id[1])} ${id[2]}.${id[3]}` : model
  }
  return model
}

/** "Claude Opus 5.5", "Cursor, gpt-5 high effort". */
export function writerName(writer: Writer | undefined | null): string {
  if (!writer) return 'Unknown writer'
  const effort = writer.effort && writer.effort !== 'default' ? `, ${writer.effort} effort` : ''
  const via = writer.engine === 'cursor' ? ' via Cursor' : ''
  return `${modelName(writer.engine, writer.model)}${effort}${via}`
}

const versionOf = (run: RunView): { id: string; name: string } =>
  run.meta?.skillVersion
    ? { id: run.meta.skillVersion, name: run.meta.skillName }
    : { id: '?', name: run.name }

/** The version a run was made on: "v1". */
export const runVersion = (run: RunView): string => versionOf(run).id

/** "v2 · Claims need a source" */
export const versionName = (run: RunView): string => {
  const v = versionOf(run)
  return v.name ? `${v.id} · ${v.name}` : v.id
}

/** " · without skill", or nothing for a run with the skill. */
export function configurationTail(run: RunView): string {
  const config = run.meta?.configuration
  return config && config !== 'with_skill' ? ` · ${config.replace('_', ' ')}` : ''
}

/** "v2 · Claude Opus 5.5 · without skill" */
export const runLabel = (run: RunView): string =>
  `${versionOf(run).id} · ${writerName(run.meta?.writer)}${configurationTail(run)}`

/** A moment in the reader's own time zone, "Oct 30, 18:45"; null when the text is no date. */
export function stamp(iso: string | null | undefined): string | null {
  const at = iso ? new Date(iso) : null
  if (!at || Number.isNaN(at.getTime())) return null
  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** When the run started, so two runs of one version and writer tell apart in a picker. */
export const runStamp = (run: RunView): string => stamp(run.meta?.createdAt) ?? run.name

/** " · sample 2 of 3", or nothing when the case has one sample. */
export const sampleTail = (output: Output): string =>
  output.samples > 1 ? ` · sample ${output.index} of ${output.samples}` : ''

/** "Claude Opus 5.5 · sample 2 of 2" */
export const outputLine = (output: Output): string =>
  `${writerName(output.run.meta?.writer)}${sampleTail(output)}`

export function caseTitle(state: State, caseId: string): string {
  const found = state.cases.find((c) => c.id === caseId)
  return found ? found.title || found.id : caseId
}

export const primaryOf = (output: Output) =>
  output.result?.primary ??
  output.sample.artifacts.find((a) => a.kind === 'markdown') ??
  output.sample.artifacts[0] ??
  null

/** "31 words · case asks 30 to 120", only where words mean something: prose, or a case with a length. */
export function sizeLine(output: Output): string | null {
  const words = output.result?.words
  const range = output.result?.range
  if (range) return `${words ?? '?'} words · case asks ${range[0]} to ${range[1]}`
  return primaryOf(output)?.kind === 'markdown' && words ? `${words} words` : null
}

/** Cents, or four places for an amount under ten cents. `places` holds a column to one precision. */
export const money = (value: number | null | undefined, places?: number): string =>
  value === null || value === undefined ? '–' : `$${value.toFixed(places ?? (value < 0.1 ? 4 : 2))}`

/**
 * The places every amount in a column takes, so its decimal points line up:
 * four once any amount is under ten cents, else two.
 */
export const moneyPlaces = (values: Array<number | null | undefined>): number =>
  values.some((v) => v !== null && v !== undefined && v < 0.1) ? 4 : 2

export const fmt = (value: number | null, places = 1): string =>
  value === null ? '–' : value.toFixed(places)

/** `1 case`, `3 cases`. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`

/** `Oct 26`, with the year only when it is not this one. */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  const year = date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year })
}
