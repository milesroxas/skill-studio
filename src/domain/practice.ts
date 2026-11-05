/**
 * The practice skill: a small finished skill a newcomer takes round the whole
 * loop before writing one of their own. Its answer is two sentences, so a run
 * is quick and an output is read and rated in seconds. One rule is vague on
 * purpose, so the first run comes back long: swapping that rule for an exact
 * one is the practice. Each case checks for two sentences, which the judge
 * scores, and holds a word limit, which shows without a judge. Pure data and
 * functions.
 */
import { kase, type SkillStart } from './templates.ts'

/** The most words a practice answer may have: the number the vague rule leaves out. */
const WORD_LIMIT = 25

/**
 * The rule the skill starts with, the rule that replaces it, and why the
 * second one works. `phrase` is the vague rule's empty words, for a short hint.
 */
export const PRACTICE_EDIT = {
  phrase: 'A reasonable length',
  bad: 'Keep the note to a reasonable length. Nobody reads a long thank-you.',
  good: `Write exactly two sentences, ${WORD_LIMIT} words or fewer in total. A thank-you longer than a glance gets skimmed.`,
  why: 'The agent can count sentences and words. It cannot measure “reasonable”, so that rule changes nothing.',
} as const

export const PRACTICE: SkillStart & { name: string } = {
  name: 'thank-you-note',
  description:
    'Writes a short thank-you note that names what the person did and what it made possible. Use when asked to thank someone.',
  packs: ['generic'],
  body: `# Thank-you note

## When this applies

The user asks for a note that thanks one person for one thing.

## Rules

- Open with the person's first name and add no sign-off. The sender signs it themselves.
- Name what the person did, in the words the request uses. "Thanks for everything" could be sent to anyone.
- Say what their help made possible. The effect is the part they did not see.
- ${PRACTICE_EDIT.bad}
`,
  cases: [
    kase(
      'covered-shift',
      'A colleague covered a shift',
      'Thank Priya for covering my on-call shift on Saturday. It let me go to my sister’s wedding.',
      'Two sentences to Priya. The first names the on-call shift she covered, the second says it let the sender be at the wedding.',
      [
        'The note says Priya covered the on-call shift.',
        'The note mentions the wedding.',
        'The note has exactly two sentences.',
      ],
      [8, WORD_LIMIT],
    ),
    kase(
      'overnight-review',
      'A review done overnight',
      'Write a thank-you to Marcus. He reviewed my 40-page proposal overnight, and it reached the client on time on Friday.',
      'Two sentences to Marcus. The first names the overnight review, the second says the proposal reached the client on time.',
      [
        'The note says Marcus reviewed the proposal.',
        'The note says the proposal reached the client on time.',
        'The note has exactly two sentences.',
      ],
      [8, WORD_LIMIT],
    ),
    kase(
      'introduction',
      'An introduction that led to a job',
      'Thank Elena for introducing me to the hiring manager at Northwind. I start there next month.',
      'Two sentences to Elena. The first names the introduction, the second says the sender got the job.',
      [
        'The note names the introduction to the hiring manager.',
        'The note says the sender starts at Northwind or got the job.',
        'The note has exactly two sentences.',
      ],
      [8, WORD_LIMIT],
    ),
  ],
}

/** SKILL.md with the vague rule swapped for the exact one; null when the vague rule is gone. */
export function applyPracticeEdit(skillMd: string): string | null {
  const bad = `- ${PRACTICE_EDIT.bad}`
  return skillMd.includes(bad) ? skillMd.replace(bad, `- ${PRACTICE_EDIT.good}`) : null
}

/** A name for the version a practice run starts, so the form needs no typing. */
export const practiceVersionName = (versionsRun: number): string =>
  versionsRun ? 'My edit' : 'As written'

/** Once round the loop, in order: run, rate, change one rule, run again, compare. */
export const PRACTICE_STEPS = ['run', 'rate', 'edit', 'rerun', 'compare'] as const
export type PracticeStep = (typeof PRACTICE_STEPS)[number]

/** What the skill's own files say about how far the practice went. Nothing else is stored. */
export interface PracticeFacts {
  /** Skill versions that have outputs, oldest first. */
  versions: string[]
  /** The version the saved files are now. */
  current: string
  /** Graded outputs of the first version, and how many of those are rated. */
  graded: number
  rated: number
  /** Votes cast between two outputs. */
  votes: number
}

export interface PracticeProgress {
  done: Record<PracticeStep, boolean>
  /** The first step not done yet; null once the loop is closed. */
  step: PracticeStep | null
}

export function practiceProgress(facts: PracticeFacts): PracticeProgress {
  const ran = facts.versions.length > 0
  const reran = facts.versions.length > 1
  const done: Record<PracticeStep, boolean> = {
    run: ran,
    rate: facts.graded > 0 && facts.rated >= facts.graded,
    // Running a second version proves an edit was made, even if it was undone since.
    edit: reran || (ran && facts.current !== facts.versions[0]),
    rerun: reran,
    compare: reran && facts.votes > 0,
  }
  return { done, step: PRACTICE_STEPS.find((step) => !done[step]) ?? null }
}
