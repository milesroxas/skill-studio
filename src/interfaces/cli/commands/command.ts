/**
 * The shape of one `st` command. Each command is a module in this folder;
 * `index.ts` lists them, and `st.ts` picks one and runs it.
 */
import type { GradeOptions } from '@application/grade.ts'
import type { Lifecycle } from '../../lifecycle.ts'

export interface Flag {
  type: 'string' | 'boolean'
  short?: string
}

export interface Command {
  /** As typed after `st`: 'run', 'compare', 'case add'. */
  name: string
  /** Its lines under "Commands" in `st --help`, its flags' lines among them, as printed. */
  help: readonly string[]
  /** The flags it reads. One that two commands read is imported from `flags.ts`, never written twice. */
  flags: Readonly<Record<string, Flag>>
  /** True when it starts agents, so `st.ts` gives it a lifecycle. */
  agents: boolean
  /** Resolves to the exit code. */
  run(context: Context): Promise<number>
}

/** What `parseArgs` read: the text of a flag that takes some, true for one that is given. */
export type Values = Readonly<Record<string, string | boolean | undefined>>

export interface Context {
  /** What followed the command's name. */
  args: readonly string[]
  /** What `parseArgs` read, over every command's flags. */
  values: Values
  lifecycle: Lifecycle | null
  /** The scoring `--packs` and `--bench` ask for, laid over the skill's `bench.json`: `report` and `compare`. */
  scoring: Pick<GradeOptions, 'packs' | 'config'>
  /** How a grading asks Jev, from the same flags and `--no-jev` and `--jev-model`: `run`, `grade` and `self-test`. */
  jev: GradeOptions
}

/** `values` as a command reads them: each of its flags as text or as on, by the type it declares. */
export type FlagValues<F extends Readonly<Record<string, Flag>>> = {
  readonly [K in keyof F]?: F[K]['type'] extends 'boolean' ? boolean : string
}
