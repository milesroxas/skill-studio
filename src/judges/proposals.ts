/**
 * What Jev is asked about proposed checks (`st propose`): whether two
 * proposals ask the same of an answer, so they are one check for every case,
 * and whether a proposal's basis asks for all of what the check asks. Write
 * checks with AI asks the first of a new check and a check its case has
 * (`sameOf`). Jev reads and answers yes or no with a probability; it writes
 * nothing here.
 *
 * Each is asked both ways round, and the two answers are read as one
 * (`bothWays`). On the test skill's proposals, one question asked one way
 * round could not tell a check that adds a value of its own from a fair one
 * (a fair "never names the codename" was a sure "adds"; a "body text is
 * #0B3D5C" on a list of colours was not sure); asked both ways, the three
 * that add a value or an exception fell to 0.11 or below and the fair ones
 * stood at 0.66 or above, with two "not sure" between. Two checks are
 * compared with the words each stands on, and with the case's own name for
 * its answer read as "The answer" (`answerWords`): "The email never names X"
 * and "The page never names X" were "not sure" until then.
 */
import { noul, type Question } from '@typesafe-ai/sdk'
import type { JevAsker, JevState } from './jev.ts'
import { noulOf } from './shared/questions.ts'

/** The version of these questions. An answer kept under another is asked again. */
export const PROPOSAL_QUESTIONS_VERSION = 2

/** The most of these questions one request to Jev carries: more go in another request, after it. */
export const QUESTIONS_PER_REQUEST = 40

/** A longer request or file is cut here: Jev reads the start, which says what was asked. */
const TEXT_MAX = 8_000

const cut = (text: string): string =>
  text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}\n[cut here]` : text

/** Two checks to be read as one, or not. */
export const SAME_STATE: JevState = {
  about:
    'Checks people wrote to test answers to requests of one kind, each on the request it was written for. Each check is one statement a good answer makes true, and stands on words of its request that ask for it.',
}

/** A check to compare, with the words of its request it stands on; empty for a check for every case, which stands on none. */
interface Compared {
  check: string
  words: string
}

/**
 * The pair of questions that asks whether checks `a` and `b` ask the same of
 * an answer: `same` then `differ`. Each check comes with the words it stands
 * on, which tell two checks on one requirement from two that only sound alike.
 */
export function sameQuestions(a: Compared, b: Compared): [Question, Question] {
  const on = (c: Compared) => (c.words ? `, which stands on the words "${c.words}"` : '')
  const aside = (c: Compared) => (c.words ? ` (which stands on the words "${c.words}")` : '')
  return [
    noul(
      `Do these two checks ask for the same thing of an answer? First: "${a.check}"${on(a)}. Second: "${b.check}"${on(b)}.`,
      {
        true: 'Any answer that meets one meets the other: they ask for the same fact in other words.',
        false:
          'An answer could meet one and miss the other: one asks for more, for less, or for something else.',
      },
    ),
    noul(
      `Could one answer meet the check "${a.check}"${aside(a)} and miss the check "${b.check}"${aside(b)}, or miss the first and meet the second?`,
      {
        true: 'The two checks ask for different things, or one asks for more than the other.',
        false: 'They ask for the same fact in other words: any answer meets both or misses both.',
      },
    ),
  ]
}

/** What one case's proposals are read beside: its request, its files and its note. */
export function basisState(input: {
  request: string
  files: Readonly<Record<string, string>>
  note: string
}): JevState {
  return {
    about:
      'The request and its files say what a good answer holds. A check is a test of one answer. It may say what they ask in other words; it may not add a value, a limit, a place or an exception they do not state.',
    request: cut(input.request.trim()),
    files: Object.fromEntries(Object.entries(input.files).map(([name, text]) => [name, cut(text)])),
    note: input.note.trim(),
  }
}

/** Where a basis is, as the state names it. */
const whereOf = (basis: { in: 'request' } | { in: 'note' } | { in: 'input'; file: string }) =>
  basis.in === 'request'
    ? '`request`'
    : basis.in === 'note'
      ? '`note`'
      : `${basis.file} in \`files\``

/**
 * The pair of questions that asks whether `words`, at `basis`, ask for all of
 * `check`: `forward` (they do) then `inverse` (the check asks for more).
 */
export function basisQuestions(
  check: string,
  words: string,
  basis: { in: 'request' } | { in: 'note' } | { in: 'input'; file: string },
): [Question, Question] {
  const stands = `The check "${check}" stands on these words of ${whereOf(basis)}: "${words}".`
  return [
    noul(
      `${stands} Is every value, limit, place and exception in the check stated in those words or in \`request\`, so that the check adds nothing of its own?`,
      {
        true: 'Each value, limit, place and exception the check holds is in the words or the request: the check only says it as a test, in other words.',
        false:
          'The check holds a value, a limit, a place or an exception that neither the words nor the request state.',
      },
    ),
    noul(
      `${stands} Does the check ask an answer for more than those words ask, read with \`request\`: a number, a place, a part, a limit or an exception that none of them states?`,
      {
        true: 'The check asks for something none of them states, so an answer could do all they ask and still miss it.',
        false:
          'The check asks for what the words ask, in other words or as a test, and nothing more.',
      },
    ),
  ]
}

/** Two answers of Jev's, one to a question and one to its opposite, read as one probability that the first holds. */
export const bothWays = (yes: number, no: number): number => (yes + 1 - no) / 2

/**
 * For each pair of checks, the probability that the two ask the same of an
 * answer: `sameQuestions` asked of `SAME_STATE` and read both ways round, in
 * one request, so a caller sends at most half `QUESTIONS_PER_REQUEST` pairs.
 * Neither check stands on words of a request, as a check Write with AI adds
 * to a case does not. `signal` ends the request. Asks nothing for no pairs.
 */
export async function sameOf(
  jev: JevAsker,
  pairs: ReadonlyArray<readonly [string, string]>,
  signal?: AbortSignal,
): Promise<number[]> {
  if (!pairs.length) return []
  const questions = Object.fromEntries(
    pairs.flatMap(([a, b], i) => {
      const [same, differ] = sameQuestions({ check: a, words: '' }, { check: b, words: '' })
      return [
        [`same_${i}`, same],
        [`differ_${i}`, differ],
      ]
    }),
  )
  const answers = await jev.ask(SAME_STATE, questions, signal)
  return pairs.map((_, i) => bothWays(noulOf(answers, `same_${i}`), noulOf(answers, `differ_${i}`)))
}
