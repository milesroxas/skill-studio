/** Outputs across runs, their scores under the current knobs, and display names. */
import { mergeConfig } from '@domain/config.ts'
import { parseSampleDir } from '@domain/run-name.ts'
import type { BenchConfig, LayerHome, ReportResult, Review, Writer } from '@domain/schemas.ts'
import { layerOrder, type Scored, scoreResult } from '@domain/scoring.ts'
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

const versionNumber = (run: RunView): number => Number(run.meta?.skillVersion.slice(1)) || 999

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

export const mergedConfig = (saved: Partial<BenchConfig> | null): BenchConfig =>
  mergeConfig(saved, scorers)

/** Layers the active packs score, without the total. */
export const layersOf = (config: BenchConfig): string[] =>
  layerOrder(config, scorers).filter((l) => l !== 'total')

export const layerHomeOf = (layer: string): LayerHome | null => {
  for (const pack of scorers) if (pack.layerHome[layer]) return pack.layerHome[layer]
  return null
}

export function chipClass(total: number | null | undefined): string {
  if (total === null || total === undefined) return ''
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

/** When the run started, "Oct 30 18:45", so two runs of one version and writer tell apart in a picker. */
export function runStamp(run: RunView): string {
  const at = run.meta?.createdAt ? new Date(run.meta.createdAt) : null
  if (!at || Number.isNaN(at.getTime())) return run.name
  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

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

export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? '–' : `$${value.toFixed(value < 0.1 ? 4 : 2)}`

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
