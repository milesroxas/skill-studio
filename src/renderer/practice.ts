/**
 * The practice skill's guide: which step of the loop the reader is on, what it
 * asks of them and where it happens. Worked out from the skill's own runs and
 * versions, and the screens the reader opened, every time, so it never disagrees with what is on disk
 * and there is no progress to store or reset.
 */
import {
  isLookStep,
  type LookStep,
  PRACTICE_EDIT,
  PRACTICE_STEPS,
  type PracticeProgress,
  type PracticeStep,
  practiceProgress,
  practiceView,
} from '@domain/practice.ts'
import { useState } from 'react'
import { api, type State } from './api.ts'
import type { Confirm } from './components/confirm.tsx'
import type { Reporter } from './hooks.ts'
import type { Output } from './model.ts'
import { atTarget } from './next-step.ts'

export interface PracticeTarget {
  /** The top bar's name for the step. */
  label: string
  /** The screen the step happens on; null for a step that is the Run button's. */
  screen: string | null
  params?: Record<string, string>
}

export interface PracticeGuide {
  /** Every step in loop order, and whether it is done. The step in hand never is. */
  steps: Array<{ id: PracticeStep; done: boolean }>
  /** The step in hand; null once the loop is closed. */
  step: PracticeStep | null
  /** The step in hand, counted from one; null once the loop is closed. */
  number: number | null
  title: string
  hint: string
  /** Where the step happens; null once the loop is closed. */
  target: PracticeTarget | null
  /** The reader is where the step happens: the guide has nowhere to take them. */
  here: boolean
  /**
   * Where the top bar points: where the step happens, or where the step after
   * it does while the reader is on the screen this one asks them to look at.
   * Null once the loop is closed.
   */
  next: PracticeTarget | null
}

/** Where each step happens: a screen, or null for a step that is the Run button's. */
const SCREEN: Record<PracticeStep, string | null> = {
  read: 'editor',
  cases: 'cases',
  run: null,
  results: 'results',
  edit: 'editor',
  rerun: null,
  compare: 'results',
}

/** How far the walkthrough has come, as the skill's own files say. */
export interface PracticeWalk {
  /** Skill versions that have outputs, oldest first. */
  versions: string[]
  progress: PracticeProgress
}

const versionOf = (output: Output): string => output.run.meta?.skillVersion ?? ''

export function practiceWalk(state: State, outputs: Output[]): PracticeWalk {
  const versions = [...new Set(outputs.map(versionOf).filter(Boolean))].sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  )
  const progress = practiceProgress({
    versions,
    current: state.versions.current.version,
    seen: state.practiceSeen,
  })
  return { versions, progress }
}

/**
 * The screen the practice skill opens on: where its next step happens, so the
 * first thing in view is the one thing to do. A step that is the Run button's
 * has no screen of its own, and opens on Results.
 */
export const practiceHome = ({ progress }: PracticeWalk): string =>
  progress.step ? (SCREEN[progress.step] ?? 'results') : 'editor'

export function practiceGuide(
  state: State,
  outputs: Output[],
  { versions, progress }: PracticeWalk,
  now: {
    /** The screen in view. */
    screen: string
    /** Its address, such as the case Results has open. */
    params: URLSearchParams
    /** The look step this visit to the screen marked done, which the reader is still reading. */
    reading: LookStep | null
    /** SKILL.md has an edit that is not saved yet. */
    unsaved: boolean
    /** A run or a grading job is in progress. */
    running: boolean
  },
): PracticeGuide {
  const first = versions[0]
  const last = versions.at(-1)
  const current = state.versions.current
  const { done } = progress
  // The case to open on: the first one both versions answered.
  const compared = state.cases.find((c) =>
    [first, last].every((v) => outputs.some((o) => o.caseId === c.id && versionOf(o) === v)),
  )

  const copy: Record<PracticeStep, { title: string; hint: string; target: PracticeTarget }> = {
    read: {
      title: 'Read the skill',
      hint: 'Read its rules. The yellow button at the top right is the way on.',
      target: { label: 'Read the skill', screen: SCREEN.read },
    },
    cases: {
      title: 'Read the cases',
      hint: 'Three tasks the agent gets. Each says what a good note does, and checks it.',
      target: { label: 'Read the cases', screen: SCREEN.cases },
    },
    run: {
      title: 'Run the skill',
      hint: 'An agent writes a note for each case, then Jev grades it. Click Run at the top right.',
      target: { label: `Run ${current.version}`, screen: SCREEN.run },
    },
    results: {
      title: 'Read what the notes missed',
      hint: 'Each note with its score, and under it the rules and checks it missed.',
      target: { label: 'Read the results', screen: SCREEN.results },
    },
    edit: {
      title: 'Tighten one rule',
      hint: now.unsaved
        ? 'Save SKILL.md, so the next run tests your edit.'
        : `“${PRACTICE_EDIT.phrase}” measures nothing. Give it a number.`,
      target: { label: 'Tighten a rule', screen: SCREEN.edit },
    },
    rerun: {
      title: 'Run it again',
      hint: 'Same cases, new rule: any difference is your edit. Click Run at the top right.',
      target: { label: `Run ${current.version}`, screen: SCREEN.run },
    },
    compare: {
      title: 'Compare the two notes',
      hint: `Read ${first} beside ${last}, and see what your one edit changed.`,
      target: {
        label: `Compare ${first} and ${last}`,
        screen: SCREEN.compare,
        params: compared ? { case: compared.id } : undefined,
      },
    },
  }

  /** The reader is where `target` happens: a step that opens one case is not there on another. */
  const at = (target: PracticeTarget) => atTarget(target, now.screen, now.params)
  const inHand = progress.step
  // A run in progress is the step in hand, whatever screen it is watched from. A look step
  // marked on this visit is read until the reader leaves where it happens.
  const looking = now.running
    ? null
    : inHand && isLookStep(inHand) && at(copy[inHand].target)
      ? inHand
      : now.reading && at(copy[now.reading].target)
        ? now.reading
        : null
  const view = practiceView(progress, looking)
  const step = view.shown

  // The step in hand is still to do, though opening its screen has marked it.
  const steps = PRACTICE_STEPS.map((id) => ({ id, done: done[id] && id !== step }))
  if (!step)
    return {
      steps,
      step: null,
      number: null,
      title: 'You have been round the loop',
      hint: 'Write, run, compare. A skill of your own goes round the same way.',
      target: null,
      here: false,
      next: null,
    }
  const { target } = copy[step]
  return {
    steps,
    step,
    number: PRACTICE_STEPS.indexOf(step) + 1,
    title: copy[step].title,
    hint: now.running ? 'A run is in progress. It takes a minute or two.' : copy[step].hint,
    target,
    here: at(target),
    next: view.next ? copy[view.next].target : null,
  }
}

/**
 * Open the practice skill, written with its cases the first time it is asked
 * for. The library and the welcome screen both offer it.
 */
export function useStartPractice(
  openSkill: (path: string) => void,
  report: Reporter,
): [starting: boolean, start: () => Promise<void>] {
  const [starting, setStarting] = useState(false)
  const start = async () => {
    setStarting(true)
    try {
      const skill = await api.practice()
      openSkill(skill.path)
    } catch (e) {
      report(e as Error)
    }
    setStarting(false)
  }
  return [starting, start]
}

/**
 * Put the practice skill back as it was first written, once the reader agrees:
 * its runs, corrections, versions and drafts go, so the guide is back at its
 * first step. `done` reloads the skill and goes to that step.
 */
export function useRestartPractice(
  confirm: Confirm,
  discardDrafts: () => void,
  done: () => Promise<void>,
  report: Reporter,
): [restarting: boolean, restart: () => Promise<void>] {
  const [restarting, setRestarting] = useState(false)
  const restart = async () => {
    const ok = await confirm({
      title: 'Restart the walkthrough?',
      description:
        'Thank-you note goes back to how it was written, and the walkthrough to its first step. Its runs, corrections, versions and unsaved edits are deleted. Your own skills are not touched.',
      action: 'Restart',
      destructive: true,
    })
    if (!ok) return
    setRestarting(true)
    try {
      discardDrafts()
      await api.restartPractice()
      await done()
    } catch (e) {
      report(e as Error)
    }
    setRestarting(false)
  }
  return [restarting, restart]
}
