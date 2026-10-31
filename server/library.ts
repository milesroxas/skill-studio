/**
 * The skill library: every skill on this machine, found in the folders agents
 * load skills from, at user level and inside the projects under each
 * workspace. A skill lives once in `.agents/skills/` and is installed for an
 * agent by a symlink in that agent's folder, so an edit reaches every agent.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { readFrontMatter } from '@core/text.ts'
import { loadCases } from './cases.ts'
import { isDir, isFile, listDirs, readJson, writeJson } from './fs.ts'
import { newSkill } from './skill.ts'

export const AGENTS = [
  { id: 'claude', label: 'Claude Code', dir: '.claude/skills' },
  { id: 'cursor', label: 'Cursor', dir: '.cursor/skills' },
  { id: 'codex', label: 'Codex', dir: '.codex/skills' },
] as const
export type AgentId = (typeof AGENTS)[number]['id']

/** Where new skills are written; agents get a link to it. */
const STORE = '.agents/skills'
const FOLDERS = [STORE, ...AGENTS.map((a) => a.dir)]
const SKIP = new Set(['node_modules', 'evals', 'dist', 'build', 'vendor'])

const HOME = homedir()
const SETTINGS = join(HOME, '.skill-tester', 'library.json')

interface Settings {
  /** Folders whose projects are scanned for skills. */
  workspaces: string[]
  /** Skill paths without a lock entry that are someone else's all the same. */
  others: string[]
}

export function loadSettings(): Settings {
  const fallback = existsSync(join(HOME, 'SITES')) ? [join(HOME, 'SITES')] : []
  const saved = readJson<Partial<Settings>>(SETTINGS, {})
  return { workspaces: saved.workspaces ?? fallback, others: saved.others ?? [] }
}

const saveSettings = (settings: Settings): void => writeJson(SETTINGS, settings)

export const tilde = (path: string): string =>
  path === HOME || path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path
const untilde = (path: string): string => resolve(path.replace(/^~(?=$|\/)/, HOME))

/** A place skills live: the user's home, or one project. */
export interface Place {
  /** `user`, or the project's folder. */
  scope: string
  label: string
  root: string
}

export interface Location {
  agent: AgentId | 'store'
  path: string
  /** `dir` holds the files; `link` points at them. */
  kind: 'dir' | 'link'
}

export interface LibrarySkill {
  path: string
  name: string
  description: string
  scope: string
  scopeLabel: string
  locations: Location[]
  /** Other folders in the same place with the same name: separate copies an edit will not reach. */
  copies: string[]
  /** Where an installed skill came from (a lock entry), `marked` when set by hand, else null. */
  source: string | null
  cases: number
  runs: number
  modified: string | null
}

export interface Library {
  skills: LibrarySkill[]
  places: Place[]
  workspaces: string[]
  agents: Array<{ id: AgentId; label: string }>
  store: string
}

const hasSkillFolder = (root: string): boolean => FOLDERS.some((f) => isDir(join(root, f)))

/** Projects under a workspace with a skills folder, up to three levels down. */
function projectsIn(workspace: string): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (hasSkillFolder(dir)) found.push(dir)
    if (depth === 3) return
    for (const name of listDirs(dir)) if (!SKIP.has(name)) walk(join(dir, name), depth + 1)
  }
  if (isDir(workspace)) walk(workspace, 0)
  return found
}

function placesOf(settings: Settings): Place[] {
  const places: Place[] = [{ scope: 'user', label: 'User', root: HOME }]
  for (const workspace of settings.workspaces)
    for (const root of projectsIn(workspace)) {
      if (places.some((p) => p.root === root)) continue
      const rel = relative(workspace, root)
      places.push({ scope: root, label: rel || basename(root), root })
    }
  return places
}

/** Lock entries by skill name: `~/.agents/.skill-lock.json` for the user, `skills-lock.json` in a project. */
function lockOf(place: Place): Record<string, string> {
  const file =
    place.scope === 'user'
      ? join(HOME, '.agents/.skill-lock.json')
      : join(place.root, 'skills-lock.json')
  const lock = readJson<{ skills?: Record<string, { source?: string }> }>(file, {})
  return Object.fromEntries(
    Object.entries(lock.skills ?? {}).map(([name, entry]) => [name, entry.source ?? 'installed']),
  )
}

const realOf = (path: string): string | null => {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

function describe(path: string): { name: string; description: string; modified: string | null } {
  const md = join(path, 'SKILL.md')
  const { meta } = readFrontMatter(readFileSync(md, 'utf8'))
  return {
    name: meta.name || basename(path),
    description: meta.description ?? '',
    modified: statSync(md).mtime.toISOString(),
  }
}

/** Every skill in every place, one row per folder on disk, links folded into it. */
export function scanLibrary(open: string[] = []): Library {
  const settings = loadSettings()
  const places = placesOf(settings)
  const rows = new Map<string, LibrarySkill>()
  const others = new Set(settings.others)

  const rowFor = (real: string, place: Place | null, lock: Record<string, string>) => {
    let row = rows.get(real)
    if (row) return row
    const info = describe(real)
    let cases = 0
    try {
      cases = loadCases(real).length
    } catch {
      // A case folder that does not parse still leaves the skill listed.
    }
    row = {
      path: real,
      ...info,
      scope: place?.scope ?? 'other',
      scopeLabel: place?.label ?? tilde(dirname(real)),
      locations: [],
      copies: [],
      source: lock[basename(real)] ?? (others.has(real) ? 'marked' : null),
      cases,
      runs: listDirs(join(real, 'evals', 'runs')).length,
    }
    rows.set(real, row)
    return row
  }

  for (const place of places) {
    const lock = lockOf(place)
    for (const folder of FOLDERS) {
      const dir = join(place.root, folder)
      if (!isDir(dir)) continue
      for (const name of readdirSync(dir)) {
        if (name.startsWith('.')) continue
        const path = join(dir, name)
        const real = realOf(path)
        if (!real || !isFile(join(real, 'SKILL.md'))) continue
        const link = lstatSync(path).isSymbolicLink()
        // A link's row belongs to the place its files are in, found on that pass.
        const row = rowFor(real, link ? null : place, lock)
        if (!link && row.scope === 'other') {
          row.scope = place.scope
          row.scopeLabel = place.label
          row.source = lock[name] ?? row.source
        }
        const agent = folder === STORE ? 'store' : AGENTS.find((a) => a.dir === folder)?.id
        if (agent) row.locations.push({ agent, path, kind: link ? 'link' : 'dir' })
      }
    }
  }

  for (const path of open) {
    const real = realOf(path)
    if (real && !rows.has(real)) rowFor(real, null, {})
  }

  const skills = [...rows.values()]
  for (const row of skills)
    row.copies = skills
      .filter((o) => o !== row && o.scope === row.scope && basename(o.path) === basename(row.path))
      .map((o) => o.path)
  skills.sort((a, b) => a.name.localeCompare(b.name))

  return {
    skills,
    places,
    workspaces: settings.workspaces.map(tilde),
    agents: AGENTS.map(({ id, label }) => ({ id, label })),
    store: STORE,
  }
}

const placeFor = (scope: string): Place => {
  const place = placesOf(loadSettings()).find((p) => p.scope === scope)
  if (!place) throw new Error('Unknown place.')
  return place
}

const agentDir = (agent: string): string => {
  const found = AGENTS.find((a) => a.id === agent)
  if (!found) throw new Error(`Unknown agent ${agent}.`)
  return found.dir
}

/** Install a skill for an agent: a relative symlink in the agent's folder, in that place. */
export function linkSkill(path: string, agent: string, scope: string): string {
  const real = realOf(path)
  if (!real || !isFile(join(real, 'SKILL.md'))) throw new Error('No skill there.')
  const target = join(placeFor(scope).root, agentDir(agent), basename(real))
  if (existsSync(target) || isLink(target)) throw new Error(`${tilde(target)} already exists.`)
  mkdirSync(dirname(target), { recursive: true })
  symlinkSync(relative(dirname(target), real), target)
  return target
}

const isLink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/** Uninstall: remove the agent's link. A folder that holds files is never removed. */
export function unlinkSkill(path: string, agent: string, scope: string): void {
  const target = join(placeFor(scope).root, agentDir(agent), basename(realOf(path) ?? path))
  if (!isLink(target)) throw new Error(`${tilde(target)} is not a link, so it is left alone.`)
  unlinkSync(target)
}

const NAME = /^[a-z0-9][a-z0-9-]*$/

/** A new skill in the place's `.agents/skills/`, linked for each agent picked. */
export function createSkill(input: {
  scope: string
  name: string
  description: string
  agents: string[]
}): string {
  if (!NAME.test(input.name))
    throw new Error('Use lowercase letters, digits and dashes for the name, like release-notes.')
  const place = placeFor(input.scope)
  const dir = join(place.root, STORE, input.name)
  if (existsSync(dir)) throw new Error(`${tilde(dir)} already exists.`)
  for (const agent of input.agents) {
    const target = join(place.root, agentDir(agent), input.name)
    if (existsSync(target) || isLink(target)) throw new Error(`${tilde(target)} already exists.`)
  }
  newSkill(dir, input.name, input.description)
  for (const agent of input.agents) linkSkill(dir, agent, place.scope)
  return dir
}

export function setWorkspaces(list: string[]): string[] {
  const settings = loadSettings()
  settings.workspaces = [...new Set(list.map(untilde))]
  for (const w of settings.workspaces)
    if (!isDir(w)) throw new Error(`${tilde(w)} is not a folder.`)
  saveSettings(settings)
  return settings.workspaces.map(tilde)
}

/** Mark a skill as someone else's (or yours again). */
export function markOthers(path: string, theirs: boolean): void {
  const settings = loadSettings()
  const set = new Set(settings.others)
  if (theirs) set.add(path)
  else set.delete(path)
  settings.others = [...set]
  saveSettings(settings)
}
