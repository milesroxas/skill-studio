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
      'One instruction in a skill, written as a bullet. The judge checks every answer against every rule.',
  },
  agent: {
    term: 'Agent',
    means:
      'The AI that does the task, such as Claude Code or Cursor. It is the one being tested, with your skill installed.',
  },
  case: {
    term: 'Case',
    means: 'One task that tests the skill: a request to the agent, plus what a good answer does.',
  },
  check: {
    term: 'Check',
    means:
      'One fact a good answer makes true, such as “The note mentions the wedding.” The judge marks each check yes or no.',
  },
  run: {
    term: 'Run',
    means: 'One round of testing: an agent does every case you picked, and the judge scores it.',
  },
  output: {
    term: 'Output',
    means: 'What the agent wrote for one case in one run. Its answer.',
  },
  writer: {
    term: 'Writer',
    means: 'The agent and model that write the outputs of a run.',
  },
  sample: {
    term: 'Sample',
    means:
      'One attempt at a case. Agents vary from one attempt to the next, so two or more samples show whether a result was luck.',
  },
  judge: {
    term: 'Judge',
    means:
      'Jev, an AI model that scores every output the same way, against your rules and your checks.',
  },
  score: {
    term: 'Score',
    means:
      'A number from 0 to 100 for one output. The mean is the average over a run or a version.',
  },
  layer: {
    term: 'Layer',
    means:
      'One part of a score, such as how well the rules were followed or how many checks passed.',
  },
  flag: {
    term: 'Flag',
    means: 'One thing the judge found wrong in an output, such as a rule that was not followed.',
  },
  pack: {
    term: 'Pack',
    means: 'A set of judge questions for one kind of work: writing, code, workflow or design.',
  },
  blind: {
    term: 'Rate blind',
    means:
      'To rate an output yourself before you see the judge’s score, so the score cannot sway you.',
  },
  agreement: {
    term: 'Agreement',
    means:
      'How often you and the judge reach the same verdict. Where you differ shows what to fix.',
  },
  scoring: {
    term: 'Scoring',
    means:
      'The settings that turn the judge’s answers into scores. Changing them rescores at once, with nothing run again.',
  },
  version: {
    term: 'Version',
    means:
      'A saved copy of the skill, named v0, v1 and so on. Every score stays tied to the version that produced it.',
  },
  anchor: {
    term: 'Anchor',
    means:
      'An output you labelled good or bad, kept as a test that the judge ranks it the way you do.',
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
