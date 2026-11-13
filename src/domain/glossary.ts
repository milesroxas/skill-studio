/**
 * The app's own words, each in one plain sentence. The help on every screen
 * shows the ones that screen uses, and a word in running text opens its
 * meaning: a word is explained where it is met, never in a list to learn
 * first. One list, so a word never means two things. Pure data.
 */

export interface Term {
  /** The word as the app writes it, capitalised as a heading. */
  term: string
  /** What it means, for someone who has never tested a skill. One or two short sentences. */
  means: string
}

export const GLOSSARY = {
  skill: {
    term: 'Skill',
    means:
      'A page of instructions, in a file named SKILL.md, that an AI agent reads before it does one kind of task.',
  },
  rule: {
    term: 'Rule',
    means:
      'One instruction in a skill, written as a bullet. Jev checks every output against every rule.',
  },
  agent: {
    term: 'Agent',
    means:
      'The AI that does the task, such as Claude Code or Cursor. It reads your skill and follows it.',
  },
  case: {
    term: 'Case',
    means:
      'One task that tests the skill: a request to the agent, and the checks a good answer passes.',
  },
  check: {
    term: 'Check',
    means:
      'One fact a good answer makes true, such as “The note mentions the wedding.” Jev marks each check met or missed.',
  },
  run: {
    term: 'Run',
    means:
      'One round of testing: an agent does every case you picked, and Jev grades what it wrote.',
  },
  output: {
    term: 'Output',
    means: 'What the agent wrote for one case in one run. Its answer.',
  },
  sample: {
    term: 'Attempt',
    means:
      'One try at a case. Answers vary from one try to the next, so two or more attempts show whether a result was luck.',
  },
  jev: {
    term: 'Jev',
    means:
      'The AI model that grades every output the same way, against your rules and your checks. Where you disagree with it, your answer stands.',
  },
  score: {
    term: 'Score',
    means:
      'A number from 0 to 100, counted from the rules an output follows and the checks it meets. A version’s score is the average over its cases.',
  },
  missed: {
    term: 'Missed',
    means:
      'A rule from your skill that the output breaks, a check it fails, or a flaw in how it looks. Jev, the grader, decides each one, and you can overrule it.',
  },
  unsure: {
    term: 'Not sure',
    means:
      'Jev, the grader, could not tell whether the output meets it, so it is left out of the score. Mark it yourself and it counts.',
  },
  version: {
    term: 'Version',
    means:
      'A copy of the skill as it was for a run, named v0, v1 and so on. Every score stays tied to the version that produced it.',
  },
  transcript: {
    term: 'Transcript',
    means: 'Every step the agent took on one case: its messages, the tools it used and any errors.',
  },
  draft: {
    term: 'Draft',
    means: 'Text you have not saved yet. The app keeps it as you type, until you save or discard.',
  },
} as const satisfies Record<string, Term>

export type TermId = keyof typeof GLOSSARY
