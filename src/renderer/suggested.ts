/**
 * The checks the assistant suggests for a case (`st propose`), as Cases shows
 * them under the case's own checks (`SuggestedChecks`): which still wait, and
 * how each stands, in words.
 */
import { type ProposedCheck, sameWords } from '@domain/proposal.ts'
import { type Output, outputByKey, runTitle } from './model.ts'

/** An answer that was read misses it: a fault there now. */
const missed = (check: ProposedCheck): boolean => check.answers.some((a) => a.meets === 'no')

/**
 * The checks still suggested for one case, those an answer missed first. One
 * whose words a check of the case says already is left out, so a suggestion
 * just added goes from the list, and comes back if that check is taken out.
 */
export function waitingFor(
  proposals: readonly ProposedCheck[],
  caseId: string,
  statements: readonly string[],
): ProposedCheck[] {
  const own = proposals.filter(
    (p) =>
      p.state === 'proposed' &&
      p.case === caseId &&
      !statements.some((statement) => sameWords(statement, p.check)),
  )
  return [...own.filter(missed), ...own.filter((p) => !missed(p))]
}

/** How the suggestions stand, as a fact after their count: how many of them an answer misses. */
export function missedFact(waiting: readonly ProposedCheck[]): string {
  const count = waiting.filter(missed).length
  if (!count) return 'met by every answer'
  return waiting.length === 1 ? 'missed by an answer' : `${count} missed by an answer`
}

/** How the answers that were read stand on one suggestion, as a count of answers. */
export function standsLine(check: ProposedCheck): string {
  const read = check.answers.length
  const no = check.answers.filter((a) => a.meets === 'no').length
  const yes = check.answers.filter((a) => a.meets === 'yes').length
  if (no) return `Missed by ${no} of ${read} answers`
  if (yes === read) return read === 1 ? 'Met by the one answer read' : `Met by all ${read} answers`
  return `Met by ${yes} of ${read} answers`
}

/** Where the words that ask for a check are, as the reader knows the place. */
export const askedIn = (check: ProposedCheck): string =>
  check.basis.in === 'input'
    ? (check.basis.file ?? 'a file of the request')
    : check.basis.in === 'note'
      ? 'A good answer'
      : 'the request'

/** The answer a fault was seen in; null when there is none, or it was deleted. */
export const faultOutput = (outputs: Output[], check: ProposedCheck): Output | null =>
  check.fault ? outputByKey(outputs, check.fault.key) : null

export const answerName = (output: Output | null): string =>
  output ? runTitle(output.run) : 'An answer since deleted'
