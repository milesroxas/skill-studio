/**
 * The numbers the reading gate holds `launch-note` to. Two sets:
 *
 * - `STORED`: what `pnpm check` counts with no network
 *   (`src/interfaces/cli/reading-gate.test.ts`): the five stored gradings
 *   under `fixtures/launch-note/evals/runs`, scored by the code as it is now,
 *   and the gold readings (`gold.ts`) answered by code on the stored outputs
 *   and on each one changed to miss (`mutations.ts`).
 * - `LIVE`: what the last `pnpm reading-gate` counted, with the assistant
 *   sorting both versions afresh and Jev grading the five runs afresh.
 *
 * A ceiling is the most a count may reach; every other number is held
 * exactly, so a count that moves fails until someone changes it here on
 * purpose. To pin again, run the test with `READING_GATE_REPORT=1` (or the
 * live command), copy what it prints, and say on the line above what moved
 * the numbers.
 */

/** A grading's answers on the facts the key answers (`GradeTally` in `count.ts`). */
export interface PinnedGrading {
  /** The most sure answers, Jev's or code's, the key may not share. */
  wrongCeiling: number
  right: number
  unsure: number
  unread: number
  inapplicable: number
  unmarkable: number
  /** Sure answers code gave, of all those counted. */
  byCode: number
}

/** Exact readings answered by code against the key. */
export interface PinnedExact {
  /** Rules and checks answered, one per output each. */
  facts: number
  agreed: number
  /** Of those agreed, how many both call missed. */
  missed: number
  /** The most answers code may give that the key does not share. Zero: one is a sure wrong answer that looks like a fact. */
  disagreedCeiling: 0
}

/** The reader's marks on the facts the stored gradings set aside (`MarkedTally` in `count.ts`). */
export interface PinnedMarked {
  marked: number
  unsure: number
  unread: number
  unmarkable: number
  counted: number
  wrong: 0
}

export const STORED: {
  grading: PinnedGrading
  marked: PinnedMarked
  stored: PinnedExact
  mutated: PinnedExact
} = {
  // 2026-11-21: the stored gradings made again as a baseline that holds code's
  // answers: both versions sorted with Sonnet under sorting prompt version 12,
  // then the five runs graded with Jev (jev-1.14.0) on those readings, and the
  // readings kept in `evals/rule-readings.json`. Before, no stored grading held
  // a code answer (303 right, 1 wrong, 30 not sure, 64 not read). Code answers
  // 183, each as the key does; the Haiku word count Jev got wrong is code's
  // now. Cannot be marked is version one's pair and vague rule on every output,
  // and on `page-long` alone the 120-word rule, which cannot hold beside
  // "The page lists all 180 changes" (5 of the 35). Not read rose from the 10
  // of the last live count to 17: this sort reads "lists all 180 changes" as
  // Jev's over the whole output, which the long page's parts cannot settle.
  grading: {
    wrongCeiling: 0,
    right: 342,
    unsure: 4,
    unread: 17,
    inapplicable: 100,
    unmarkable: 35,
    byCode: 183,
  },
  // 2026-11-21: every fact the baseline sets aside, marked as the key answers
  // it, counts as the reader's: 4 not sure, 17 not read, 35 cannot be marked.
  marked: { marked: 56, unsure: 4, unread: 17, unmarkable: 35, counted: 56, wrong: 0 },
  // 2026-11-21: the gold readings as first written.
  stored: { facts: 589, agreed: 315, missed: 21, disagreedCeiling: 0 },
  // 2026-11-21: a seventh change to miss, a change left out whose name starts
  // a longer one ("Faster calendar sync" beside "Faster calendar sync, part 2"),
  // on the five long pages: 99 facts more, 51 agreed, 11 of them missed.
  mutated: { facts: 3534, agreed: 1917, missed: 383, disagreedCeiling: 0 },
}

export interface PinnedLive {
  at: string
  sortModel: string
  grading: PinnedGrading
  /** The assistant's exact readings against the key, on the stored outputs and on them changed to miss. */
  stored: { agreed: number; disagreedCeiling: 0 }
  mutated: { agreed: number; disagreedCeiling: 0 }
  /** How the 47 rules and checks of both versions were read. */
  readings: { exact: number; judged: number; unmarkable: number }
  /** What the run spent. */
  spent: { minutes: number; assistantInput: number; assistantOutput: number; jevQuestions: number }
}

export const LIVE: PinnedLive | null = {
  // 2026-11-21, sorting prompt version 12, Jev jev-1.14.0: the run the
  // fixture's baseline was copied from. A check is never set aside for a rule
  // now: "The page lists all 180 changes" is graded, and the 120-word rule is
  // set aside on `page-long` alone, so not markable fell from 4 to 3 (version
  // one's pair and its vague rule) and Cannot be marked held at 35. This sort
  // reads "lists all 180 changes" as Jev's over the whole output, so on the
  // long page it is not read (10 to 17). On the changed outputs, 1,080 agreed
  // became 1,125: 24 on the seventh change to miss, the rest this sort's own.
  at: '2026-11-21',
  sortModel: 'sonnet',
  grading: {
    wrongCeiling: 0,
    right: 342,
    unsure: 4,
    unread: 17,
    inapplicable: 100,
    unmarkable: 35,
    byCode: 183,
  },
  stored: { agreed: 183, disagreedCeiling: 0 },
  mutated: { agreed: 1125, disagreedCeiling: 0 },
  readings: { exact: 20, judged: 24, unmarkable: 3 },
  spent: { minutes: 1.1, assistantInput: 218_460, assistantOutput: 14_132, jevQuestions: 895 },
}
