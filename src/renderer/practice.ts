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
  const current = state.versions.current.version
  const { done, step } = practiceProgress({
    versions,
    current,
    graded: graded.length,
    rated,
    votes: state.reviews.preferences.filter((p) => p.by === 'human').length,
  })
  const before = graded[0] ?? outputs.find((o) => versionOf(o) === first)
  const after = outputs.find((o) => versionOf(o) === last && o.caseId === before?.caseId)

  const copy: Record<PracticeStep, { title: string; hint: string; target: PracticeTarget }> = {
    run: {
      title: 'Run the skill',
      hint: 'Three cases are ready. An agent writes a note for each.',
      target: { label: `Run ${current}`, screen: 'generate' },
    },
    rate: {
      title: 'Rate the notes',
      hint: 'Score each note before you see the judge’s score.',
      target: {
        label: `Rate ${plural(Math.max(1, graded.length - rated), 'output')}`,
        screen: 'blind',
      },
    },
    edit: {
      title: 'Tighten one rule',
      hint: now.unsaved
        ? 'Save SKILL.md. The saved files become a new version.'
        : `“${PRACTICE_EDIT.phrase}” measures nothing. Give it a number.`,
      target: { label: 'Tighten a rule', screen: 'editor' },
    },
    rerun: {
      title: 'Run it again',
      hint: 'Same cases, new rule: any difference is your edit.',
      target: { label: `Run ${current}`, screen: 'generate' },
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
      number: null,
      title: 'You have been round the loop',
      hint: 'A skill of your own goes round the same way.',
      target: null,
    }
  return {
    steps,
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
