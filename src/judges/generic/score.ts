/**
 * The generic pack's pure half: adherence to the skill's rules and the case's
 * rubric, from stored Nouls, whatever kind of file the output is. Thresholds and weights come from the config, and
 * the reader's corrections stand over Jev's answers.
 */
import {
  type Corrections,
  isMissed,
  NO_CORRECTIONS,
  OLDER_VERSION,
  type PackScore,
  type PackScoring,
  type ScoreSubject,
  type Verdict,
} from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty } from '@domain/stats.ts'
import {
  type Cuts,
  codeAnswerOf,
  finding,
  jevVerdict,
  readingOf,
  unmarkableVerdict,
} from '@domain/verdict.ts'
import {
  answerOf,
  clip,
  isOutputCut,
  isUnmarked,
  markChecks,
  metShare,
  type PartAnswers,
  type Parted,
  type StatementAnswer,
  UNREAD_WHY,
  type UnmarkedAnswer,
  type UnmarkedCheck,
  unmarkedWhy,
} from '../shared/score.ts'

/**
 * A rule's answers. `noul` is the probability the output follows it, or its
 * first part does when the output was asked in parts (`GenericRaw.parts`);
 * `parts` then holds every part's, and `span` how they are joined, when known.
 */
export interface RuleAnswer extends PartAnswers {
  id: string
  text: string
  section: string
  /**
   * Probability the rules under its heading are for this kind of work. Absent
   * for a rule with no heading, and in a reading from before headings were asked.
   */
  applies?: number
  /**
   * Probability the rule comes up for what the request asks. Absent for an
   * output with no request, and in a reading from before rules were asked it.
   */
  comesUp?: number
}

/** A rule nobody can mark as written, kept in its place among the rules: Jev was not asked it. */
export interface UnmarkedRule extends UnmarkedAnswer {
  section: string
}

export interface GenericRaw {
  /** Every rule in the skill's order; one nobody can mark as written holds why in place of an answer. */
  adherence: { rules: Array<RuleAnswer | UnmarkedRule> } | null
  /**
   * Every check asked, in the case's order, and each nobody can mark as
   * written in its place. `unasked` says why each check that was not asked was
   * left out: its picture is one Jev cannot read.
   */
  rubric: { statements: Array<StatementAnswer | UnmarkedCheck>; unasked?: string[] } | null
  /** Why the output's picture was left out, when it was. */
  unread?: string
  /** What Jev read less of, in a reading made before `cut` was kept. */
  short?: string
  /** Each part of the work Jev read only the start of, or none of, as its flag says it. */
  cut?: string[]
  /**
   * How an output too long to read at once was asked: in `of` parts, of which
   * the first `read` were asked. Absent when it was asked whole.
   */
  parts?: Parted
}

/**
 * A reading kept from before long outputs were asked in parts, of an output
 * Jev read only the start of: each answer is of the first part alone, and
 * nothing of the rest was read.
 */
const firstPartOnly = (raw: GenericRaw): boolean => !raw.parts && (raw.cut ?? []).some(isOutputCut)

/**
 * How the output was asked: in parts, as `raw.parts` says, or, for a reading
 * kept from before parts were asked of an output Jev read only the start of,
 * the first of at least two. Null for an output asked whole.
 */
const partedOf = (raw: GenericRaw): Parted | null =>
  raw.parts ?? (firstPartOnly(raw) ? { read: 1, of: 2 } : null)

/**
 * How surely a rule comes up for what was asked, as it sets the rule aside.
 * Asked of the request alone, a rule whose condition is about the answer
 * ("When quoting a price, ...") can read as one that does not come up. Its own
 * answer was given with the output in view, so a rule marked broken there,
 * by Jev or by code, came up: it stays a miss.
 */
function comesUp(rule: RuleAnswer, answer: number | null, config: BenchConfig): number {
  if (rule.comesUp === undefined) return 1
  const code = rule.code ? codeAnswerOf(rule.code) : null
  const missed = code?.stands
    ? code.met === false
    : answer !== null && readingOf(answer, config) === 'missed'
  return missed ? 1 : rule.comesUp
}

/** One rule as a verdict: Jev's answer joined over its parts, code's where it stands, the reader's over both. */
function ruleVerdict(
  rule: RuleAnswer | UnmarkedRule,
  parted: Parted | null,
  config: BenchConfig,
  corrections: Corrections,
): Verdict {
  const fact = { kind: 'rule' as const, text: rule.text, layer: 'adherence', section: rule.section }
  if (isUnmarked(rule)) return unmarkableVerdict(fact, rule.unmarkable, corrections)
  // An output too long to read at once has each part's answer joined; one its parts do not settle is not read.
  const answer = answerOf(rule, parted, config)
  return jevVerdict(
    fact,
    answer,
    config,
    corrections,
    Math.min(rule.applies ?? 1, comesUp(rule, answer, config)),
    rule.code,
  )
}

/** What a rule's flag says of it: missed, set aside and why, or nothing. */
function ruleFlag(rule: RuleAnswer | UnmarkedRule, verdict: Verdict): string | null {
  const where = `(${rule.section}): ${clip(rule.text)}`
  if (isUnmarked(rule) && verdict.aside)
    return `rule not counted, it cannot be marked as written (${unmarkedWhy(rule.unmarkable)}) ${where}`
  if (isMissed(verdict))
    return `rule not followed${verdict.by === 'code' ? ', by code' : ''} ${where}`
  if (verdict.aside === 'unsure' && verdict.by === 'code')
    return `rule not counted, code could not settle it (${verdict.code?.why ?? 'no answer'}) ${where}`
  if (verdict.aside === 'unsure') return `rule not counted, Jev was not sure ${where}`
  if (verdict.aside === 'unread') return `rule not counted, ${UNREAD_WHY} ${where}`
  return null
}

function scoreGeneric(
  raw: GenericRaw | null,
  _subject: ScoreSubject,
  config: BenchConfig,
  corrections: Corrections = NO_CORRECTIONS,
): PackScore {
  const layers: Record<string, number | null> = { adherence: null, rubric: null }
  const flags: string[] = []
  if (!raw) return { layers, flags, verdicts: [] }
  // What was not judged counts in no layer, and is said.
  const unjudged = [
    ...(raw.unread ? [raw.unread] : []),
    ...(raw.short ? [raw.short] : []),
    ...(raw.cut ?? []),
    ...(raw.rubric?.unasked ?? []),
  ]
  flags.push(...unjudged)
  const rules = raw.adherence?.rules ?? []
  const parted = partedOf(raw)
  const followed = rules.map((rule) => ruleVerdict(rule, parted, config, corrections))
  // The share of the rules that count: one set aside, for whatever reason, is in neither number.
  layers.adherence = metShare(followed)
  rules.forEach((rule, i) => {
    const flag = ruleFlag(rule, followed[i])
    if (flag) flags.push(flag)
  })
  const elsewhere = followed.filter((v) => v.aside === 'inapplicable').length
  if (elsewhere)
    flags.push(
      `${elsewhere} ${elsewhere === 1 ? 'rule' : 'rules'} not counted: for another kind of work or situation than this`,
    )
  const checks = markChecks(raw.rubric?.statements ?? [], 'rubric', config, corrections, parted)
  layers.rubric = checks.share
  flags.push(...checks.flags)
  return {
    layers,
    flags,
    verdicts: [...unjudged.map(finding), ...followed, ...checks.verdicts],
  }
}

/**
 * How sure Jev was of each rule and check, as scoring reads it: for an output
 * asked in parts, the joined answer (`joinParts`), and none for a fact the
 * parts do not settle, since Jev gave no answer of the whole to be sure of.
 * A fact nobody can mark was not asked, so it adds nothing.
 */
function certaintiesGeneric(raw: GenericRaw | null, cuts: Cuts): number[] {
  if (!raw) return []
  const parted = partedOf(raw)
  return [...(raw.adherence?.rules ?? []), ...(raw.rubric?.statements ?? [])]
    .flatMap((fact) => (isUnmarked(fact) ? [] : [answerOf(fact, parted, cuts)]))
    .filter((answer): answer is number => answer !== null)
    .map(certainty)
}

/** A kept reading of a long output Jev read only the start of, from before such an output was asked in parts. */
const behindGeneric = (raw: GenericRaw | null): string | null =>
  raw && firstPartOnly(raw) ? OLDER_VERSION : null

export const genericScoring: PackScoring<GenericRaw> = {
  id: 'generic',
  // Any output: what a skill's rules ask does not depend on the kind of file it makes.
  artifacts: [],
  layers: ['adherence', 'rubric'],
  defaults: { weights: { adherence: 50, rubric: 50 } },
  score: scoreGeneric,
  certainties: certaintiesGeneric,
  behind: behindGeneric,
}
