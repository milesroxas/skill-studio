/**
 * The practice skill's guide: which step of the loop the reader is on, what it
 * asks of them and where it happens. Worked out from the skill's own runs,
 * ratings and versions every time, so it never disagrees with what is on disk
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
import { type Output, plural } from './model.ts'

export interface PracticeTarget {
  /** The top bar's name for the step. */
  label: string
  screen: string
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
  const graded = outputs.filter((o) => o.result && versionOf(o) === first)
  const rated = graded.filter((o) => state.reviews.reviews[o.key]).length
  const current = state.versions.current
  const { done, step } = practiceProgress({
    versions,
    saved: state.versions.versions.filter((v) => v.saved).length,
    current: current.version,
    changed: current.changed,
    graded: graded.length,
    rated,
    votes: state.reviews.preferences.filter((p) => p.by === 'human').length,
    seen: state.practiceSeen,
  })
  const before = graded[0] ?? outputs.find((o) => versionOf(o) === first)
  const after = outputs.find((o) => versionOf(o) === last && o.caseId === before?.caseId)

  const copy: Record<PracticeStep, { title: string; hint: string; target: PracticeTarget }> = {
    read: {
      title: 'Read the skill',
      hint: 'Thank-you note writes a two-sentence thank-you. Its SKILL.md is what the agent reads first, and the judge grades each of its rules.',
      target: { label: 'Read the skill', screen: 'editor' },
    },
    version: {
      title: `Save it as ${current.version}`,
      hint: 'A version keeps a copy of the files, so every score points at the text behind it.',
      target: { label: `Save ${current.version}`, screen: 'versions' },
    },
    cases: {
      title: 'Read the cases',
      hint: 'Three tasks the agent gets. Each says what a good note does, and checks it.',
      target: { label: 'Read the cases', screen: 'cases' },
    },
    run: {
      title: 'Run the skill',
      hint: 'An agent writes a note for each case, then the judge grades it.',
      target: { label: `Run ${current.version}`, screen: 'generate' },
    },
    results: {
      title: 'Read the scores',
      hint: 'A score per case, from the judge. Click one to see what it marked down.',
      target: { label: 'Read the scores', screen: 'overview' },
    },
    rate: {
      title: 'Rate the notes',
      hint: 'Score each note before you see the judge’s score.',
      target: {
        label: `Rate ${plural(Math.max(1, graded.length - rated), 'output')}`,
        screen: 'blind',
      },
    },
    agreement: {
      title: 'Check the judge',
      hint: 'Your ratings against the judge’s. Where you both mark notes bad, the skill needs the change.',
      target: { label: 'Check the judge', screen: 'insights' },
    },
    scoring: {
      title: 'See how a score adds up',
      hint: 'Each layer is worth points. Move a weight and every score updates, with no new judge calls.',
      target: { label: 'See the scoring', screen: 'knobs' },
    },
    edit: {
      title: 'Tighten one rule',
      hint: now.unsaved
        ? 'Save SKILL.md, then save the files as a new version.'
        : `“${PRACTICE_EDIT.phrase}” measures nothing. Give it a number.`,
      target: { label: 'Tighten a rule', screen: 'editor' },
    },
    save: {
      title: `Save your edit as ${current.version}`,
      hint: 'Name what changed, so the version is easy to find later.',
      target: { label: `Save ${current.version}`, screen: 'versions' },
    },
    rerun: {
      title: 'Run it again',
      hint: 'Same cases, new rule: any difference is your edit.',
      target: { label: `Run ${current.version}`, screen: 'generate' },
    },
    compare: {
      title: 'Compare the versions',
      hint: `Read ${first} beside ${last}, then vote for the better note.`,
      target: {
        label: `Compare ${first} and ${last}`,
        screen: 'compare',
        params: before && after ? { a: before.key, b: after.key } : undefined,
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
      hint: 'Results shows what your edit gained. A skill of your own goes round the same way.',
      target: null,
    }
  return {
    steps,
    step,
    number: PRACTICE_STEPS.indexOf(step) + 1,
    title: copy[step].title,
    hint: now.running ? 'A run is in progress. It takes a minute or two.' : copy[step].hint,
    target: now.running
      ? { ...copy[step].target, screen: 'generate', params: undefined }
      : copy[step].target,
  }
}

/**
 * Open the practice skill, written with its cases the first time it is asked
 * for. The library and the welcome screen both offer it.
 */
export function useStartPractice(
  openSkill: (path: string) => void,
  toast: (message: string) => void,
): [starting: boolean, start: () => Promise<void>] {
  const [starting, setStarting] = useState(false)
  const start = async () => {
    setStarting(true)
    try {
      const skill = await api.practice()
      openSkill(skill.path)
    } catch (e) {
      toast((e as Error).message)
    }
    setStarting(false)
  }
  return [starting, start]
}

/**
 * Put the practice skill back as it was first written, once the reader agrees:
 * its runs, ratings, votes, versions and drafts go, so the guide is back at its
 * first step. `done` reloads the skill and goes to that step.
 */
export function useRestartPractice(
  confirm: Confirm,
  discardDrafts: () => void,
  done: () => Promise<void>,
  toast: (message: string) => void,
): [restarting: boolean, restart: () => Promise<void>] {
  const [restarting, setRestarting] = useState(false)
  const restart = async () => {
    const ok = await confirm({
      title: 'Restart the walkthrough?',
      description:
        'Thank-you note goes back to how it was written, and the walkthrough to its first step. Its runs, ratings, votes, versions and unsaved edits are deleted. Your own skills are not touched.',
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
      toast((e as Error).message)
    }
    setRestarting(false)
  }
  return [restarting, restart]
}
