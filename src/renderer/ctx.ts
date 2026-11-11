import type { BenchConfig } from '@domain/schemas.ts'
import type { Job, State } from './api.ts'
import type { Confirm } from './components/confirm.tsx'
import type { Drafts } from './drafts.ts'
import type { navigate } from './history.ts'
import type { Reporter } from './hooks.ts'
import type { Output } from './model.ts'
import type { Route } from './route.ts'
import type { SavedFiles } from './skill-state.ts'

/** What every screen gets: the loaded state, its scoring, the outputs and the shell's helpers. */
export interface Ctx {
  state: State
  /** The skill's scoring: what `bench.json` says, over the defaults. */
  config: BenchConfig
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
  /** The skill's files as saved, read once for every screen and the side panel; a save updates it at once. */
  files: SavedFiles
  /** Switch to another skill (empty: none) and show `screen` in it. False when the reader chose to stay. */
  openSkill: (path: string, screen?: string) => Promise<boolean>
  /** Open Run, at the top of the window: what the next run will do, and the button that starts it. */
  openRun: () => void
}
