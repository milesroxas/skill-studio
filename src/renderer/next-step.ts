/**
 * The one step the top bar suggests, worked out without React so it can be
 * tested. In loop order: write a case, run, compare. The practice skill's
 * walkthrough names its own step, and a running job has none.
 */

/** Where a step happens: a screen, or null for a step that is the Run button's. */
export interface StepTarget {
  /** The top bar's name for the step. */
  label: string
  screen: string | null
  params?: Record<string, string>
}

/** The one step the top bar suggests: a place to go to, or the run to start. */
export type NextStep =
  | { kind: 'go'; label: string; screen: string; params?: Record<string, string> }
  | { kind: 'run' }

/** A walkthrough step as the top bar's step: one with no screen is the Run button's. */
export const stepOf = (target: StepTarget): NextStep =>
  target.screen === null
    ? { kind: 'run' }
    : { kind: 'go', label: target.label, screen: target.screen, params: target.params }

/** How the open skill stands, as far as its next step goes. */
export interface Standing {
  /** A job of this skill is running. */
  running: boolean
  /** The walkthrough, on the practice skill: the step it points to, null once the loop is closed. */
  practice: { next: StepTarget | null } | null
  cases: number
  runs: number
  /** The files changed since the last run. */
  changed: boolean
  /** The first case whose two outputs have no pick between them, with each side's name. */
  compare: { caseId: string; a: string; b: string } | null
}

/** The step to suggest; null when the skill is not loaded, a job runs, or nothing is left to do. */
export function nextStep(standing: Standing | null): NextStep | null {
  if (!standing || standing.running) return null
  if (standing.practice) return standing.practice.next && stepOf(standing.practice.next)
  if (!standing.cases)
    return { kind: 'go', label: 'Add a case', screen: 'cases', params: { new: '1' } }
  if (standing.changed || !standing.runs) return { kind: 'run' }
  const { compare } = standing
  return compare
    ? {
        kind: 'go',
        label: `Compare ${compare.a} and ${compare.b}`,
        screen: 'results',
        params: { case: compare.caseId },
      }
    : null
}

/** The screen to show for the one an address asks for: an unknown name is home, not a blank pane. */
export const screenFor = (requested: string, home: string, known: (screen: string) => boolean) =>
  known(requested) ? requested : home
