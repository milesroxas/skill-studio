/**
 * What each screen is for, in words for someone who has never tested a skill.
 * One entry serves three places: the sidebar's tooltip, the hint under the top
 * bar on a first visit and the help button's panel. So the app explains a
 * screen the same way wherever it explains it.
 */
import type { TermId } from '@domain/glossary.ts'

export interface ScreenHelp {
  /** A few words, for a tooltip: what is there. */
  short: string
  /** One or two sentences: what the screen is for and what to do on it. */
  what: string
  /** The app's own words this screen uses, most important first. */
  terms: readonly TermId[]
  /** The guide section that covers it, by the id of its heading. */
  guide: string
}

export const SCREEN_HELP: Record<string, ScreenHelp> = {
  library: {
    short: 'Every skill on this computer',
    what: 'Every skill on this computer. Open one to work on it, or start a new one.',
    terms: ['skill', 'agent', 'case', 'run'],
    guide: '1-open-or-create-a-skill',
  },
  editor: {
    short: 'The skill’s instructions and versions',
    what: 'The skill itself: the instructions the agent reads. Each numbered bullet is one rule Jev checks. Every run keeps the version it tested, listed on the left.',
    terms: ['skill', 'rule', 'version', 'draft'],
    guide: '2-write-the-skill',
  },
  cases: {
    short: 'The tasks that test the skill',
    what: 'The tasks that test the skill. A case is a request to the agent. Start with the prompt alone: its checks can come once you have read what the agent wrote.',
    terms: ['case', 'check', 'agent'],
    guide: '3-write-cases',
  },
  results: {
    short: 'Each version’s output, side by side',
    what: 'What the agent wrote for each case, the latest version beside the one before. Read both and pick the better: a page or a picture shows as a browser draws it, and A and B flip between them. Under each, what it missed names the rule or check to change.',
    terms: ['output', 'score', 'missed', 'pick', 'jev'],
    guide: '5-compare-the-results',
  },
  settings: {
    short: 'Appearance, the assistant and keys',
    what: 'How the app looks, the model the assistant writes with, and the keys that connect it to Jev.',
    terms: ['jev'],
    guide: 'start-the-app',
  },
}

export interface LoopStep {
  /** Where the step happens: a screen of the loop, or `run`, which is the Run button's and no screen. */
  at: 'editor' | 'run' | 'results'
  title: string
  /** What happens, in one or two plain sentences. */
  say: string
}

/**
 * Once round the loop, as the welcome tour tells it: write, run, compare.
 * Writing and comparing each have a screen. The run has a button.
 */
export const LOOP_STEPS: readonly LoopStep[] = [
  {
    at: 'editor',
    title: 'Write the rules',
    say: 'A skill is a short page of rules for an AI agent. This one writes thank-you notes.',
  },
  {
    at: 'run',
    title: 'Run it on a real task',
    say: 'A case is a request you might really make. An agent does it with your skill installed, and Jev marks what it wrote against your rules and the case’s checks.',
  },
  {
    at: 'results',
    title: 'Compare, then fix',
    say: 'What the note missed names the rule to tighten. Run again, read both notes side by side and pick the better. That is the loop.',
  },
]

export type SetupId = 'folders' | 'assistant' | 'jev'

export interface SetupStep {
  id: SetupId
  title: string
  /** What the step is for, in one or two plain sentences. Its controls say the rest. */
  say: string
}

/**
 * What the welcome sets up after the tour, one thing per step. Each checks
 * what the app can already reach before it asks for anything.
 */
export const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: 'folders',
    title: 'Find your skills',
    say: 'Skill Studio reads the skills you already have. Add the folders your projects live in to find theirs too.',
  },
  {
    id: 'assistant',
    title: 'Connect a model',
    say: 'A model writes rules and checks with you.',
  },
  {
    id: 'jev',
    title: 'Add Jev',
    say: 'Jev grades every output the same way each time. It needs a TypeSafe key.',
  },
]
