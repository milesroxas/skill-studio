/** Helpers the packs' pure halves share. No server imports: the browser loads these. */
import { weightMark } from '@domain/case-draft.ts'
import type { ExactAnswer } from '@domain/exact.ts'
import { type Corrections, isMissed, type Unmarked, type Verdict } from '@domain/pack.ts'
import type { ExactTest } from '@domain/rule-reading.ts'
import { joinParts, type Span } from '@domain/span.ts'
import { weighted } from '@domain/stats.ts'
import { type Cuts, checkIds, counted, jevVerdict, unmarkableVerdict } from '@domain/verdict.ts'

/**
 * How an output too long to read at once was asked: in `of` parts, the first
 * `read` of them. Each fact then holds the answers of the parts read, and
 * scoring joins them (`joinParts`), so a part not read is never taken for a no.
 */
export interface Parted {
  read: number
  of: number
}

/** What a fact's answer holds: the probability, and for an output in parts each part's, with how they are joined. */
export interface PartAnswers {
  /** The probability Jev answered with: of the whole output, or of its first part when it was asked in parts. */
  noul: number
  /** Each part's probability, unrounded, in order from the first: only for an output asked in parts. */
  parts?: number[]
  /** How the parts' answers make one (`Span`), when it is known. */
  span?: Span
  /**
   * What code answered on the whole files, for a fact read by code
   * (`answerExact`), with what it saw. Jev is still asked: its answer stands
   * where code's does not (`CodeAnswer.stands`).
   */
  code?: CodeKept
}

/** Code's answer as a reading keeps it: what it answered and saw, with the tests it answered, in order. */
export type CodeKept = ExactAnswer & { tests: ExactTest[] }

/**
 * A rule or check nobody can mark as written, as a reading keeps it in place
 * of an answer: Jev was not asked it, and it counts in no layer.
 */
export interface UnmarkedAnswer {
  id: string
  text: string
  unmarkable: Unmarked
}

/** Whether a kept fact is one nobody can mark, not an answer. */
export const isUnmarked = <A extends object>(fact: A | UnmarkedAnswer): fact is UnmarkedAnswer =>
  'unmarkable' in fact

/**
 * A fact's answer as scoring reads it: Jev's probability, or, for an output
 * asked in parts, the parts' answers joined under `cuts`, every part past the
 * ones read standing as not read. Null when the parts cannot settle it.
 */
export function answerOf(fact: PartAnswers, parted: Parted | null, cuts: Cuts): number | null {
  if (!parted) return fact.noul
  const read = (fact.parts ?? [fact.noul]).slice(0, parted.of)
  const unread = Array.from({ length: Math.max(0, parted.of - read.length) }, () => null)
  return joinParts(fact.span ?? null, [...read, ...unread], cuts)
}

/**
 * What is said of a part of the work Jev read the first `n` characters of:
 * "Jev read only the first 40,000 characters of the output". Gradings kept on
 * disk hold this text as their `cut`, and `isOutputCut` knows an old one of a
 * long output by it, so the words must not change.
 */
export const firstOf = (n: number, what: string): string =>
  `${FIRST}${n.toLocaleString('en-US')}${CHARACTERS_OF}${what}`

const FIRST = 'Jev read only the first '
const CHARACTERS_OF = ' characters of '

/** The part `firstOf` names when it is the output itself. */
export const OUTPUT_PART = 'the output'

/** Whether `line` is what `firstOf` says of the output: not of the notes file, SKILL.md or any other part. */
export const isOutputCut = (line: string): boolean => {
  const end = `${CHARACTERS_OF}${OUTPUT_PART}`
  if (!line.startsWith(FIRST) || !line.endsWith(end)) return false
  return /^\d{1,3}(,\d{3})*$/.test(line.slice(FIRST.length, line.length - end.length))
}

export interface StatementAnswer extends PartAnswers {
  id: string
  text: string
  weight: number
  /** The same statement over each unit; null when the output has one unit or none. */
  units: number[] | null
  /** Index of the unit where the statement reads most true. */
  best: number | null
}

export const clip = (text: string, max = 110): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

/** An unmet check, with its ×2 mark when it counts more: a marked miss costs more of the layer. */
export const unmetFlag = (s: Pick<StatementAnswer, 'id' | 'text' | 'weight'>, how = ''): string =>
  `grader ${s.id}${s.weight === 1 ? '' : ` (${weightMark(s.weight)})`} not met${how}: ${clip(s.text)}`

/** A check Jev was not sure of: it is in no count until the reader answers it. */
const unsureFlag = (s: StatementAnswer): string =>
  `grader ${s.id} not counted, Jev was not sure: ${clip(s.text)}`

/** A check code read and would not call: it is in no count until the reader answers it. */
const codeUnsureFlag = (s: StatementAnswer, why: string): string =>
  `grader ${s.id} not counted, code could not settle it (${why}): ${clip(s.text)}`

/** Why a rule or check cannot be marked, as a flag says it. */
export const unmarkedWhy = (u: Unmarked): string =>
  u.why === 'vague'
    ? 'two careful readers would mark it differently'
    : `it cannot hold beside ${u.with === null ? 'another rule' : `"${clip(u.with, 60)}"`}`

/** A check nobody can mark as written: it is in no count until the reader answers it. */
const unmarkedFlag = (s: UnmarkedAnswer): string =>
  `grader ${s.id} not counted, it cannot be marked as written (${unmarkedWhy(s.unmarkable)}): ${clip(s.text)}`

/** Where code answered a missed check, the flag says so. */
const byCode = (verdict: Verdict): string => (verdict.by === 'code' ? ', by code' : '')

/** Why a fact of an output in parts counts in no layer: the parts Jev read do not settle it. */
export const UNREAD_WHY = 'the output is too long for Jev to read it whole'

/** A check the parts of a long output do not settle: it is in no count until the reader answers it. */
const unreadFlag = (s: StatementAnswer): string =>
  `grader ${s.id} not counted, ${UNREAD_WHY}: ${clip(s.text)}`

/** One of a case's checks as a verdict of `layer`, under the name `checkIds` gave it. */
function checkVerdict(
  s: StatementAnswer | UnmarkedCheck,
  id: string,
  layer: string,
  cuts: Cuts,
  corrections: Corrections,
  parted: Parted | null,
): Verdict {
  const fact = {
    kind: 'check' as const,
    id,
    text: s.text,
    layer,
    ...(s.weight === 1 ? {} : { weight: s.weight }),
  }
  if (isUnmarked(s)) return unmarkableVerdict(fact, s.unmarkable, corrections)
  return jevVerdict(fact, answerOf(s, parted, cuts), cuts, corrections, 1, s.code)
}

/** A check nobody can mark as written, with its weight. */
export interface UnmarkedCheck extends UnmarkedAnswer {
  weight: number
}

/**
 * The share met of the facts that count, each by its weight. Null when none
 * counts: there are none, or every one was set aside, so the layer is left out.
 */
export const metShare = (verdicts: readonly Verdict[]): number | null =>
  weighted(counted(verdicts).map((v) => [v.met ? 1 : 0, v.weight ?? 1]))

/** A case's checks as one layer marks them: each as a verdict, the share met by weight, and a flag per miss. */
export interface ChecksMarked {
  verdicts: Verdict[]
  /** Null when the case has no check that counts, so the layer is left out. */
  share: number | null
  flags: string[]
}

/**
 * The case's checks marked for `layer`, the reader's corrections over Jev's
 * answers. Every pack that reads checks counts them here, so a check code
 * answered is code's, and one nobody can mark counts in no layer, wherever it
 * is counted. `parted` says how an output too long to read at once was asked,
 * so each check's parts are joined.
 */
export function markChecks(
  statements: ReadonlyArray<StatementAnswer | UnmarkedCheck>,
  layer: string,
  cuts: Cuts,
  corrections: Corrections,
  parted: Parted | null = null,
): ChecksMarked {
  const ids = checkIds(statements)
  const verdicts = statements.map((s, i) =>
    checkVerdict(s, ids[i], layer, cuts, corrections, parted),
  )
  return {
    verdicts,
    share: metShare(verdicts),
    flags: statements.flatMap((s, i) => {
      const verdict = verdicts[i]
      // One the reader answered counts as any other, so a miss of theirs is flagged as one.
      if (isUnmarked(s))
        return verdict.aside ? [unmarkedFlag(s)] : isMissed(verdict) ? [unmetFlag(s)] : []
      if (isMissed(verdict)) return [unmetFlag(s, byCode(verdict))]
      if (verdict.aside === 'unread') return [unreadFlag(s)]
      if (verdict.aside === 'unsure' && verdict.by === 'code')
        return [codeUnsureFlag(s, verdict.code?.why ?? 'no answer')]
      return verdict.aside === 'unsure' ? [unsureFlag(s)] : []
    }),
  }
}
