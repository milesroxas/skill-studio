/** Outputs across runs, their scores under the skill's scoring, the pair to compare per case, and display names. */
import { caseName } from '@domain/case-draft.ts'
import { BASE_PACK, mergeConfig } from '@domain/config.ts'
import {
  type Lift,
  type LiftRun,
  liftWriter,
  testedVersion,
  versionLift,
  writerKey,
} from '@domain/lift.ts'
import { type Corrections, NO_CORRECTIONS, packFailure } from '@domain/pack.ts'
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
import { type Count, countOf, sumCounts } from '@domain/verdict.ts'
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
  /**
   * Why grading leaves the output out, when it does, so that it has no score.
   * `stopped`: the run says its agent was cut short, by a stop or by ending
   * without ever recording it. `unfinished`: the run has not recorded it and
   * has no end of its own, so it is still being written, here or by another
   * copy of the app, or the run was cut off with the app. Null for an output
   * whose agent ran to its end.
   */
  cut: 'stopped' | 'unfinished' | null
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
  graded: ReportResult | null,
  judged: readonly ArtifactKind[],
): Output {
  const cut =
    sample.cut === 'stopped' || (sample.cut === 'unlisted' && run.meta?.finishedAt)
      ? 'stopped'
      : sample.cut === 'unlisted'
        ? 'unfinished'
        : null
  // A score an earlier grading gave an output grading now leaves out is no score of it.
  const result = cut ? null : graded
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
    cut,
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
  const scored = scoreResult(output.result, config, scorers, output.corrections)
  scoredBy.set(output, { config, scored })
  return scored
}

/** Total under `config`; null when ungraded, when no weighted layer scored, or when a part of its grading failed. */
export const totalOf = (output: Output, config: BenchConfig): number | null =>
  scoreOf(output, config)?.scores.total ?? null

/**
 * What a set of outputs has in place of a score when grading leaves out every
 * one of them: `stopped` when each was, `unfinished` when any may still be
 * written. Null when one of them ran to its end, or there is none.
 */
export const cutOf = (outputs: Output[]): Output['cut'] =>
  outputs.length === 0 || outputs.some((o) => o.cut === null)
    ? null
    : outputs.every((o) => o.cut === 'stopped')
      ? 'stopped'
      : 'unfinished'

/** A part of the output's grading failed, so it has no total until its run is graded again. */
export const gradingFailed = (scored: Scored | null): boolean =>
  scored?.flags.some((flag) => packFailure(flag) !== null) ?? false

/** Each case's mean total over its graded outputs among `outputs`, by case id; a case with none graded is absent. */
function caseMeans(outputs: Output[], config: BenchConfig): Record<string, number> {
  const totals = new Map<string, number[]>()
  for (const o of outputs) {
    const total = totalOf(o, config)
    if (total !== null) totals.set(o.caseId, [...(totals.get(o.caseId) ?? []), total])
  }
  return Object.fromEntries([...totals].map(([id, list]) => [id, mean(list) as number]))
}

/**
 * A score over `outputs`: each case's mean over its graded outputs, then the
 * mean of those cases, so a case answered three times counts once. Null when
 * none is graded. Every mean the app shows is counted here.
 */
export const scoreOver = (outputs: Output[], config: BenchConfig): number | null =>
  mean(Object.values(caseMeans(outputs, config)))

/** What a run tested and who wrote it, as the lift and the pairs read it. A run that recorded no version has none. */
const testOf = (run: RunView) => ({
  version: run.meta?.skillVersion ?? '',
  configuration: run.meta?.configuration ?? 'with_skill',
  writer: writerKey(run.meta?.writer),
  createdAt: run.meta?.createdAt ?? '',
})

/** The runs as the lift reads them: each with its writer, version and a mean per case. */
const liftRuns = (runs: RunView[], outputs: Output[], config: BenchConfig): LiftRun[] =>
  runs.map((run) => ({
    name: run.name,
    ...testOf(run),
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

/** The versions outputs were written on, oldest first: "v0", "v1". */
export function versionsRun(outputs: Output[]): string[] {
  const seen = new Set(
    outputs
      .map((o) => testOf(o.run))
      .filter(testedVersion)
      .map((test) => test.version),
  )
  return [...seen].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))
}

/** The outputs written on a version: with the skill as it stood, or on the copy kept of it. */
export const versionOutputs = (outputs: Output[], version: string): Output[] =>
  outputs.filter((o) => {
    const test = testOf(o.run)
    return test.version === version && testedVersion(test)
  })

/**
 * A version's score under `config`, counted as `scoreOver` counts. Where the
 * writer the lift compares ran this version, only that writer's outputs
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
  return scoreOver(pinned.length ? pinned : mine, config)
}

/** The score of the outputs written without the skill, counted as a version's is. */
export const noSkillScore = (outputs: Output[], config: BenchConfig): number | null =>
  scoreOver(
    outputs.filter((o) => o.run.meta?.configuration === 'without_skill'),
    config,
  )

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

/** The kind of work a part of the score comes from, such as design for Look; null for rules and checks, which every skill is graded on. */
export const kindOfPart = (layer: string): string | null => {
  const pack = scorers.find((p) => p.layers.includes(layer))
  return pack && pack.id !== BASE_PACK ? pack.id : null
}

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

/**
 * A count as it reads: "9 of 11", "9 of 11, 2 not sure" where Jev left some
 * for the reader, and "2 not sure" where it was sure of none.
 */
export function countText(count: Count): string {
  const unsure = count.unsure ? `${count.unsure} not sure` : null
  const marked = count.total ? `${count.met} of ${count.total}` : null
  return [marked, unsure].filter(Boolean).join(', ')
}

/** "rules 9 of 11 · checks 7 of 9", to follow other parts of a line; null when nothing was counted. */
export function countsLine(counts: { rules: Count | null; checks: Count | null }): string | null {
  const parts = [
    counts.rules ? `rules ${countText(counts.rules)}` : null,
    counts.checks ? `checks ${countText(counts.checks)}` : null,
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
  ...testOf(output.run),
  index: output.index,
  written: output.sample.artifacts.length > 0 && output.cut === null,
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

/**
 * A model by its own name, never its maker's: "Sonnet", "Opus 5.5", "gpt-5",
 * or "Default model" when the app chose it.
 */
function modelName(engine: string, model: string | null): string {
  if (!model || model === 'default') return 'Default model'
  if (engine !== 'claude') return model
  if (CLAUDE_ALIASES[model]) return CLAUDE_ALIASES[model]
  const id = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model)
  return id ? `${capital(id[1])} ${id[2]}.${id[3]}` : model
}

/** "Opus 5.5", "gpt-5, high effort via Cursor": the model, and how it was asked to work. */
export function writerName(writer: Writer | undefined | null): string {
  if (!writer) return 'Unknown writer'
  const effort = writer.effort && writer.effort !== 'default' ? `, ${writer.effort} effort` : ''
  const via = writer.engine === 'cursor' ? ' via Cursor' : ''
  return `${modelName(writer.engine, writer.model)}${effort}${via}`
}

/** The model alone, for a column too narrow for `writerName`: "Sonnet", "gpt-5". */
export const modelShort = (writer: Writer | undefined | null): string =>
  writer ? modelName(writer.engine, writer.model) : 'Unknown'

const versionOf = (run: RunView): { id: string; name: string } =>
  run.meta?.skillVersion
    ? { id: run.meta.skillVersion, name: run.meta.skillName }
    : { id: '?', name: run.name }

/** The version a run was made on: "v1". */
const runVersion = (run: RunView): string => versionOf(run).id

/** "v2 · Claims need a source" */
const versionName = (run: RunView): string => {
  const v = versionOf(run)
  return v.name ? `${v.id} · ${v.name}` : v.id
}

/** The name of a run made with no skill at all: it tested no version, so it names none. */
export const WITHOUT_SKILL = 'Without skill'

/** Whether a run was made with no skill at all, the score the skill has to beat. */
export const isWithoutSkill = (run: RunView): boolean => run.meta?.configuration === 'without_skill'

/** " · old skill" for a run made on an earlier version's copy, or nothing. */
const configurationTail = (run: RunView): string =>
  run.meta?.configuration === 'old_skill' ? ' · old skill' : ''

/**
 * What a run is named by wherever runs are listed or picked: its version
 * ("v2 · Claims need a source", or "v2" when `short`), or "Without skill" for
 * a run that used none.
 */
export const runTitle = (run: RunView, { short = false }: { short?: boolean } = {}): string =>
  isWithoutSkill(run)
    ? WITHOUT_SKILL
    : `${short ? runVersion(run) : versionName(run)}${configurationTail(run)}`

/**
 * A run named inside a sentence: its title ("v2" alone when `short`), or "the
 * run without the skill", capitalised only to open the sentence, so the name
 * never reads as a label dropped mid-line.
 */
export const runInSentence = (run: RunView, { start = false, short = false } = {}): string =>
  isWithoutSkill(run) ? `${start ? 'The' : 'the'} run without the skill` : runTitle(run, { short })

/** Why something has no score, as the end of a line that opens with its name: "v2 was stopped before it finished". */
export const unscoredWords = (cut: Output['cut']): string =>
  cut === 'stopped'
    ? 'was stopped before it finished'
    : cut === 'unfinished'
      ? 'is not finished'
      : 'has no score yet'

/** That an output has no score, as a line that opens with its run. */
export const unscoredLine = (output: Output): string =>
  `${runInSentence(output.run, { start: true, short: true })} ${unscoredWords(output.cut)}`

/** "v2 · Opus 5.5", or "Without skill · Opus 5.5" */
export const runLabel = (run: RunView): string =>
  `${runTitle(run, { short: true })} · ${writerName(run.meta?.writer)}`

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
  // Asked from one case, a run reads as that case's output: say it goes from the others too.
  const where = new Set(mine.map((o) => o.caseId)).size > 1 ? ' from every case' : ''
  return {
    title: 'Delete this run?',
    description:
      after === 'goes'
        ? `${what} will be deleted${where}, along with the only copy of the skill it tested.`
        : `${what} will be deleted${where}, but your skill won't change.`,
  }
}

/** Why a run cannot be deleted while these jobs work on it; undefined when it can. */
export function deleteBlocked(jobs: { writing: boolean; grading: boolean }): string | undefined {
  if (jobs.writing) return 'Wait for the run to finish, then delete.'
  if (jobs.grading) return 'Wait for the grading to finish, then delete.'
  return undefined
}

/** " · attempt 2 of 3", or nothing when the case has one attempt. */
const sampleTail = (output: Output): string =>
  output.samples > 1 ? ` · attempt ${output.index} of ${output.samples}` : ''

/** "Opus 5.5", or "Opus 5.5 · attempt 2 of 3": who wrote an output, and which attempt. */
export const outputWriter = (output: Output): string =>
  `${writerName(output.run.meta?.writer)}${sampleTail(output)}`

/** "Opus 5.5 · Nov 2, 10:12": who wrote an output, and when. */
export const outputDetail = (output: Output): string =>
  `${writerName(output.run.meta?.writer)} · ${runStamp(output.run)}`

/**
 * Each output's name in a list to pick from, by its key: its version, and its
 * sample where the run wrote several. Two outputs that would read the same
 * also say who wrote them, and when if that still leaves them alike, so the
 * name stays short wherever the version alone tells them apart. `short` names
 * the version by its number alone ("v2"), for a place as narrow as a toggle.
 */
export function outputNames(
  outputs: readonly Output[],
  { short = false }: { short?: boolean } = {},
): Map<string, string> {
  const version = (o: Output) => `${runTitle(o.run, { short })}${sampleTail(o)}`
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
  return found ? caseName(found) : caseId
}

export const primaryOf = (output: Output): Artifact | null => output.primary

/** The file of an output a reader looks at rather than reads; null for an output of text alone. */
export const drawnOf = (output: Output): Artifact | null =>
  drawnArtifact(output.sample.artifacts, output.primary)

/**
 * How big the output is, where size means something: "31 words, the case asks
 * 30 to 120" for prose or a case with a length, "1600 × 900 px, the case asks
 * 1600 × 900 px" for a picture.
 */
function sizeLine(output: Output): string | null {
  const result = output.result
  if (primaryOf(output)?.kind === 'image' && (result?.pixels || result?.size)) {
    const pixels = result.pixels ? pixelText(result.pixels) : 'size unread'
    return result.size ? `${pixels}, the case asks ${pixelText(result.size)}` : pixels
  }
  const words = result?.words
  const range = result?.range
  if (range) return `${words ?? '?'} words, the case asks ${range[0]} to ${range[1]}`
  return primaryOf(output)?.kind === 'markdown' && words ? `${words} words` : null
}

/**
 * How an output was made, a row each, for the note behind its score: who
 * wrote it, when, which attempt, and its size where size means something.
 */
export function outputFacts(output: Output): Array<{ label: string; value: string }> {
  const facts = [
    { label: 'Written by', value: writerName(output.run.meta?.writer) },
    { label: 'When', value: runStamp(output.run) },
  ]
  if (output.samples > 1)
    facts.push({ label: 'Attempt', value: `${output.index} of ${output.samples}` })
  const size = sizeLine(output)
  if (size)
    facts.push({ label: primaryOf(output)?.kind === 'image' ? 'Size' : 'Length', value: size })
  return facts
}

/**
 * What tells an output from the one beside it besides its version, for the
 * line under its card's title: the writer when the two differ, since that is
 * what is being compared; and for two outputs of one version, the attempt, or
 * the time when they come from two runs. Null when the version says it all.
 */
export function apartLine(output: Output, other: Output | null): string | null {
  if (!other) return null
  const writer = writerName(output.run.meta?.writer)
  const sameWriter = writer === writerName(other.run.meta?.writer)
  const title = (o: Output) => runTitle(o.run)
  const bits: string[] = sameWriter ? [] : [writer]
  if (title(output) === title(other)) {
    if (output.samples > 1) bits.push(`attempt ${output.index} of ${output.samples}`)
    if (output.run.name !== other.run.name && sameWriter) bits.push(runStamp(output.run))
  }
  return bits.length ? bits.join(' · ') : null
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
