/**
 * The practice skill: a small finished skill a newcomer takes round the whole
 * loop before writing one of their own. Its answer is two sentences, so a run
 * is quick and two outputs are read side by side in seconds. One rule is vague
 * on purpose, so the first run comes back long: swapping that rule for an
 * exact one is the practice. Each case checks for two sentences, which Jev
 * grades, and holds a word limit, which shows without Jev. Pure data and
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

/**
 * Once round the loop, twice past its run: read the skill and its cases, run,
 * read what the notes missed, change one rule, run again, compare.
 */
export const PRACTICE_STEPS = [
  'read',
  'cases',
  'run',
  'results',
  'edit',
  'rerun',
  'compare',
] as const
export type PracticeStep = (typeof PRACTICE_STEPS)[number]

/**
 * The steps that only ask the reader to look at a screen. Nothing on disk shows
 * that they looked, so opening the screen while the step is in hand marks it.
 * The guide still shows the step while that screen is in view: `practiceView`.
 */
export const LOOK_STEPS = ['read', 'cases', 'results', 'compare'] as const
export type LookStep = (typeof LOOK_STEPS)[number]
export const isLookStep = (step: string): step is LookStep =>
  (LOOK_STEPS as readonly string[]).includes(step)

/** What the skill's own files say about how far the walkthrough went, and the screens looked at. */
export interface PracticeFacts {
  /** Skill versions that have outputs, oldest first. */
  versions: string[]
  /** The version the files are now. */
  current: string
  /** Look steps marked as seen. */
  seen: readonly string[]
}

export interface PracticeProgress {
  done: Record<PracticeStep, boolean>
  /** The first step not done yet; null once the loop is closed. */
  step: PracticeStep | null
}

export function practiceProgress(facts: PracticeFacts): PracticeProgress {
  const ran = facts.versions.length > 0
  const reran = facts.versions.length > 1
  // Running a second version proves an edit was made, even if it was undone since.
  const edited = reran || (ran && facts.current !== facts.versions[0])
  // A later step done means the reader went past the look steps before it.
  const seen = (step: LookStep, past: boolean) => past || facts.seen.includes(step)
  const done: Record<PracticeStep, boolean> = {
    read: seen('read', ran),
    cases: seen('cases', ran),
    run: ran,
    results: seen('results', edited),
    edit: edited,
    rerun: reran,
    // A look step like the others, with two versions to compare.
    compare: reran && facts.seen.includes('compare'),
  }
  return { done, step: PRACTICE_STEPS.find((step) => !done[step]) ?? null }
}

export interface PracticeView {
  /** The step the guide shows; null once the loop is closed. */
  shown: PracticeStep | null
  /**
   * The step the top bar points to: the one shown, or the one after it while
   * the reader is on the screen the shown one asks them to look at.
   */
  next: PracticeStep | null
}

const NONE: PracticeView = { shown: null, next: null }

/**
 * What the guide shows of the progress. Opening a look step's screen marks the
 * step done at once, so the progress runs a step ahead of a reader who is
 * still reading. Until they leave that screen the guide keeps to its step, and
 * points on to the one after. `looking` is the look step the reader is reading
 * now: the one in hand with its screen open, or the one this visit to its
 * screen marked. A look step left behind is not read again by coming back.
 */
export function practiceView(progress: PracticeProgress, looking: LookStep | null): PracticeView {
  const { step } = progress
  // The last step is a look step too: still being read, though the loop closed when its screen opened.
  if (!step) return looking === PRACTICE_STEPS.at(-1) ? { shown: looking, next: null } : NONE
  const at = PRACTICE_STEPS.indexOf(step)
  // Still being read: the step was marked done when its screen opened.
  if (looking && PRACTICE_STEPS[at - 1] === looking) return { shown: looking, next: step }
  // Its screen has just opened, and the mark is on its way.
  if (looking === step) return { shown: step, next: PRACTICE_STEPS[at + 1] ?? null }
  return { shown: step, next: step }
}
