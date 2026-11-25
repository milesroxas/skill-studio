/**
 * The flags more than one command reads, each one's type declared once. Its
 * help line is not shared: each command says what the flag does there.
 */
import type { Flag } from './command.ts'

const SHARED = {
  model: { type: 'string' },
  effort: { type: 'string' },
  cases: { type: 'string' },
  parallel: { type: 'string' },
  name: { type: 'string' },
  run: { type: 'string' },
  all: { type: 'boolean' },
  again: { type: 'boolean' },
  deep: { type: 'boolean' },
  json: { type: 'boolean' },
  'no-jev': { type: 'boolean' },
  'jev-model': { type: 'string' },
  packs: { type: 'string' },
  bench: { type: 'string' },
} as const satisfies Record<string, Flag>

type Shared = typeof SHARED

/** The shared flags a command reads, by name. */
export function shared<K extends keyof Shared>(...names: K[]): Pick<Shared, K> {
  return Object.fromEntries(names.map((name) => [name, SHARED[name]])) as Pick<Shared, K>
}

/** The flags a grading reads, through `Context.jev` and `Context.scoring`. */
export const GRADING = ['no-jev', 'jev-model', 'packs', 'bench'] as const
