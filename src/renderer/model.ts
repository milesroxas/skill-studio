/** Outputs across runs, their scores under the skill's scoring, the pair to compare per case, and display names. */
import { caseName } from '@domain/case-draft.ts'
import { changeReading, comparableAnswers } from '@domain/change.ts'
import { BASE_PACK, mergeConfig } from '@domain/config.ts'
import {
  pointsMoved,
  testedVersion,
  type VersionRun,
  versionWriter,
  writerKey,
} from '@domain/lift.ts'
import { type Corrections, NO_CORRECTIONS, unreadable, type VerdictKind } from '@domain/pack.ts'
import { defaultPair, type PairOutput, sampleCut, sampleShown } from '@domain/pairs.ts'
import { previewArtifact, primaryArtifact } from '@domain/primary.ts'
import { casesInOrder } from '@domain/results-address.ts'
import { newestRates, type RuleRate, ruleRates, withWithout } from '@domain/rule-rate.ts'
import { versionAfterRunDelete } from '@domain/run-delete.ts'
import { parseSampleDir, sampleOf } from '@domain/run-name.ts'
import type {
  Artifact,
  ArtifactKind,
  BenchConfig,
  Case,
  GradedWith,
  Report,
  ReportResult,
  Writer,
} from '@domain/schemas.ts'
import { behindOf, gradedNow, pixelText, type Scored, scoreResult } from '@domain/scoring.ts'
import {
  type Attempts,
  attemptsOf,
  type CaseLift,
  caseLift,
  type Move,
  type Standing,
  standingOf,
  type Try,
} from '@domain/standing.ts'
import { mean } from '@domain/stats.ts'
import { type Count, countOf, sumCounts } from '@domain/verdict.ts'
import type { SkillVersions, TrashedDelete } from '@domain/views.ts'
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
   * without ever recording it. `failed`: the run says its agent did not run to
   * its end and no stop ended it: the time limit, an error, or it never began
   * (`SampleMeta.failed`). `unfinished`: the run has not recorded it and
   * has no end of its own, so it is still being written, here or by another
   * copy of the app, or the run was cut off with the app. Null for an output
   * whose agent ran to its end.
   */
  cut: 'stopped' | 'failed' | 'unfinished' | null
  /** Your own answers on this output's verdicts, which stand over Jev's. */
  corrections: Corrections
  /** The file that stands for the output: the one graded, else the one grading would judge. */
  primary: Artifact | null
  /**
   * What its agent was asked, as a fingerprint (`RunCase.ask`): two outputs of
   * one case with the same one answered the same prompt and files. Empty for
   * an output whose case is gone and whose run kept no copy of it.
   */
  ask: string
  /**
   * The case as its agent was asked it, when the skill no longer asks that:
   * the prompt or its files changed since, or the case was deleted. Null while
   * the output answers the case as it stands.
   */
  earlier: Case | null
  /** Jev graded it. A grading without Jev counts a total from other parts, so the two are never set against each other. */
  judged: boolean
  /** Why its grading is behind what one made now would be (`behindOf`), so that it has no total; null when it is not. */
  behind: string | null
}

/**
 * How many attempts at each of its cases a run was asked for, 0 when it says
 * nothing that can be counted on: a run of flat files, or one that lists no
 * samples of its own.
 */
const askedOf = (run: RunView): number =>
  run.meta && !run.meta.legacy && run.samples.every((s) => !s.legacy)
    ? run.meta.samplesPerCase || 0
    : 0

/**
 * Why a case's answers in one run stand for less than the run was asked, so
 * that no mean of them is read as the case's: one of its attempts is cut, or
 * an attempt never began, which leaves no folder. `stopped`, `failed` or
 * `unfinished` as an output's `cut` reads; `unfinished` while the run, with no
 * end of its own, may still begin it. Null when every attempt asked ran to its end.
 */
function shortOf(run: RunView, caseId: string): Output['cut'] {
  const kept = shortBy.get(run)?.get(caseId)
  if (kept !== undefined) return kept
  const mine = run.samples.filter((s) => parseSampleDir(s.name)?.case === caseId)
  const cuts = mine.map((s) => sampleCut(run, s))
  const missing = mine.length < askedOf(run)
  const short: Output['cut'] = cuts.includes('unfinished')
    ? 'unfinished'
    : missing && !run.meta?.finishedAt
      ? 'unfinished'
      : cuts.includes('failed')
        ? 'failed'
        : cuts.includes('stopped') || missing
          ? 'stopped'
          : null
  const byCase = shortBy.get(run) ?? new Map<string, Output['cut']>()
  byCase.set(caseId, short)
  shortBy.set(run, byCase)
  return short
}
const shortBy = new WeakMap<RunView, Map<string, Output['cut']>>()

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
  now: GradedWith | null,
): Output {
  const cut = sampleCut(run, sample)
  // A score an earlier grading gave an output grading now leaves out is no score of it.
  const result = cut ? null : graded
  const { case: caseId, index } = sampleOf(sample.name, result?.case ?? null)
  const key = `${run.name}/${sample.name}`
  const taken = Object.hasOwn(run.cases, caseId) ? run.cases[caseId] : null
  const asked = taken?.earlier ?? state.cases.find((c) => c.id === caseId)
  const preferred = asked?.bench.artifact
  return {
    key,
    run,
    sample,
    result,
    caseId,
    index,
    samples: Math.max(
      run.samples.filter((s) => parseSampleDir(s.name)?.case === caseId).length,
      askedOf(run),
    ),
    cut,
    corrections: state.reviews.reviews[key]?.corrections ?? NO_CORRECTIONS,
    // The file graded, else the one grading would judge.
    primary: result?.primary ?? primaryArtifact(sample.artifacts, preferred, judged, asked?.prompt),
    ask: taken?.ask ?? '',
    earlier: taken?.earlier ?? null,
    judged: Boolean(run.report?.model),
    behind:
      result && run.report
        ? behindOf(
            { yardstick: result.yardstick, model: run.report.model, graded: result.graded },
            { yardstick: taken?.yardstick ?? null, jev: state.jevKey, with: now },
          )
        : null,
  }
}

/** Every output across runs: version, then writer, then run, then sample. */
export function outputsOf(state: State): Output[] {
  const judged = scorers
    .filter((s) => state.config.packs.includes(s.id))
    .flatMap((s) => s.artifacts)
  // What a grading here would grade with now; a state that does not say asks none of it.
  const now = state.grading
    ? gradedNow(
        state.grading.packs,
        state.config.packs,
        state.grading.model,
        state.grading.drawn === true,
        state.grading.settings,
      )
    : null
  const list = state.runs.flatMap((run) => {
    const results = new Map((run.report?.results ?? []).map((r) => [r.sample, r]))
    return run.samples.map((sample) =>
      outputOf(state, run, sample, results.get(sample.name) ?? null, judged, now),
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

/** A page and a picture one answer came as, by the names its writer gave them. */
export interface AnswerFiles {
  page: string
  picture: string
  /** Which of the two is the file graded, or would be; null when it is neither, such as a note beside them. */
  graded: 'html' | 'image' | null
}

/**
 * The page and the picture of the newest answer to a case that came as both,
 * or null when none did. Only such a case has a file to choose between: an
 * agent often writes a page to make a picture, and either may be the work.
 */
export function answerFiles(outputs: Output[], caseId: string): AnswerFiles | null {
  const named = (file: string): string => file.replace(/^outputs\//, '')
  for (const output of outputs.filter((o) => o.caseId === caseId).reverse()) {
    const page = output.sample.artifacts.find((a) => a.kind === 'html')
    const picture = output.sample.artifacts.find((a) => a.kind === 'image')
    if (!page || !picture) continue
    const kind = output.primary?.kind
    return {
      page: named(page.file),
      picture: named(picture.file),
      graded: kind === 'html' || kind === 'image' ? kind : null,
    }
  }
  return null
}

export const outputByKey = (outputs: Output[], key: string | null): Output | null =>
  key ? (outputs.find((o) => o.key === key) ?? null) : null

/**
 * What Results shows by its address (`resultsAddress` in
 * `src/domain/results-address.ts` builds one): the case `case` names, else
 * the case of the output named, else the first case run; and when `a` or `b`
 * is named, the two outputs named, each null outside that case. `shown` is
 * null when neither is named, for the pair the case opens with.
 */
export function resultsShown(
  outputs: Output[],
  caseIds: string[],
  params: URLSearchParams,
): { caseId: string; shown: OutputPair | null } {
  // An address may name the outputs and not their case: the first one named says which case it is.
  const named = outputByKey(outputs, params.get('b')) ?? outputByKey(outputs, params.get('a'))
  const asked = params.get('case') ?? named?.caseId ?? null
  const caseId = asked !== null && caseIds.includes(asked) ? asked : caseIds[0]
  const pinned = params.has('a') || params.has('b')
  const inCase = (key: string | null): Output | null => {
    const output = outputByKey(outputs, key)
    return output?.caseId === caseId ? output : null
  }
  const shown = pinned ? { a: inCase(params.get('a')), b: inCase(params.get('b')) } : null
  return { caseId, shown }
}

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
  const scored = scoreResult(output.result, config, scorers, output.corrections, output.behind)
  scoredBy.set(output, { config, scored })
  return scored
}

/** Total under `config`; null when ungraded, when no weighted layer scored, or when its run is to be graded again (`Scored.regrade`). */
export const totalOf = (output: Output, config: BenchConfig): number | null =>
  scoreOf(output, config)?.scores.total ?? null

/**
 * The output was graded and stands on a file Jev cannot read, such as a PDF:
 * it has no score, and no grading again would give it one, so no mean waits
 * on it and nothing offers to grade it.
 */
export const unreadOutput = (output: Output): boolean =>
  output.result !== null && unreadable(output.result)

/**
 * What a set of outputs has in place of a score when grading leaves out every
 * one of them: `stopped` when each was, `failed` when each was stopped or
 * failed and one failed, `unfinished` when any may still be written. Null when
 * one of them ran to its end, or there is none.
 */
export const cutOf = (outputs: Output[]): Output['cut'] =>
  outputs.length === 0 || outputs.some((o) => o.cut === null)
    ? null
    : outputs.every((o) => o.cut === 'stopped')
      ? 'stopped'
      : outputs.every((o) => o.cut === 'stopped' || o.cut === 'failed')
        ? 'failed'
        : 'unfinished'

/**
 * The output was graded and still has no total until its run is graded again:
 * a part of its grading failed, the skill is graded as a kind the grading did
 * not cover, or its case changed since (`Scored.regrade`).
 */
export const regradeOwed = (scored: Scored | null): boolean => (scored?.regrade.length ?? 0) > 0

/**
 * A case as one output answered it: its id and what the agent was asked. Two
 * outputs with the same one are answers to the same prompt and files, so they
 * stand in one row of All cases (`standingsOf`).
 */
const askedKey = (output: Pick<Output, 'caseId' | 'ask'>): string =>
  `${output.caseId}\n${output.ask}`

/**
 * Two outputs whose scores can be set against each other: answers to the same
 * case as it was asked, both graded with Jev or both without.
 */
export const comparable = (a: Output, b: Output): boolean =>
  comparableAnswers(
    { case: a.caseId, ask: a.ask, judged: a.judged },
    { case: b.caseId, ask: b.ask, judged: b.judged },
  )

/** What `comparable` compares, as one key. */
const comparedKey = (output: Output): string => `${askedKey(output)}\n${output.judged}`

/**
 * Each case's mean total among `outputs`, by `comparedKey`. Only a case whose
 * every output has a total is counted: a mean over the ones that happen to be
 * graded would be set beside means over all of theirs. `whole` is false when a
 * case was left out for that. An output cut short says nothing of the skill,
 * and is no part of either. Nor is any answer of a run to a case it did not
 * finish (`shortOf`): a mean over the attempts that happened to end would read
 * as one over all it was asked for. An output on a file Jev cannot read has
 * no score to wait on, and is no part of either.
 */
function caseMeans(
  outputs: Output[],
  config: BenchConfig,
): { means: Record<string, number>; whole: boolean } {
  const totals = new Map<string, Array<number | null>>()
  for (const o of outputs) {
    if (o.cut || unreadOutput(o) || shortOf(o.run, o.caseId)) continue
    const key = comparedKey(o)
    totals.set(key, [...(totals.get(key) ?? []), totalOf(o, config)])
  }
  const means: Record<string, number> = {}
  let whole = true
  for (const [key, list] of totals) {
    const scored = list.filter((total): total is number => total !== null)
    if (scored.length === list.length) means[key] = mean(scored) as number
    else whole = false
  }
  return { means, whole }
}

/**
 * A score over `outputs`: each case's mean over its outputs, then the mean of
 * those cases, so a case answered three times counts once. Null when none is
 * graded, and when any output that ran to its end has no total: a score that
 * left it out would read as a score of them all. Every mean the app shows is
 * counted here.
 */
export function scoreOver(outputs: Output[], config: BenchConfig): number | null {
  const { means, whole } = caseMeans(outputs, config)
  return whole ? mean(Object.values(means)) : null
}

/** What a run tested and who wrote it, as a version's score, a case's standing and the pairs read it. A run that recorded no version has none. */
const testOf = (run: RunView) => ({
  version: run.meta?.skillVersion ?? '',
  configuration: run.meta?.configuration ?? 'with_skill',
  writer: writerKey(run.meta?.writer),
  createdAt: run.meta?.createdAt ?? '',
})

/** The runs as a version's score reads them: each with its writer, version and a mean per case. */
const versionRuns = (runs: RunView[], outputs: Output[], config: BenchConfig): VersionRun[] =>
  runs.map((run) => ({
    name: run.name,
    ...testOf(run),
    cases: caseMeans(
      outputs.filter((o) => o.run.name === run.name),
      config,
    ).means,
  }))

/** `outputs` with the answers given, one each in order; an output whose answers are its own stays itself. */
export const withAnswers = (outputs: Output[], answers: readonly Corrections[]): Output[] =>
  outputs.map((o, i) => (answers[i] === o.corrections ? o : { ...o, corrections: answers[i] }))

/** The verdicts of each output a score over `outputs` counts: none cut short or on a file Jev cannot read. */
const countedVerdicts = (outputs: Output[], config: BenchConfig) =>
  outputs.filter((o) => !o.cut && !unreadOutput(o)).map((o) => scoreOf(o, config)?.verdicts ?? [])

/**
 * The two scores a change from `from` to `to` is read between: each a score
 * over its outputs as `scoreOver` counts it, over the facts both sides
 * counted, from Jev's answers, with the reader's only where both sides hold
 * one on the same fact (`changeReading`). Null when either side has no score
 * so: nothing is left to count at it.
 */
function moveBetween(from: Output[], to: Output[], config: BenchConfig): Move | null {
  const reading = changeReading(
    from.map((o) => o.corrections),
    to.map((o) => o.corrections),
    (end, answers) => countedVerdicts(withAnswers(end === 'a' ? from : to, answers), config),
  )
  const a = scoreOver(withAnswers(from, reading.a), config)
  const b = scoreOver(withAnswers(to, reading.b), config)
  return a === null || b === null
    ? null
    : { from: a, to: b, left: reading.left, oneSided: reading.oneSided }
}

/**
 * The two scores the change from `from` to `to` is read between
 * (`moveBetween`); null when the two are not set against each other
 * (`comparable`) or either has no score.
 */
export const movedBetween = (from: Output, to: Output, config: BenchConfig): Move | null =>
  comparable(from, to) ? moveBetween([from], [to], config) : null

/**
 * How far `to` moved from `from` in the whole points shown, read as a change
 * is (`moveBetween`); null when the two are not set against each other
 * (`comparable`) or either has no score.
 */
export function changeBetween(from: Output, to: Output, config: BenchConfig): number | null {
  const move = movedBetween(from, to, config)
  return move ? pointsMoved(move.from, move.to) : null
}

/**
 * A change read between two scores is not their difference as shown, since
 * it left out facts only one side counted, or an answer of the reader's that
 * only one side holds (`moveBetween`): the page says why where the change is
 * read (`changeWhy`).
 */
const unshared = (change: number | null, from: number | null, to: number | null): boolean =>
  change !== null && from !== null && to !== null && change !== pointsMoved(from, to)

/** `unshared` for the change from `previous` to `latest` a case stands on. */
export const standingUnshared = (
  standing: Pick<Standing, 'change' | 'previous' | 'latest'>,
): boolean =>
  unshared(standing.change, standing.previous?.score ?? null, standing.latest?.score ?? null)

/**
 * How much of a score Jev left to the reader, in one sentence (`asideLine`),
 * and which of the two the sentence opens with: what Jev was not sure of where
 * there is any, else what it could not read the whole output for. A note's
 * title is chosen by `leads`, never by the words.
 */
export interface AsideLine {
  leads: 'unsure' | 'unread'
  text: string
}

/** The title of the note an `AsideLine` is, by what it leads with. */
const ASIDE_TITLE: Record<AsideLine['leads'], string> = {
  unsure: 'Not sure',
  unread: 'Not read',
}

/**
 * How much of a score was counted, where Jev left some of it to the reader:
 * "Jev was not sure of 8 of the 17 rules, left out of the score until you
 * mark them.", and of facts it could not read the whole output for (`unread`):
 * "Jev could not read the whole output for 3 of the 17 rules, …". Counted over the rules and checks of every output with a score
 * among `outputs`, each once, the ones that do not apply left out; `over`
 * says where they were when the outputs are more than one ("on their latest
 * runs"). Null when Jev was sure of every one and read all it needed.
 */
export function asideLine(outputs: Output[], config: BenchConfig, over?: string): AsideLine | null {
  const graded = countedVerdicts(outputs, config).filter((verdicts) => verdicts.length)
  // A fact that does not apply, or that nobody can mark, is no part of what a score could count.
  const facts = graded
    .flat()
    .filter(
      (v) =>
        (v.kind === 'rule' || v.kind === 'check') &&
        v.aside !== 'inapplicable' &&
        v.aside !== 'unmarkable',
    )
  const unsure = facts.filter((v) => v.aside === 'unsure').length
  const unread = facts.filter((v) => v.aside === 'unread').length
  if (!unsure && !unread) return null
  const kinds = new Set(facts.map((v) => v.kind))
  const many = facts.length > 1
  const noun =
    kinds.size > 1
      ? 'rules and checks'
      : `${kinds.has('rule') ? 'rule' : 'check'}${many ? 's' : ''}`
  const where = over ?? (graded.length > 1 ? `over ${graded.length} outputs` : null)
  const of = (n: number) => (many ? `${n} of the ${facts.length} ${noun}` : `the one ${noun}`)
  const them = `left out of the score until you mark ${unsure + unread > 1 ? 'them' : 'it'}.`
  // A fact the app's own count could not settle is not sure too, and is not Jev's to be unsure of.
  if (facts.some((v) => v.aside === 'unsure' && v.by === 'code')) {
    const said = [
      unsure ? `Not sure on ${of(unsure)}` : null,
      unread
        ? `${unsure ? 'not read on' : 'Not read on'} ${unsure ? `${unread} more` : of(unread)}`
        : null,
    ]
      .filter(Boolean)
      .join(' and ')
    return { leads: 'unsure', text: `${said}${where ? ` ${where}` : ''}, ${them}` }
  }
  // Not read is said apart from not sure: Jev answered the one, and was never asked of the whole for the other.
  const said = [
    unsure ? `was not sure of ${of(unsure)}` : null,
    unread
      ? `could not read the whole output for ${unsure ? unread : of(unread)}${unsure ? ' more' : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' and ')
  return {
    leads: unsure ? 'unsure' : 'unread',
    text: `Jev ${said}${where ? ` ${where}` : ''}, ${them}`,
  }
}

/** `asideLine` for the outputs the lift's latest means are over. */
export const liftAsideLine = (
  standings: readonly CaseStand[],
  config: BenchConfig,
): AsideLine | null =>
  asideLine(
    standings
      .filter((s) => !s.earlier && s.previous && s.since && s.latest)
      .flatMap((s) => s.latest?.outputs ?? []),
    config,
    'on their latest runs',
  )

/** How far a score's attempts were apart, to follow its count: "from 62 to 88", or "which all scored 80". */
export const spreadWords = (a: Attempts): string =>
  Math.round(a.low) === Math.round(a.high)
    ? `which all scored ${Math.round(a.low)}`
    : `from ${Math.round(a.low)} to ${Math.round(a.high)}`

/** "1 attempt", "3 attempts", "1 to 3 attempts". */
const attemptCount = ([fewest, most]: [number, number]): string =>
  `${fewest === most ? fewest : `${fewest} to ${most}`} ${most > 1 ? 'attempts' : 'attempt'}`

/**
 * How many attempts the lift's means are over, and how far one case's
 * attempts were apart, for the line under its change: "1 attempt a case on
 * the first runs, 3 on the latest. Attempts at one case scored up to 26 points
 * apart." Facts only: whether a change is more than chance is the reader's to say.
 */
export function liftAttemptsLine(lift: CaseLift): string {
  const { first, latest } = lift.attempts
  const counts =
    first[0] === latest[0] && first[1] === latest[1]
      ? `${attemptCount(first)} a case on the first runs and the latest`
      : `${attemptCount(first)} a case on the first runs, ${attemptCount(latest)} on the latest`
  const gap =
    lift.gap === null
      ? ''
      : lift.gap === 0
        ? '. Each case’s attempts scored the same'
        : `. Attempts at one case scored up to ${lift.gap} points apart`
  return `${capital(counts)}${gap}.`
}

/** One thing behind the lift, in the note its count of cases opens: what it is about, and what it says. */
export interface LiftNote {
  title: string
  text: string
}

/**
 * What stands behind the lift, a note each, for the reader who asks: which
 * cases it is over, what sets them apart, the score without the skill, what
 * the change counts when it is not the difference of the two means, how many
 * attempts each side is over when some case had several, and how much Jev left to the reader (`aside`,
 * from `liftAsideLine`). The head of All cases shows none of it: its count
 * of cases opens it.
 */
export function liftNotes(lift: CaseLift, aside: AsideLine | null): LiftNote[] {
  const one = lift.cases === 1
  const some = lift.floorCases < lift.cases ? `, over ${lift.floorCases} of them` : ''
  const change = lift.unshared ? changeLine('runs', lift) : null
  // One attempt a case on both sides, as most lifts are, sets nothing against anything.
  const several = lift.gap !== null || lift.attempts.first[1] > 1 || lift.attempts.latest[1] > 1
  const notes: Array<LiftNote | null> = [
    {
      title: 'Which cases',
      text: one
        ? 'The 1 case that ran more than once, from its first run to its latest.'
        : `The ${lift.cases} cases that ran more than once, each from its first run to its latest.`,
    },
    lift.mixed
      ? {
          title: 'More than one model',
          text: 'Some cases ran on one model first and another last, so part of the change may be the model’s.',
        }
      : null,
    lift.uncounted
      ? {
          title: 'Cases left out',
          text: `${plural(lift.uncounted, 'more case')} ${lift.uncounted > 1 ? 'are' : 'is'} left out: nothing was marked on both of ${lift.uncounted > 1 ? 'their' : 'its'} runs.`,
        }
      : null,
    lift.floor !== null
      ? {
          title: 'Without the skill',
          text: `Without the skill ${one ? 'it' : 'they'} scored ${Math.round(lift.floor)}${some}${lift.floorApart ? ', graded on another version’s rules' : ''}.`,
        }
      : null,
    change ? { title: 'What the change counts', text: change } : null,
    several ? { title: 'Attempts', text: liftAttemptsLine(lift) } : null,
    aside ? { title: ASIDE_TITLE[aside.leads], text: aside.text } : null,
  ]
  return notes.filter((note): note is LiftNote => note !== null)
}

/**
 * How many attempts the score a case stands on is the mean of, and the one it
 * moved from, with how far each one's attempts were apart: "Its score is the
 * mean of 3 attempts, from 62 to 88. Its run before had one." Null when both
 * are one attempt, as most are.
 */
export function attemptsLine(standing: Pick<CaseStand, 'latest' | 'previous'>): string | null {
  const now = standing.latest ? attemptsOf(standing.latest) : null
  const before = standing.previous ? attemptsOf(standing.previous) : null
  if (!now || (now.count === 1 && (!before || before.count === 1))) return null
  const head =
    now.count === 1
      ? 'Its score is from one attempt.'
      : `Its score is the mean of ${now.count} attempts, ${spreadWords(now)}.`
  const tail = !before
    ? ''
    : before.count === 1
      ? ' Its run before had one.'
      : ` Its run before had ${before.count}, ${spreadWords(before)}.`
  return `${head}${tail}`
}

/**
 * How often each rule was followed and broken (`ruleRates`), by its words, on
 * the newest version whose outputs counted it (`newestRates`), as Results
 * scores them under `config`: the reader's answers count, and an output cut
 * short, of a case its run did not finish (`shortOf`) or with no score counts
 * for nothing. A rule broken on v2 and followed on v3 is read as followed.
 * Beside each, how often answers written without the skill followed it
 * (`without`): those were marked on every rule too, so the count costs nothing.
 */
export function ruleRatesOf(outputs: Output[], config: BenchConfig): Map<string, RuleRate> {
  const whole = (o: Output) => !o.cut && !shortOf(o.run, o.caseId)
  const counted = outputs.filter((o) => whole(o) && testedVersion(testOf(o.run)))
  const plain = ruleRates(
    outputs
      .filter((o) => whole(o) && isWithoutSkill(o.run))
      .map((o) => ({ total: totalOf(o, config), verdicts: scoreOf(o, config)?.verdicts ?? [] })),
  )
  const rated = newestRates(
    versionsRun(counted).map((version) =>
      ruleRates(
        versionOutputs(counted, version).map((o) => ({
          total: totalOf(o, config),
          verdicts: scoreOf(o, config)?.verdicts ?? [],
        })),
      ),
    ),
  )
  return withWithout(rated, plain)
}

/**
 * "3 rules", "1 check", "3 rules and checks": `left`, one kind a fact, as
 * the facts are called. With a fact that is neither, such as whether a
 * picture looks broken, "24 of Jev's answers".
 */
function factCount(left: readonly VerdictKind[]): string {
  const n = left.length
  const kinds = new Set(left)
  if (kinds.has('other')) return `${n} of Jev’s answers`
  if (kinds.size > 1) return `${n} rules and checks`
  return `${n} ${kinds.has('rule') ? 'rule' : 'check'}${n > 1 ? 's' : ''}`
}

/**
 * Why a change is not the difference of the two scores beside it
 * (`unshared`), as what follows "The change": "counts only what was marked on
 * both runs, so 3 rules are left out of it". `sides` names the two ("runs",
 * "outputs"). Null when the move left nothing out and read every answer.
 */
function changeWhy(sides: string, move: Pick<Move, 'left' | 'oneSided'>): string | null {
  const left = move.left ?? []
  const answers = `your answers only where you gave one on both`
  if (!left.length) return move.oneSided ? `counts ${answers} ${sides}` : null
  const out = `so ${factCount(left)} ${left.length > 1 ? 'are' : 'is'} left out of it`
  return move.oneSided
    ? `counts only what was marked on both ${sides}, and ${answers}, ${out}`
    : `counts only what was marked on both ${sides}, ${out}`
}

/** `changeWhy` as the line the page shows where a change is read; null with nothing to say. */
export function changeLine(sides: string, move: Pick<Move, 'left' | 'oneSided'>): string | null {
  const why = changeWhy(sides, move)
  return why ? `The change ${why}.` : null
}

/**
 * `changeLine` for two outputs, with the two scores the change was read
 * between, so the reader can check it: "… Counted that way, A scores 77 and B
 * 81." Null with nothing to say.
 */
export function changeNote(move: Move): string | null {
  const line = changeLine('outputs', move)
  return line
    ? `${line} Counted that way, A scores ${Math.round(move.from)} and B ${Math.round(move.to)}.`
    : null
}

/** One run's answer to a case: its outputs for it, and the score they come to. */
export interface CaseTry extends Try {
  run: RunView
  outputs: Output[]
  /** How many of the outputs have a score: all of them that ran to their end when `score` is not null, since it is their mean. */
  scored: number
  /**
   * What the outputs have in place of a score when grading leaves out every one
   * of them, or when the run did not finish the case (`shortOf`).
   */
  cut: Output['cut']
}

/**
 * Where one case stands on the skill as it is now, with every run that
 * answered it. A row holds answers to one request, so a case some run answered
 * before its prompt or files changed has a second one for those answers.
 */
export interface CaseStand extends Standing<CaseTry> {
  /** One key per row: the case's id for the case as it stands, else its id and what its runs were asked. */
  key: string
  id: string
  /** The case's name; for answers to an earlier request, the name it had then. */
  title: string
  /**
   * The case as the skill asks it now, so it can be run again. False for one
   * deleted since it ran, and for answers to an earlier request: a new run
   * would answer another.
   */
  known: boolean
  /** Answers to a case the skill still has, written before its prompt or files changed. */
  earlier: boolean
  /** Every run that answered the case so, the newest first, a run without the skill among them. */
  history: CaseTry[]
}

/**
 * Every case and where it stands on the version a run would test now
 * (`state.versions.current`): the skill's cases in their own order, one never
 * run among them, then the answers to a case before it changed, and any case
 * deleted since it ran. Each case is read against its own runs, so a run of one
 * case says nothing about the others.
 */
export function standingsOf(state: State, outputs: Output[], config: BenchConfig): CaseStand[] {
  const known = new Map(state.cases.map((c) => [c.id, c]))
  /** The output answers one of the skill's cases as it stands. */
  const stands = (o: Output) => o.earlier === null && known.has(o.caseId)
  const rows = new Map<string, Output[]>()
  for (const o of outputs) {
    const key = stands(o) ? o.caseId : askedKey(o)
    rows.set(key, [...(rows.get(key) ?? []), o])
  }
  const standing = (key: string, id: string, title: string, live: boolean): CaseStand => {
    const byRun = new Map<string, Output[]>()
    for (const o of rows.get(key) ?? [])
      byRun.set(o.run.name, [...(byRun.get(o.run.name) ?? []), o])
    const tries: CaseTry[] = [...byRun.values()].map((mine) => ({
      ...testOf(mine[0].run),
      graded: String(mine[0].judged),
      run: mine[0].run,
      outputs: mine,
      score: scoreOver(mine, config),
      totals: mine.flatMap((o) => {
        const total = totalOf(o, config)
        return total === null ? [] : [total]
      }),
      scored: mine.filter((o) => totalOf(o, config) !== null).length,
      cut: cutOf(mine) ?? shortOf(mine[0].run, mine[0].caseId),
    }))
    return {
      key,
      id,
      title,
      known: live,
      earlier: !live && known.has(id),
      history: [...tries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ...standingOf(tries, state.versions.current.version, (from, to) =>
        moveBetween(from.outputs, to.outputs, config),
      ),
    }
  }
  const order = [...known.keys()]
  const place = (id: string) => (known.has(id) ? order.indexOf(id) : order.length)
  const apart = [...rows]
    .filter(([key]) => !known.has(key))
    .map(([key, [first]]) => ({
      key,
      id: first.caseId,
      title: first.earlier ? caseName(first.earlier) : first.caseId,
    }))
    .sort((x, y) => place(x.id) - place(y.id) || x.key.localeCompare(y.key))
  return [
    ...state.cases.map((c) => standing(c.id, c.id, caseName(c), true)),
    ...apart.map((row) => standing(row.key, row.id, row.title, false)),
  ]
}

/**
 * The run of a case that only a grading keeps from a score: its newest run
 * with the skill after the score the case stands on, when every one of its
 * outputs ran to its end. Null when the case waits on no grading.
 */
export function toGrade(standing: Pick<CaseStand, 'latest' | 'tries'>): CaseTry | null {
  const { latest, tries } = standing
  const newer = latest ? tries.slice(tries.indexOf(latest) + 1) : tries
  return (
    newer.findLast((t) => t.score === null && t.cut === null && !t.outputs.every(unreadOutput)) ??
    null
  )
}

/**
 * How far the cases have come: each case's first score against its latest,
 * with its score without the skill as the floor, over the cases that ran more
 * than once. Answers to a case before it changed are left out: the case counts
 * once, as it stands. Null until one has.
 */
export const liftOf = (standings: readonly CaseStand[]): CaseLift | null =>
  caseLift(standings.filter((s) => !s.earlier))

/**
 * What the files hold that no version keeps, in a line: "Edited since v1",
 * after the newest version. Null while the files are a version as they stand,
 * and before the first version, when there is none to have edited since. It
 * names the version that exists: the number the next run will take is on Run,
 * and is no state until a run has made it.
 */
export function editedSince(versions: SkillVersions): string | null {
  const newest = versions.versions.at(-1)
  return versions.current.changed && newest ? `Edited since ${newest.version}` : null
}

/**
 * The line under the skill's name: how its files stand against its versions.
 * A version as it stands gives its number, its name and its score; edits no
 * version keeps give `editedSince`; before the first version, "Not run yet".
 */
export function versionLine(versions: SkillVersions, score: number | null): string {
  const { current } = versions
  if (current.changed) return editedSince(versions) ?? 'Not run yet'
  return `${current.version}${current.name ? ` · ${current.name}` : ''}${score === null ? '' : ` · mean ${Math.round(score)}`}`
}

/**
 * The versions outputs were written on, oldest first: "v0", "v1". A version
 * whose every output was stopped or failed has nothing to read or score, so it
 * is not one of them.
 */
export function versionsRun(outputs: Output[]): string[] {
  const seen = new Set(
    outputs
      .filter((o) => o.cut !== 'stopped' && o.cut !== 'failed')
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
 * What the versions list, a version's page and the sidebar read of a version:
 * its score, and what its line says of it. With no score, `why` says why it
 * has none. With one, `why` is null unless another writer than the other
 * scores' wrote it, and then names that writer.
 */
export interface VersionReading {
  score: number | null
  why: string | null
}

/**
 * A version's score under `config`, counted as `scoreOver` counts. Once one
 * writer ran two versions (`versionWriter`), every version is read by that
 * writer's outputs alone, so one version's score is read against the next.
 * A version it never ran is read by the one writer that ran it, and says
 * which, so the score is not taken for one of the same writer's. Run by more
 * than one other writer it has no score, since a mean of them is no writer's,
 * and says which writer to run it with. Before any writer ran two versions, a
 * version counts all its outputs.
 */
export function versionReading(
  outputs: Output[],
  config: BenchConfig,
  version: string,
): VersionReading {
  const mine = versionOutputs(outputs, version)
  if (!mine.length) return { score: null, why: 'not run yet' }
  const runs = [...new Map(outputs.map((o) => [o.run.name, o.run])).values()]
  const writer = versionWriter(versionRuns(runs, outputs, config))
  const pinned = writer ? mine.filter((o) => writerKey(o.run.meta?.writer) === writer) : mine
  const others = new Set(mine.map((o) => writerKey(o.run.meta?.writer)))
  if (!pinned.length && others.size > 1) {
    const by = outputs.find((o) => writerKey(o.run.meta?.writer) === writer)
    return { score: null, why: `not run with ${writerName(by?.run.meta?.writer)}` }
  }
  const score = scoreOver(pinned.length ? pinned : mine, config)
  if (score === null) return { score: null, why: 'no score yet' }
  return { score, why: pinned.length ? null : `with ${writerName(mine[0].run.meta?.writer)}` }
}

/** A version's score, as `versionReading` reads it. Null when it has none. */
export const versionScore = (
  outputs: Output[],
  config: BenchConfig,
  version: string,
): number | null => versionReading(outputs, config, version).score

/** The score of the outputs written without the skill, counted as a version's is. */
export const noSkillScore = (outputs: Output[], config: BenchConfig): number | null =>
  scoreOver(
    outputs.filter((o) => o.run.meta?.configuration === 'without_skill'),
    config,
  )

export const mergedConfig = (saved: Partial<BenchConfig> | null): BenchConfig =>
  mergeConfig(saved, scorers)

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

/** `rulesUnmarked` for one output: its run's report marked no rule or check on it. */
export const outputRulesUnmarked = (output: Pick<Output, 'run' | 'result'>): boolean =>
  output.result !== null &&
  rulesUnmarked({ model: output.run.report?.model ?? null, results: [output.result] })

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
 * for the reader, "9 of 11, 1 not read" where an output was too long for Jev to
 * read whole, and "2 not sure" where it was sure of none.
 */
function countText(count: Count): string {
  const unsure = count.unsure ? `${count.unsure} not sure` : null
  const unread = count.unread ? `${count.unread} not read` : null
  const marked = count.total ? `${count.met} of ${count.total}` : null
  return [marked, unsure, unread].filter(Boolean).join(', ')
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
  ...sampleShown(output.run, output.sample),
  output,
})

/** Two outputs of one case, side by side: `a` the earlier, `b` the later. Either may be missing. */
export interface OutputPair {
  a: Output | null
  b: Output | null
}

/**
 * The two outputs of a case to read side by side first: the version before, or
 * no skill, beside the latest. Where any output answers the case as it stands,
 * the pair is picked among those: one written for an earlier prompt is no
 * measure of the latest.
 */
export function casePair(outputs: Output[], caseId: string): OutputPair {
  const mine = outputs.filter((o) => o.caseId === caseId)
  const current = mine.filter((o) => o.earlier === null)
  const pair = defaultPair((current.length ? current : mine).map(candidate))
  return { a: pair.a?.output ?? null, b: pair.b?.output ?? null }
}

/**
 * The address that reads `output` on the right: beside the output its case
 * opens with on the left, unless it is that one itself.
 */
export function readParams(
  outputs: Output[],
  caseId: string,
  output: Output,
): Record<string, string> {
  const { a, b } = casePair(outputs, caseId)
  const beside = [a, b].find((o) => o && o.key !== output.key) ?? null
  return { case: caseId, a: beside?.key ?? '', b: output.key }
}

/** Every case with an output, in the order Cases lists them; a case since deleted comes last. */
export function casesRun(state: State, outputs: Output[]): string[] {
  return casesInOrder(
    state.cases.map((c) => c.id),
    outputs.map((o) => o.caseId),
  )
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
const runInSentence = (run: RunView, { start = false, short = false } = {}): string =>
  isWithoutSkill(run) ? `${start ? 'The' : 'the'} run without the skill` : runTitle(run, { short })

/** Why something has no score, as the end of a line that opens with its name: "v2 was stopped before it finished". */
export const unscoredWords = (cut: Output['cut']): string =>
  cut === 'stopped'
    ? 'was stopped before it finished'
    : cut === 'failed'
      ? 'could not finish'
      : cut === 'unfinished'
        ? 'is not finished'
        : 'has no score yet'

/**
 * Why an output's agent failed, in the agent's own words; null when it did
 * not, and for one that was stopped. A stop is the reader's own doing, never
 * a failure: its output says so in plain words.
 */
export function failureOf(output: Output): string | null {
  const meta = output.run.meta?.samples.find((s) => s.dir === output.sample.name)
  return output.cut === 'stopped' || meta?.stopped ? null : (meta?.error ?? null)
}

/** Why an output that failed has no score, as a sentence: "It ran out of time, so it has no score." Null for one that did not fail. */
export function failedLine(output: Output): string | null {
  if (output.cut !== 'failed') return null
  const meta = output.run.meta?.samples.find((s) => s.dir === output.sample.name)
  return `It ${meta?.failed ?? 'could not finish'}, so it has no score.`
}

/**
 * The outputs of a case one side of a comparison picks from: each that ran to
 * its end or is still being written, and `shown`, the ones in view. A stopped
 * or failed output has no score to compare, so it is not offered; it is still read from
 * its run, under Runs on All cases.
 */
export const outputsToPick = (
  outputs: readonly Output[],
  caseId: string,
  shown: ReadonlyArray<Output | null>,
): Output[] =>
  outputs.filter(
    (o) =>
      o.caseId === caseId &&
      (o.cut === null || o.cut === 'unfinished' || shown.some((s) => s?.key === o.key)),
  )

/** That an output has no score, as a line that opens with its run. */
export const unscoredLine = (output: Output): string =>
  `${runInSentence(output.run, { start: true, short: true })} ${unscoredWords(output.cut)}`

/**
 * A run with no end of its own that no job is writing: the app quit or crashed
 * while it ran, so it stopped where it was. `writing` says whether a job is
 * writing it now. False for a run of flat files, which records no end.
 */
export const cutOff = (run: RunView, writing: boolean): boolean =>
  Boolean(run.meta && !run.meta.legacy && !run.meta.finishedAt && !writing)

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

/** A case's name: the skill's own, or for a case since deleted the name a run kept of it, else its id. */
export function caseTitle(state: State, caseId: string): string {
  const found =
    state.cases.find((c) => c.id === caseId) ??
    state.runs.flatMap((run) =>
      Object.hasOwn(run.cases, caseId) ? run.cases[caseId].earlier : [],
    )[0]
  return found ? caseName(found) : caseId
}

export const primaryOf = (output: Output): Artifact | null => output.primary

/** The kinds of file Jev reads as text beside the one that stands for an output (`othersOf` in `application/grade.ts`). */
const READ_BESIDE: ReadonlySet<string> = new Set(['markdown', 'html', 'code'])

/**
 * What a score is for, where its output wrote more than one file; null where
 * it wrote one. A piece with a file that stands for it, a page, a picture or a
 * note, is scored as that file: "The score is for post.md." Code written as
 * several files has no such file: its rules and checks are marked on all of
 * them, so the line says how many.
 */
export function scoredFor(output: Output): string | null {
  const { primary, sample } = output
  if (!primary || sample.artifacts.length < 2) return null
  const code = sample.artifacts.filter((artifact) => artifact.kind === 'code')
  if (primary.kind !== 'code' || code.length < 2 || sample.legacy)
    return `The score is for ${primary.file.replace(/^outputs\//, '')}.`
  const read = sample.artifacts.filter((artifact) => READ_BESIDE.has(artifact.kind)).length
  return read === sample.artifacts.length
    ? `The score is for all ${read} files it wrote.`
    : `The score is for the ${read} files of text it wrote.`
}

/** The file Results opens an output on: something to look at before code, prose as itself (`previewArtifact`). */
export const previewOf = (output: Output): Artifact | null =>
  previewArtifact(output.sample.artifacts, output.primary)

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

/** "2m 14s", or "38s" under a minute. */
export const duration = (seconds: number): string =>
  seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`

/** The answer to a case that Results opens on: the latest version's, or the only one. Null for a case not run. */
export function lastAnswer(outputs: Output[], caseId: string): Output | null {
  const pair = casePair(outputs, caseId)
  return pair.b ?? pair.a
}

/** What one attempt at a case cost in a run, on average over the attempts that ran to their end. */
export interface AttemptCost {
  usd: number
  seconds: number
  /** "Sonnet": the model counts for more of the cost than the case does. */
  model: string
}

/** What an attempt at `output`'s case cost in its run; null for a run that kept no cost. */
export function attemptCost(output: Output): AttemptCost | null {
  const samples = (output.run.meta?.samples ?? []).filter(
    (s) => s.case === output.caseId && s.costUsd !== null && !s.stopped && !s.failed,
  )
  const usd = mean(samples.map((s) => s.costUsd ?? 0))
  const seconds = mean(samples.map((s) => s.seconds))
  if (usd === null || seconds === null) return null
  return { usd, seconds: Math.round(seconds), model: modelShort(output.run.meta?.writer) }
}

/** Cents, or four places for an amount under ten cents. */
export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? '–' : `$${value.toFixed(value < 0.1 ? 4 : 2)}`

export const fmt = (value: number | null, places = 1): string =>
  value === null ? '–' : value.toFixed(places)

/** What a delete in the trash took, as its row names it: "v3", or "A run on v3". */
export const deletedName = (gone: Pick<TrashedDelete, 'kind' | 'version'>): string =>
  gone.kind === 'version' ? gone.version : `A run on ${gone.version}`

/** "2 versions and 1 run": what the trash holds, for the line of its fold. */
export function deletesLine(deletes: ReadonlyArray<Pick<TrashedDelete, 'kind'>>): string {
  const versions = deletes.filter((d) => d.kind === 'version').length
  const runs = deletes.length - versions
  return [versions ? plural(versions, 'version') : null, runs ? plural(runs, 'run') : null]
    .filter(Boolean)
    .join(' and ')
}

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
