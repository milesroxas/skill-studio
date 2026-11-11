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
  /** The lock file's source for a skill a tool installed, else null. An update from there replaces its folder. */
  source: string | null
  /** Marked done and not worked on since: it leaves In progress until the next edit, case or run. */
  done: boolean
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

/**
 * The scope of the practice skill. It lives in the app's own folder, outside
 * every place agents load skills from, so practising never changes what an
 * agent does.
 */
export const PRACTICE_SCOPE = 'practice'

export const isPractice = (skill: LibrarySkill): boolean => skill.scope === PRACTICE_SCOPE

/** True for a skill being worked on: it has evals, or was opened here, and is not marked done. */
export const isInProgress = (skill: LibrarySkill): boolean =>
  !skill.done && (skill.cases > 0 || skill.runs > 0 || skill.recent)
