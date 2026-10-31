import type { BenchConfig } from '@core/schemas.ts'
import type { Job, State } from './api.ts'
import type { Route } from './hooks.ts'
import type { Output } from './model.ts'

/** What every screen gets: the loaded state, the live knobs, the outputs and the shell's helpers. */
export interface Ctx {
  state: State
  /** The knobs as edited; equal to the saved config until Knobs changes them. */
  config: BenchConfig
  setConfig: (config: BenchConfig) => void
  outputs: Output[]
  route: Route
  go: (screen: string, params?: Record<string, string>) => void
  toast: (message: string) => void
  reload: () => Promise<void>
  jobs: Job[]
  /** Switch to another skill (empty: none) and show `screen` in it. */
  openSkill: (path: string, screen?: string) => void
}
