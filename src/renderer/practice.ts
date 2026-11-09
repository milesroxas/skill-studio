/**
 * The practice skill's guide: which step of the loop the reader is on, what it
 * asks of them and where it happens. Worked out from the skill's own runs,
 * picks and versions every time, so it never disagrees with what is on disk
 * and there is no progress to store or reset.
 */
import {
  PRACTICE_EDIT,
  PRACTICE_STEPS,
  type PracticeStep,
  practiceProgress,
} from '@domain/practice.ts'
import { useState } from 'react'
import { api, type State } from './api.ts'
import type { Confirm } from './components/confirm.tsx'
import type { Reporter } from './hooks.ts'
import type { Output } from './model.ts'

export interface PracticeTarget {
  /** The top bar's name for the step. */
  label: string
  /** The screen the step happens on; null for a step that is the Run button's. */
  screen: string | null
  params?: Record<string, string>
}

export interface PracticeGuide {
  /** Every step in loop order, and whether it is done. */
  steps: Array<{ id: PracticeStep; done: boolean }>
  /** The step in hand; null once the loop is closed. */
  step: PracticeStep | null
  /** The step in hand, counted from one; null once the loop is closed. */
  number: number | null
  title: string
  hint: string
  /** Where the step happens; null once the loop is closed. */
  target: PracticeTarget | null
}

const versionOf = (output: Output): string => output.run.meta?.skillVersion ?? ''

export function practiceGuide(
  state: State,
  outputs: Output[],
  now: {
    /** SKILL.md has an edit that is not saved yet. */
    unsaved: boolean
    /** A run or a grading job is in progress. */
    running: boolean
  },
): PracticeGuide {
  const versions = [...new Set(outputs.map(versionOf).filter(Boolean))].sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  )
  const first = versions[0]
  const last = versions.at(-1)
  const current = state.versions.current
  const { done, step } = practiceProgress({
    versions,
    current: current.version,
    picks: state.reviews.preferences.length,
    seen: state.practiceSeen,
  })
  // The case to open on: the first one both versions answered.
  const compared = state.cases.find((c) =>
    [first, last].every((v) => outputs.some((o) => o.caseId === c.id && versionOf(o) === v)),
  )

  const copy: Record<PracticeStep, { title: string; hint: string; target: PracticeTarget }> = {
    read: {
      title: 'Read the skill',
      hint: 'Thank-you note writes a two-sentence thank-you. Its SKILL.md is what the agent reads first, and Jev checks each of its rules.',
      target: { label: 'Read the skill', screen: 'editor' },
    },
    cases: {
      title: 'Read the cases',
      hint: 'Three tasks the agent gets. Each says what a good note does, and checks it.',
      target: { label: 'Read the cases', screen: 'cases' },
    },
    run: {
      title: 'Run the skill',
      hint: 'An agent writes a note for each case, then Jev grades it. Click Run at the top right.',
      target: { label: `Run ${current.version}`, screen: null },
    },
    results: {
      title: 'Read what the notes missed',
      hint: 'Each note with its score, and under it the rules and checks it missed.',
      target: { label: 'Read the results', screen: 'results' },
    },
    edit: {
      title: 'Tighten one rule',
      hint: now.unsaved
        ? 'Save SKILL.md, so the next run tests your edit.'
        : `“${PRACTICE_EDIT.phrase}” measures nothing. Give it a number.`,
      target: { label: 'Tighten a rule', screen: 'editor' },
    },
    rerun: {
      title: 'Run it again',
      hint: 'Same cases, new rule: any difference is your edit. Click Run at the top right.',
      target: { label: `Run ${current.version}`, screen: null },
    },
    compare: {
      title: 'Pick the better note',
      hint: `Read ${first} beside ${last}, then say which is better.`,
      target: {
        label: `Compare ${first} and ${last}`,
        screen: 'results',
        params: compared ? { case: compared.id } : undefined,
      },
    },
  }

  const steps = PRACTICE_STEPS.map((id) => ({ id, done: done[id] }))
  if (!step)
    return {
      steps,
      step: null,
      number: null,
      title: 'You have been round the loop',
      hint: 'Write, run, compare. A skill of your own goes round the same way.',
      target: null,
    }
  return {
    steps,
    step,
    number: PRACTICE_STEPS.indexOf(step) + 1,
    title: copy[step].title,
    hint: now.running ? 'A run is in progress. It takes a minute or two.' : copy[step].hint,
    target: copy[step].target,
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
 * its runs, corrections, picks, versions and drafts go, so the guide is back at its
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
        'Thank-you note goes back to how it was written, and the walkthrough to its first step. Its runs, picks, versions and unsaved edits are deleted. Your own skills are not touched.',
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
