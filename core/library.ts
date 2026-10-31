/**
 * The skill library: every skill on a machine, in the folders agents load
 * skills from. A skill lives once in a place's store and is installed for an
 * agent by a link in that agent's folder, so one edit reaches every agent.
 */

export const STORE_DIR = '.agents/skills'

export const AGENTS = [
  { id: 'claude', label: 'Claude Code', dir: '.claude/skills' },
  { id: 'cursor', label: 'Cursor', dir: '.cursor/skills' },
  { id: 'codex', label: 'Codex', dir: '.codex/skills' },
] as const

export type AgentId = (typeof AGENTS)[number]['id']
export type Holder = AgentId | 'store'

/** Which folder is edited when a place holds a skill in several: the store, then agents in order. */
export const HOLDER_RANK: Holder[] = ['store', ...AGENTS.map((a) => a.id)]

/**
 * How an agent has a skill: `here` (its folder holds the files), `link` (it
 * links to them), `copy` (a separate folder an edit does not reach), or null.
 */
export type Install = 'here' | 'link' | 'copy' | null

/** The user's home (`scope: 'user'`) or one project, keyed by its folder. */
export interface Place {
  scope: string
  label: string
  root: string
}

export interface LibrarySkill {
  /** The folder edits go to. */
  path: string
  name: string
  description: string
  scope: string
  scopeLabel: string
  installs: Record<AgentId, Install>
  /** Other folders in the same place holding a skill of this name. */
  copies: string[]
  /** A lock file's source for an installed skill, `marked` when set by hand, else null. */
  source: string | null
  cases: number
  runs: number
  modified: string
  recent: boolean
  open: boolean
}

export interface Library {
  skills: LibrarySkill[]
  places: Place[]
  workspaces: string[]
}

/** True for a skill someone else wrote, as far as the library can tell. */
export const isInstalled = (skill: LibrarySkill): boolean => skill.source !== null

/** True for a skill being worked on: it has evals, or was opened here. */
export const isInProgress = (skill: LibrarySkill): boolean =>
  skill.cases > 0 || skill.runs > 0 || skill.recent
