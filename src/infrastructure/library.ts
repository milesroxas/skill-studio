/** The library on disk: finds skills in every place, and installs them for agents by links. */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import {
  AGENTS,
  type AgentId,
  HOLDER_RANK,
  type Holder,
  type Install,
  type Library,
  type LibrarySkill,
  type Place,
  PRACTICE_SCOPE,
  STORE_DIR,
} from '@domain/library.ts'
import { isLookStep, type LookStep, PRACTICE } from '@domain/practice.ts'
import { templateById } from '@domain/templates.ts'
import { isSlug, metaText, readFrontMatter, SLUG_RULE } from '@domain/text.ts'
import { loadCases, saveCase } from './cases.ts'
import { isDir, isFile, listDirs, readJson, writeJson } from './fs.ts'
import { newSkill } from './skill.ts'

const HOLDERS: Array<{ holder: Holder; dir: string }> = [
  { holder: 'store', dir: STORE_DIR },
  ...AGENTS.map((a) => ({ holder: a.id, dir: a.dir })),
]
const SKIP = new Set(['node_modules', 'evals', 'dist', 'build', 'vendor'])
const PROJECT_DEPTH = 3
const MAX_RECENT = 24

/** SKILL_STUDIO_HOME stands in for the home folder, so tests never touch the real one. */
const HOME = process.env.SKILL_STUDIO_HOME || homedir()
/** The app's own folder: settings and drafts. */
export const STUDIO_DIR = join(HOME, '.skill-studio')
const SETTINGS = join(STUDIO_DIR, 'library.json')
/** Where the tool kept its settings before it was Skill Studio; read once, then left alone. */
export const OLD_SETTINGS = join(HOME, '.skill-tester', 'library.json')

interface Settings {
  /** Folders whose projects are scanned. */
  workspaces: string[]
  /** Skills without a lock entry that are someone else's all the same. */
  others: string[]
  /** Skills opened here, newest first. */
  recent: string[]
}

function loadSettings(): Settings {
  const saved = readJson<Partial<Settings>>(isFile(SETTINGS) ? SETTINGS : OLD_SETTINGS, {})
  const sites = join(HOME, 'SITES')
  return {
    workspaces: saved.workspaces ?? (isDir(sites) ? [sites] : []),
    others: saved.others ?? [],
    recent: saved.recent ?? [],
  }
}

function updateSettings(change: (settings: Settings) => void): Settings {
  const settings = loadSettings()
  change(settings)
  writeJson(SETTINGS, settings)
  return settings
}

const tilde = (path: string): string =>
  path === HOME || path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path
const untilde = (path: string): string => resolve(path.replace(/^~(?=$|\/)/, HOME))

const realOf = (path: string): string | null => {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

const isLink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

const taken = (path: string): boolean => existsSync(path) || isLink(path)

/**
 * Where the practice skill lives: the app's own folder, which no agent reads.
 * It is a place of its own in the library, never one a skill is created or
 * installed in.
 */
const PRACTICE_PLACE: Place = {
  scope: PRACTICE_SCOPE,
  label: 'Walkthrough',
  root: join(STUDIO_DIR, 'practice'),
}
const PRACTICE_DIR = join(PRACTICE_PLACE.root, PRACTICE.name)

/** True when `path` is the practice skill's folder. */
export const isPracticeSkill = (path: string): boolean => {
  const real = realOf(path)
  return real !== null && real === realOf(PRACTICE_DIR)
}

/** The practice skill's folder, written with its cases the first time it is asked for. */
export function openPractice(): string {
  if (!isFile(join(PRACTICE_DIR, 'SKILL.md'))) {
    newSkill(PRACTICE_DIR, PRACTICE.name, PRACTICE.description, PRACTICE)
    for (const sample of PRACTICE.cases) saveCase(PRACTICE_DIR, sample, true)
  }
  return PRACTICE_DIR
}

/**
 * The walkthrough's look steps the reader has opened. Kept beside the practice
 * skill, not in it, so the skill's folder stays an ordinary skill.
 */
const PRACTICE_SEEN = join(PRACTICE_PLACE.root, 'seen.json')

export const practiceSeen = (): LookStep[] =>
  readJson<unknown[]>(PRACTICE_SEEN, []).filter(
    (step): step is LookStep => typeof step === 'string' && isLookStep(step),
  )

export function markPracticeSeen(step: LookStep): LookStep[] {
  const seen = practiceSeen()
  if (seen.includes(step)) return seen
  const next = [...seen, step]
  writeJson(PRACTICE_SEEN, next)
  return next
}

/**
 * The practice skill as it was first written: its runs, corrections, picks,
 * versions, edits and the screens marked as seen go. Progress is read from those files, so the loop starts
 * again at its first step. Only the app's own copy is touched.
 */
export function restartPractice(): string {
  rmSync(PRACTICE_DIR, { recursive: true, force: true })
  rmSync(PRACTICE_SEEN, { force: true })
  return openPractice()
}

function practiceEntry(): Entry[] {
  const real = realOf(PRACTICE_DIR)
  return real && isFile(join(real, 'SKILL.md'))
    ? [{ place: PRACTICE_PLACE, holder: 'store', name: PRACTICE.name, real, link: false }]
    : []
}

function projectsIn(workspace: string): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (HOLDERS.some((h) => isDir(join(dir, h.dir)))) found.push(dir)
    if (depth < PROJECT_DEPTH)
      for (const name of listDirs(dir)) if (!SKIP.has(name)) walk(join(dir, name), depth + 1)
  }
  if (isDir(workspace)) walk(workspace, 0)
  return found
}

function placesOf(settings: Settings): Place[] {
  const places: Place[] = [{ scope: 'user', label: 'User', root: HOME }]
  for (const workspace of settings.workspaces)
    for (const root of projectsIn(workspace))
      if (!places.some((p) => p.root === root))
        places.push({ scope: root, label: relative(workspace, root) || basename(root), root })
  return places
}

function placeFor(scope: string): Place {
  const place = placesOf(loadSettings()).find((p) => p.scope === scope)
  if (!place) throw new Error(`Unknown place ${scope}.`)
  return place
}

const agentDir = (agent: string): string => {
  const found = AGENTS.find((a) => a.id === agent)
  if (!found) throw new Error(`Unknown agent ${agent}.`)
  return found.dir
}

/** Lock-file sources by skill name: `~/.agents/.skill-lock.json`, or a project's `skills-lock.json`. */
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

interface Entry {
  place: Place
  holder: Holder
  name: string
  real: string
  link: boolean
}

function entriesIn(place: Place): Entry[] {
  return HOLDERS.flatMap(({ holder, dir }) => {
    const folder = join(place.root, dir)
    if (!isDir(folder)) return []
    return readdirSync(folder).flatMap((name) => {
      if (name.startsWith('.')) return []
      const path = join(folder, name)
      const real = realOf(path)
      return real && isFile(join(real, 'SKILL.md'))
        ? [{ place, holder, name, real, link: isLink(path) }]
        : []
    })
  })
}

/**
 * One group per skill name per place. A link joins the group holding its
 * target, so a project linking a user skill installs that skill.
 */
function groupEntries(entries: Entry[]): Entry[][] {
  const groups = new Map<string, Entry[]>()
  const keyOfReal = new Map<string, string>()
  const add = (key: string, entry: Entry) => {
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
    keyOfReal.set(entry.real, key)
  }
  for (const e of entries) if (!e.link) add(`${e.place.scope}\0${e.name}`, e)
  for (const e of entries)
    if (e.link) add(keyOfReal.get(e.real) ?? `${e.place.scope}\0${e.name}`, e)
  return [...groups.values()]
}

const rank = (entry: Entry): number => HOLDER_RANK.indexOf(entry.holder) + (entry.link ? 10 : 0)

function installOf(group: Entry[], agent: AgentId, primary: Entry): Install {
  const entry = group.find((e) => e.holder === agent && e.place.scope === primary.place.scope)
  if (!entry) return null
  if (entry.real !== primary.real) return 'copy'
  return entry.link ? 'link' : 'here'
}

function caseCount(dir: string): number {
  try {
    return loadCases(dir).length
  } catch {
    return 0
  }
}

function toSkill(
  group: Entry[],
  context: { locks: Map<string, Record<string, string>>; settings: Settings; open: Set<string> },
): LibrarySkill {
  const primary = group.reduce((best, e) => (rank(e) < rank(best) ? e : best))
  const { real, place } = primary
  const md = join(real, 'SKILL.md')
  const { meta } = readFrontMatter(readFileSync(md, 'utf8'))
  return {
    path: real,
    name: metaText(meta, 'name') || basename(real),
    description: metaText(meta, 'description') ?? '',
    scope: place.scope,
    scopeLabel: place.label,
    installs: Object.fromEntries(
      AGENTS.map((a) => [a.id, installOf(group, a.id, primary)]),
    ) as Record<AgentId, Install>,
    copies: [...new Set(group.filter((e) => e.real !== real).map((e) => e.real))],
    source:
      context.locks.get(place.scope)?.[primary.name] ??
      (context.settings.others.includes(real) ? 'marked' : null),
    cases: caseCount(real),
    runs: listDirs(join(real, 'evals', 'runs')).length,
    modified: statSync(md).mtime.toISOString(),
    recent: context.settings.recent.includes(real),
    open: context.open.has(real),
  }
}

/**
 * Every skill in every place, and the practice skill once it exists. `open`
 * lists served skills, kept even when outside every place.
 */
export function scanLibrary(open: string[] = []): Library {
  const settings = loadSettings()
  const places = placesOf(settings)
  const entries = [...places.flatMap(entriesIn), ...practiceEntry()]
  const openReal = new Set(open.flatMap((p) => realOf(p) ?? []))
  const found = new Set(entries.map((e) => e.real))
  for (const real of openReal)
    if (!found.has(real)) {
      const place = { scope: 'other', label: tilde(dirname(real)), root: dirname(real) }
      entries.push({ place, holder: 'store', name: basename(real), real, link: false })
    }

  const context = {
    locks: new Map(places.map((p) => [p.scope, lockOf(p)])),
    settings,
    open: openReal,
  }
  const skills = groupEntries(entries)
    .map((group) => toSkill(group, context))
    .sort((a, b) => a.name.localeCompare(b.name) || a.scopeLabel.localeCompare(b.scopeLabel))
  return { skills, places, workspaces: settings.workspaces.map(tilde) }
}

export function touchRecent(path: string): void {
  const real = realOf(path)
  if (!real || loadSettings().recent[0] === real) return
  updateSettings((s) => {
    s.recent = [real, ...s.recent.filter((p) => p !== real)].slice(0, MAX_RECENT)
  })
}

function link(real: string, agent: string, place: Place): string {
  const target = join(place.root, agentDir(agent), basename(real))
  if (taken(target)) throw new Error(`${tilde(target)} already exists.`)
  mkdirSync(dirname(target), { recursive: true })
  // The OS resolves a relative link from the folder's real path (macOS /tmp is /private/tmp).
  symlinkSync(relative(realpathSync(dirname(target)), real), target)
  return target
}

const skillReal = (path: string): string => {
  const real = realOf(path)
  if (!real || !isFile(join(real, 'SKILL.md'))) throw new Error(`No skill at ${path}.`)
  return real
}

export const linkSkill = (path: string, agent: string, scope: string): string =>
  link(skillReal(path), agent, placeFor(scope))

/** Remove an agent's link to this skill. A folder holding files is never removed. */
export function unlinkSkill(path: string, agent: string, scope: string): void {
  const real = skillReal(path)
  const target = join(placeFor(scope).root, agentDir(agent), basename(real))
  if (!isLink(target) || realOf(target) !== real)
    throw new Error(`${tilde(target)} is not a link to this skill, so it is left alone.`)
  unlinkSync(target)
}

/**
 * A new skill in the place's store, linked for each agent picked. It starts
 * from a template; with `samples` the template's example cases are written too.
 */
export function createSkill(input: {
  scope: string
  name: string
  description: string
  agents: string[]
  template?: string
  samples?: boolean
}): string {
  if (!isSlug(input.name)) throw new Error(SLUG_RULE)
  const place = placeFor(input.scope)
  const dir = join(place.root, STORE_DIR, input.name)
  for (const path of [dir, ...input.agents.map((a) => join(place.root, agentDir(a), input.name))])
    if (taken(path)) throw new Error(`${tilde(path)} already exists.`)
  const template = templateById(input.template ?? 'blank')
  newSkill(dir, input.name, input.description, template)
  if (input.samples) for (const sample of template.cases) saveCase(dir, sample, true)
  for (const agent of input.agents) link(realpathSync(dir), agent, place)
  return dir
}

export function setWorkspaces(list: string[]): string[] {
  const workspaces = [...new Set(list.map(untilde))]
  const missing = workspaces.find((w) => !isDir(w))
  if (missing) throw new Error(`${tilde(missing)} is not a folder.`)
  return updateSettings((s) => {
    s.workspaces = workspaces
  }).workspaces.map(tilde)
}

/** List a skill with installed ones (`theirs`), or with yours again. */
export function markOthers(path: string, theirs: boolean): void {
  const real = skillReal(path)
  updateSettings((s) => {
    s.others = s.others.filter((p) => p !== real).concat(theirs ? [real] : [])
  })
}
