/** Outputs across runs, their scores under the skill's scoring, the pair to compare per case, and display names. */
import { BASE_PACK, mergeConfig } from '@domain/config.ts'
import { type Lift, type LiftRun, liftWriter, versionLift, writerKey } from '@domain/lift.ts'
import { type Corrections, NO_CORRECTIONS } from '@domain/pack.ts'
import { defaultPair, type PairOutput } from '@domain/pairs.ts'
import { drawnArtifact, primaryArtifact } from '@domain/primary.ts'
import { versionAfterRunDelete } from '@domain/run-delete.ts'
import { parseSampleDir } from '@domain/run-name.ts'
import type {
  Artifact,
  ArtifactKind,
  BenchConfig,
  Report,
  ReportResult,
  Writer,
} from '@domain/schemas.ts'
import { layerOrder, pixelText, type Scored, scoreResult } from '@domain/scoring.ts'
import { mean } from '@domain/stats.ts'
import { type Count, countOf, finding, sumCounts } from '@domain/verdict.ts'
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
  /** Your own answers on this output's verdicts, which stand over Jev's. */
  corrections: Corrections
  /** The file that stands for the output: the one graded, else the one grading would judge. */
  primary: Artifact | null
}

/** `v2` as 2. A run with no version sorts last; v0 is a version like any other. */
const versionNumber = (run: RunView): number => {
  const number = Number(run.meta?.skillVersion.slice(1) || Number.NaN)
  return Number.isNaN(number) ? 999 : number
}

/** One sample of `run` as Results reads it. `judged` are the kinds the skill's packs judge. */
function outputOf(
  state: State,
  run: RunView,
  sample: Sample,
  result: ReportResult | null,
  judged: readonly ArtifactKind[],
): Output {
  const parsed = parseSampleDir(sample.name)
  const caseId = result?.case ?? parsed?.case ?? sample.name
  const key = `${run.name}/${sample.name}`
  const preferred = state.cases.find((c) => c.id === caseId)?.bench.artifact
  return {
    key,
    run,
    sample,
    result,
    caseId,
    index: parsed?.index ?? 1,
    samples: run.samples.filter((s) => parseSampleDir(s.name)?.case === caseId).length,
    corrections: state.reviews.reviews[key]?.corrections ?? NO_CORRECTIONS,
    // The file graded, else the one grading would judge.
    primary: result?.primary ?? primaryArtifact(sample.artifacts, preferred, judged),
  }
}

/** Every output across runs: version, then writer, then run, then sample. */
export function outputsOf(state: State): Output[] {
  const judged = scorers
    .filter((s) => state.config.packs.includes(s.id))
    .flatMap((s) => s.artifacts)
  const list = state.runs.flatMap((run) => {
    const results = new Map((run.report?.results ?? []).map((r) => [r.sample, r]))
    return run.samples.map((sample) =>
      outputOf(state, run, sample, results.get(sample.name) ?? null, judged),
    )
  })
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

/** A pack that threw while grading, as the report notes it: its layers are missing for that reason. */
const FAILED = /^\w+ pack failed: (.*)$/

/** The last score worked out for an output, and the scoring it was worked out under. */
const scoredBy = new WeakMap<Output, { config: BenchConfig; scored: Scored }>()

/**
 * Scores and verdicts under `config`, from the stored raw answers with your
 * corrections over them; null when the output is ungraded. Screens ask for the
 * same output's score many times over, so the last answer is kept.
 */
export function scoreOf(output: Output, config: BenchConfig): Scored | null {
  if (!output.result) return null
  const kept = scoredBy.get(output)
  if (kept?.config === config) return kept.scored
  const base = scoreResult(output.result, config, scorers, output.corrections)
  const failures = output.result.flags.flatMap((flag) => {
    const failed = FAILED.exec(flag)
    return failed ? [finding(`Grading failed: ${failed[1]}`)] : []
  })
  const scored = failures.length ? { ...base, verdicts: [...failures, ...base.verdicts] } : base
  scoredBy.set(output, { config, scored })
  return scored
}

/** Total under `config`; null when ungraded or no weighted layer scored. */
export const totalOf = (output: Output, config: BenchConfig): number | null =>
  scoreOf(output, config)?.scores.total ?? null

/** Each case's mean total over its graded outputs among `outputs`, by case id; a case with none graded is absent. */
function caseMeans(outputs: Output[], config: BenchConfig): Record<string, number> {
  const totals = new Map<string, number[]>()
  for (const o of outputs) {
    const total = totalOf(o, config)
    if (total !== null) totals.set(o.caseId, [...(totals.get(o.caseId) ?? []), total])
  }
  return Object.fromEntries([...totals].map(([id, list]) => [id, mean(list) as number]))
}

/** The runs as the lift reads them: each with its writer, version and a mean per case. */
const liftRuns = (runs: RunView[], outputs: Output[], config: BenchConfig): LiftRun[] =>
  runs.map((run) => ({
    name: run.name,
    version: runVersion(run),
    writer: writerKey(run.meta?.writer),
    configuration: run.meta?.configuration ?? 'with_skill',
    createdAt: run.meta?.createdAt ?? '',
    cases: caseMeans(
      outputs.filter((o) => o.run.name === run.name),
      config,
    ),
  }))

/**
 * How much the skill's edits raised its score: one writer's first version
 * against the same writer's latest, with its run without the skill as the
 * floor, over the cases both runs answered. Null until one writer has run
 * two versions with a case in common.
 */
export const liftOf = (state: State, outputs: Output[], config: BenchConfig): Lift | null =>
  versionLift(liftRuns(state.runs, outputs, config))

/** The versions that have outputs written with the skill, oldest first: "v0", "v1". */
export function versionsRun(outputs: Output[]): string[] {
  const seen = new Set(
    outputs
      .filter((o) => o.run.meta?.configuration === 'with_skill')
      .map((o) => o.run.meta?.skillVersion ?? '')
      .filter((v) => /^v\d+$/.test(v)),
  )
  return [...seen].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))
}

/** A version's outputs written with the skill as it was then. */
export const versionOutputs = (outputs: Output[], version: string): Output[] =>
  outputs.filter(
    (o) => o.run.meta?.skillVersion === version && o.run.meta.configuration === 'with_skill',
  )

/**
 * A version's score under `config`: each case's mean over its graded outputs,
 * then the mean of those cases, so a case run three times counts once. Where
 * the writer the lift compares ran this version, only that writer's outputs
 * count, so one version's score is read against the next. Null when none is graded.
 */
export function versionScore(
  outputs: Output[],
  config: BenchConfig,
  version: string,
): number | null {
  const mine = versionOutputs(outputs, version)
  const runs = [...new Map(outputs.map((o) => [o.run.name, o.run])).values()]
  const writer = liftWriter(liftRuns(runs, outputs, config))
  const pinned = writer ? mine.filter((o) => writerKey(o.run.meta?.writer) === writer) : []
  return mean(Object.values(caseMeans(pinned.length ? pinned : mine, config)))
}

export const mergedConfig = (saved: Partial<BenchConfig> | null): BenchConfig =>
  mergeConfig(saved, scorers)

/** The parts of a score under `config`, in the order they are shown, without the total. */
export const layersOf = (config: BenchConfig): string[] =>
  layerOrder(config, scorers).filter((l) => l !== 'total')

/**
 * True for a report Jev graded that marked no rule or check on some output
 * with something in it: one from before rules and checks were marked on every
 * kind of file, when a page, a picture or code got none. Regrading marks them.
 */
export const rulesUnmarked = (report: Pick<Report, 'model' | 'results'>): boolean =>
  report.model !== null &&
  report.results.some(
    (result) =>
      result.primary !== null &&
      // Text always had its rules marked: one with none has no rules or was not asked about.
      result.primary.kind !== 'markdown' &&
      !result.blank &&
      (result.packs.generic ?? null) === null,
  )

/** What each part of a score is called where a reader meets it. */
const PART_LABEL: Record<string, string> = {
  adherence: 'Rules',
  rubric: 'Checks',
  check: 'Check command',
  visual: 'Look',
}

/** A part of a score by the name a reader knows it by: the rules followed, the checks met. */
export const partLabel = (layer: string): string => PART_LABEL[layer] ?? capital(layer)

/** A kind of work Jev can grade, by its name: "Writing". */
export const kindLabel = (pack: string): string => capital(pack)

/** The kinds a skill can be graded as beyond its rules and checks, which every skill is graded on. */
export const extraKinds = (packs: readonly string[]): string[] =>
  packs.filter((id) => id !== BASE_PACK)

/** What ticking a kind adds to the grade, under its name. */
const KIND_HINT: Record<string, string> = {
  code: 'Whether the check command a case names in its case.yaml passes.',
  workflow:
    'How the work was done: repeated steps, staying in its own folder, and what came after an error.',
  design: 'How a page or a picture looks: one clear main point, and nothing broken.',
}

export const kindHint = (pack: string): string => KIND_HINT[pack] ?? ''

/** How a skill is graded, in a line: its rules and checks, and the kinds ticked beside them. */
export const gradedLine = (packs: readonly string[]): string => {
  const kinds = extraKinds(packs)
  return kinds.length ? `Graded as ${kindsLine(kinds)}` : 'Graded on rules and checks'
}

/** Kinds of work as a spoken list, in the order given: "Code, Workflow and Design". */
export const kindsLine = (ids: readonly string[], last = 'and'): string =>
  listLine(ids.map(kindLabel), last)

/** Words in a line, the last after `last` with no comma before it: "a, b and c". */
export const listLine = (items: readonly string[], last = 'and'): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}` : (items[0] ?? '')

/** A value as JSON with its keys in order, so two settings that say the same compare equal. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )

/**
 * The keys `bench.json` sets besides the kinds to something other than their
 * default: the points per part, the threshold, a kind's own settings. Only the
 * file changes them.
 */
export function setByHand(saved: Partial<BenchConfig> | null): string[] {
  // A file that holds no object sets nothing: it reads as the defaults.
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return []
  const config = mergedConfig(saved)
  const defaults = mergedConfig({ packs: config.packs })
  return Object.keys(saved).filter(
    (key) => key !== 'packs' && canonical(config[key]) !== canonical(defaults[key]),
  )
}

/** Rules followed and checks met, added up over `outputs` under `config`; null where none has any. */
export function countsOf(
  outputs: Output[],
  config: BenchConfig,
): { rules: Count | null; checks: Count | null } {
  const verdicts = outputs.map((o) => scoreOf(o, config)?.verdicts ?? [])
  return {
    rules: sumCounts(verdicts.map((v) => countOf(v, 'rule'))),
    checks: sumCounts(verdicts.map((v) => countOf(v, 'check'))),
  }
}

/** "rules 9 of 11 · checks 7 of 9", to follow other parts of a line; null when nothing was counted. */
export function countsLine(counts: { rules: Count | null; checks: Count | null }): string | null {
  const parts = [
    counts.rules ? `rules ${counts.rules.met} of ${counts.rules.total}` : null,
    counts.checks ? `checks ${counts.checks.met} of ${counts.checks.total}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** An output as pairing reads it, with the output it stands for. */
interface Candidate extends PairOutput {
  output: Output
}

const candidate = (output: Output): Candidate => ({
  key: output.key,
  caseId: output.caseId,
  version: output.run.meta?.skillVersion ?? '',
  configuration: output.run.meta?.configuration ?? 'with_skill',
  writer: writerKey(output.run.meta?.writer),
  createdAt: output.run.meta?.createdAt ?? '',
  index: output.index,
  written: output.sample.artifacts.length > 0,
  output,
})

/** Two outputs of one case, side by side: `a` the earlier, `b` the later. Either may be missing. */
export interface OutputPair {
  a: Output | null
  b: Output | null
}

/** The two outputs of a case to read side by side first: the version before, or no skill, beside the latest. */
export function casePair(outputs: Output[], caseId: string): OutputPair {
  const pair = defaultPair(outputs.filter((o) => o.caseId === caseId).map(candidate))
  return { a: pair.a?.output ?? null, b: pair.b?.output ?? null }
}

/** Every case with an output, in the order Cases lists them; a case since deleted comes last. */
export function casesRun(state: State, outputs: Output[]): string[] {
  const ran = new Set(outputs.map((o) => o.caseId))
  const known = state.cases.map((c) => c.id).filter((id) => ran.has(id))
  return [...known, ...[...ran].filter((id) => !known.includes(id)).sort()]
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
const runVersion = (run: RunView): string => versionOf(run).id

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

/**
 * What deleting `run` asks before it goes, in one sentence: what goes, and
 * that the skill stays. `versionAfterRunDelete` says when the skill it tested
 * goes too.
 */
export function deleteRunDialog(
  state: Pick<State, 'runs' | 'versions'>,
  run: RunView,
  outputs: readonly Output[],
): { title: string; description: string } {
  const version = run.meta?.skillVersion ?? ''
  const mine = outputs.filter((o) => o.run.name === run.name)
  const corrections = mine.some((o) => Object.keys(o.corrections).length > 0)
  const after = versionAfterRunDelete({
    version,
    saved: state.versions.versions.some((v) => v.version === version && v.saved),
    otherRuns: state.runs.filter((r) => r.name !== run.name && r.meta?.skillVersion === version)
      .length,
    snapshot: run.hasSkill,
  })
  // Plain words for someone who has not learned the app's terms: no version labels, no counts.
  const what = corrections ? 'Its results and the scores you fixed' : 'Its results'
  return {
    title: 'Delete this run?',
    description:
      after === 'goes'
        ? `${what} will be deleted, along with the only copy of the skill it tested.`
        : `${what} will be deleted, but your skill won't change.`,
  }
}

/** Why a run cannot be deleted while these jobs work on it; undefined when it can. */
export function deleteBlocked(jobs: { writing: boolean; grading: boolean }): string | undefined {
  if (jobs.writing) return 'Wait for the run to finish, then delete.'
  if (jobs.grading) return 'Wait for the grading to finish, then delete.'
  return undefined
}

/** " · sample 2 of 3", or nothing when the case has one sample. */
export const sampleTail = (output: Output): string =>
  output.samples > 1 ? ` · attempt ${output.index} of ${output.samples}` : ''

/** "Claude Opus 5.5 · Nov 2, 10:12": who wrote an output, and when. */
export const outputDetail = (output: Output): string =>
  `${writerName(output.run.meta?.writer)} · ${runStamp(output.run)}`

/**
 * Each output's name in a list to pick from, by its key: its version, and its
 * sample where the run wrote several. Two outputs that would read the same
 * also say who wrote them, and when if that still leaves them alike, so the
 * name stays short wherever the version alone tells them apart.
 */
export function outputNames(outputs: readonly Output[]): Map<string, string> {
  const version = (o: Output) => `${versionName(o.run)}${configurationTail(o.run)}${sampleTail(o)}`
  const forms = [
    version,
    (o: Output) => `${version(o)} · ${writerName(o.run.meta?.writer)}`,
    (o: Output) => `${version(o)} · ${outputDetail(o)}`,
  ]
  const named = forms.map((form) => outputs.map(form))
  const alone = (names: string[], name: string) => names.filter((n) => n === name).length === 1
  return new Map(
    outputs.map((o, i) => {
      const names = named.find((list) => alone(list, list[i])) ?? named[named.length - 1]
      return [o.key, names[i]]
    }),
  )
}

export function caseTitle(state: State, caseId: string): string {
  const found = state.cases.find((c) => c.id === caseId)
  return found ? found.title || found.id : caseId
}

export const primaryOf = (output: Output): Artifact | null => output.primary

/** The file of an output a reader looks at rather than reads; null for an output of text alone. */
export const drawnOf = (output: Output): Artifact | null =>
  drawnArtifact(output.sample.artifacts, output.primary)

/**
 * How big the output is, where size means something: "31 words · case asks 30
 * to 120" for prose or a case with a length, "1600 × 900 px · case asks
 * 1600 × 900 px" for a picture.
 */
export function sizeLine(output: Output): string | null {
  const result = output.result
  if (primaryOf(output)?.kind === 'image' && (result?.pixels || result?.size)) {
    const pixels = result.pixels ? pixelText(result.pixels) : 'size unread'
    return result.size ? `${pixels} · case asks ${pixelText(result.size)}` : pixels
  }
  const words = result?.words
  const range = result?.range
  if (range) return `${words ?? '?'} words · case asks ${range[0]} to ${range[1]}`
  return primaryOf(output)?.kind === 'markdown' && words ? `${words} words` : null
}

/** Cents, or four places for an amount under ten cents. */
export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? '–' : `$${value.toFixed(value < 0.1 ? 4 : 2)}`

export const fmt = (value: number | null, places = 1): string =>
  value === null ? '–' : value.toFixed(places)

/** `1 case`, `3 cases`. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`

/** `Oct 26`, with the year only when it is not this one. A day with no time (`2026-10-26`) is that day here, not in UTC. */
export function shortDate(iso: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(iso)
  const year = date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year })
}
