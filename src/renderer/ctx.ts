import type { BenchConfig } from '@domain/schemas.ts'
import type { Job, State } from './api.ts'
import type { Confirm } from './components/confirm.tsx'
import type { Drafts } from './drafts.ts'
import type { navigate } from './history.ts'
import type { Reporter } from './hooks.ts'
import type { Output } from './model.ts'
import type { Route } from './route.ts'

/** What every screen gets: the loaded state, the scoring in hand, the outputs and the shell's helpers. */
export interface Ctx {
  state: State
  /** The scoring as edited; equal to the saved config until Scoring, on Results, changes it. */
  config: BenchConfig
  setConfig: (config: BenchConfig) => void
  outputs: Output[]
  route: Route
  go: typeof navigate
  report: Reporter
  /** Ask before a destructive or lossy step; resolves true when the reader agrees. */
  confirm: Confirm
  reload: () => Promise<void>
  jobs: Job[]
  /** Unsaved file and case edits, stored on disk as they are typed. */
  drafts: Drafts
  /** Switch to another skill (empty: none) and show `screen` in it. */
  openSkill: (path: string, screen?: string) => void
  /** Open Run, at the top of the window: what the next run will do, and the button that starts it. */
  openRun: () => void
}
