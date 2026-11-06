/**
 * What each screen is for, in words for someone who has never tested a skill.
 * One entry serves four places: the sidebar's tooltip, the hint under the top
 * bar on a first visit, the help button's panel and the welcome tour. So the
 * app explains a screen the same way wherever it explains it.
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
    what: 'Every skill on this computer. Open one to test it, or start a new one.',
    terms: ['skill', 'agent', 'case', 'run'],
    guide: '1-open-or-create-a-skill',
  },
  editor: {
    short: 'The skill’s instructions',
    what: 'The skill itself: the instructions the agent reads. Each bullet under Rules is one rule the judge checks.',
    terms: ['skill', 'rule', 'draft'],
    guide: '2-write-the-skill',
  },
  versions: {
    short: 'Saved copies of the skill',
    what: 'Saved copies of the skill. Save one before a run, so each score stays tied to the text that produced it.',
    terms: ['version', 'run'],
    guide: '2-write-the-skill',
  },
  cases: {
    short: 'The tasks that test the skill',
    what: 'The tasks that test the skill. Each case is a request to the agent, plus the checks a good answer passes.',
    terms: ['case', 'check', 'agent'],
    guide: '3-write-cases',
  },
  generate: {
    short: 'Have an agent do the cases',
    what: 'Start a run: an agent does each case with the skill installed, then the judge scores what it wrote.',
    terms: ['run', 'writer', 'sample', 'version'],
    guide: '4-run-the-agents',
  },
  overview: {
    short: 'The judge’s scores for each run',
    what: 'The judge’s scores, one row per run. Click a score to read that output and see what the judge found.',
    terms: ['output', 'judge', 'score', 'layer', 'flag'],
    guide: '5-read-the-results',
  },
  blind: {
    short: 'Rate outputs before you see their scores',
    what: 'Your turn to judge. Rate each output before its score is shown, so the judge’s opinion cannot sway yours.',
    terms: ['blind', 'output', 'layer', 'anchor'],
    guide: '6-rate-answers-blind',
  },
  compare: {
    short: 'Two outputs side by side',
    what: 'Two outputs side by side. Pick the better one: choosing between two is easier, and more reliable, than scoring one.',
    terms: ['output', 'version', 'judge'],
    guide: '6-rate-answers-blind',
  },
  transcript: {
    short: 'Each step an agent took',
    what: 'Every step the agent took on one case. Read it when a score surprises you.',
    terms: ['transcript', 'agent', 'sample'],
    guide: '6-rate-answers-blind',
  },
  insights: {
    short: 'Where you and the judge differ',
    what: 'Your ratings beside the judge’s. Where you both find an output poor, change the skill. Where you differ, tune the scoring.',
    terms: ['agreement', 'layer', 'anchor'],
    guide: '7-check-the-judge-against-you',
  },
  knobs: {
    short: 'Tune how the judge scores',
    what: 'How the judge’s answers become scores. Move a setting and every output rescores at once; nothing is run again.',
    terms: ['scoring', 'pack', 'layer'],
    guide: '8-tune-the-scoring',
  },
  settings: {
    short: 'Appearance, the assistant and keys',
    what: 'How the app looks, the model the assistant writes with, and the keys that connect it to the judge.',
    terms: ['judge'],
    guide: 'start-the-app',
  },
}

export interface LoopStep {
  /** The screen the step happens on. */
  screen: string
  title: string
  /** What happens, in one or two plain sentences. */
  say: string
}

/** Once round the loop, as the welcome tour tells it: one screen per step, in sidebar order. */
export const LOOP_STEPS: readonly LoopStep[] = [
  {
    screen: 'editor',
    title: 'Write the rules',
    say: 'A skill is a short page of rules for an AI agent. This one writes thank-you notes.',
  },
  {
    screen: 'cases',
    title: 'Give it tasks',
    say: 'A case is a request you might really make, plus the checks a good answer passes.',
  },
  {
    screen: 'generate',
    title: 'Run an agent',
    say: 'An agent does each task with your skill installed. A run takes a minute or two.',
  },
  {
    screen: 'overview',
    title: 'Read the judge’s scores',
    say: 'A judge marks every check, the same way each time, and gives the answer a score out of 100.',
  },
  {
    screen: 'blind',
    title: 'Rate it yourself',
    say: 'You rate the same answer before you see its score, so the judge cannot sway you.',
  },
  {
    screen: 'insights',
    title: 'Fix what you both found',
    say: 'Where you and the judge agree an answer falls short, tighten the rule and run again. That is the loop.',
  },
]

export type SetupId = 'folders' | 'assistant' | 'jev'

export interface SetupStep {
  id: SetupId
  title: string
  /** What the step is for, in one or two plain sentences. */
  say: string
  /** Where the same setting waits for whoever leaves it for later. */
  later: string
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
    later: 'The Library keeps this list for later.',
  },
  {
    id: 'assistant',
    title: 'Connect a model',
    say: 'A model writes rules and checks with you. Skill Studio looks for one you can already use.',
    later: 'Settings keeps this for later.',
  },
  {
    id: 'jev',
    title: 'Add the judge',
    say: 'Jev scores every answer the same way each time. It needs a TypeSafe key.',
    later: 'Settings keeps this for later.',
  },
]
