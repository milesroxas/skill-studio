/**
 * Where a sample's agent works: a folder of its own under the system's
 * temporary folder, with nothing above it that an agent reads. An agent CLI
 * reads instructions and skills from the folders above the one it starts in
 * (Claude Code reads every `CLAUDE.md` above it, and each `.claude/skills` up
 * to the nearest git root), so an agent started inside the skill's
 * `evals/runs/` would be told whatever the skill's repository says, and could
 * reach the run's copy of the skill, its cases and its checks by `..`.
 *
 * Each sample gets `<temp>/skill-studio-sample-<random>/<sample>/`: the parent
 * is made for it alone, so `..` holds nothing but the sample. When the agent
 * ends, everything it made is moved into the sample's folder in the run.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { segments } from '@domain/paths.ts'
import { present, readJson } from './fs.ts'

/** How each sample's own folder under the system's temporary folder begins. */
export const WORKDIR_PREFIX = 'skill-studio-sample-'

/** The file in a sample's folder in the run that names where its agent worked. */
export const AGENT_FILE = 'agent.json'

/**
 * The files the run keeps in a sample's own folder from the start, which the
 * agent's folder does not hold: what it was asked, what it did, how it ended.
 * One of these names that the agent made in its own folder is not moved over them.
 */
const KEPT_FILES = ['prompt.md', 'transcript.jsonl', AGENT_FILE, 'timing.json']

/** The system's temporary folder, under each name it goes by: as the system gives it, and with every link resolved. */
function tempRoots(): string[] {
  const given = tmpdir()
  const roots = new Set([given])
  for (const real of [realpathSync, realpathSync.native])
    try {
      roots.add(real(given))
    } catch {}
  return [...roots]
}

/**
 * A new folder for one sample's agent, named `name` inside a folder made for
 * it alone. `paths` are the names it goes by, the first being the one the
 * agent is started in: the temporary folder's links resolved, and as the
 * system names it (`/var/…` and `/private/var/…` on macOS, a short
 * `RUNNER~1` and the long name on Windows), so the paths an agent's
 * transcript names can be read as inside it whichever it used.
 */
export function makeWorkdir(name: string): { dir: string; paths: string[] } {
  const parent = mkdtempSync(join(tmpdir(), WORKDIR_PREFIX))
  const given = join(parent, name)
  mkdirSync(given)
  const paths = new Set<string>()
  for (const real of [realpathSync.native, realpathSync])
    try {
      paths.add(real(given))
    } catch {}
  paths.add(given)
  const [dir] = [...paths]
  return { dir, paths: [...paths] }
}

/**
 * True when `dir` is a folder `makeWorkdir` made: one level inside a
 * `skill-studio-sample-` folder right under the system's temporary folder. A
 * sample's `agent.json` is a file in the skill, which anyone may write, so a
 * folder it names is read from only when it is one of these.
 */
export function isWorkdir(dir: string): boolean {
  if (!isWorkdirName(dir)) return false
  const temp = segments(dirname(dirname(dir))).join('/')
  return tempRoots().some((root) => segments(root).join('/') === temp)
}

/** A path shaped as `makeWorkdir` names one, on any system: a folder inside a `skill-studio-sample-` folder. */
const isWorkdirName = (path: string): boolean => {
  const parts = segments(path)
  return parts.length >= 3 && (parts.at(-2) ?? '').startsWith(WORKDIR_PREFIX)
}

/**
 * The names a sample's agent worked under, as its `agent.json` records them;
 * none for a sample whose agent worked in the sample's own folder (a run made
 * before samples were worked on elsewhere) or whose record is not one. They
 * may name a folder on another machine, for a run made there: they are read
 * as names, never opened.
 */
export function workdirsOf(sampleDir: string): string[] {
  let record: unknown
  try {
    record = readJson<unknown>(join(sampleDir, AGENT_FILE), null)
  } catch {
    return []
  }
  const paths = (record as { workdir?: unknown } | null)?.workdir
  return Array.isArray(paths)
    ? paths.filter((path): path is string => typeof path === 'string' && isWorkdirName(path))
    : []
}

/**
 * The folder a sample's agent is working in now, when its work has not been
 * moved into the sample yet: while the agent runs, and after a crash cut it
 * off, until the system clears its temporary folder. Null otherwise.
 */
export function liveWorkdir(sampleDir: string): string | null {
  const dir = workdirsOf(sampleDir).find(isWorkdir)
  return dir && present(dir) ? dir : null
}

/**
 * Move one entry, renaming it when it can and copying it when it cannot: the
 * temporary folder and the skill may sit on different disks, where a rename
 * fails with `EXDEV`. A link is copied as the link it is, never followed.
 */
export function moveEntry(
  from: string,
  to: string,
  rename: (from: string, to: string) => void = renameSync,
): void {
  try {
    rename(from, to)
    return
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // Windows may refuse a rename across disks, or over a folder another program holds, with EPERM.
    if (code !== 'EXDEV' && code !== 'EPERM') throw error
  }
  cpSync(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false })
  rmSync(from, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

/**
 * Move everything a sample's agent made in `workdir` into the sample's folder
 * in the run, then remove the folder made for it. An entry the run keeps there
 * already (`KEPT_FILES`) stays the run's. Returns what could not be moved or
 * removed, in words, for the log: a folder another program still holds open
 * on Windows, a full disk.
 */
export function moveWork(
  workdir: string,
  sampleDir: string,
  rename?: (from: string, to: string) => void,
): string[] {
  const problems: string[] = []
  let names: string[] = []
  try {
    names = readdirSync(workdir)
  } catch (error) {
    problems.push(`its folder could not be read (${(error as Error).message})`)
  }
  try {
    mkdirSync(sampleDir, { recursive: true })
  } catch (error) {
    return [`the sample's folder could not be made (${(error as Error).message})`]
  }
  for (const name of names) {
    const to = join(sampleDir, name)
    if (KEPT_FILES.includes(name) && present(to)) continue
    try {
      moveEntry(join(workdir, name), to, rename)
    } catch (error) {
      problems.push(`${name} could not be moved (${(error as Error).message})`)
    }
  }
  if (!problems.length)
    try {
      rmSync(dirname(workdir), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch (error) {
      problems.push(`${dirname(workdir)} could not be removed (${(error as Error).message})`)
    }
  return problems
}

/**
 * `text` with each name the agent's folder went by read as the sample's own
 * folder: what a transcript says of `<temp>/…/case-s1/outputs/a.md` it says of
 * `<sample>/outputs/a.md`. Both separators are tried, as an agent on Windows
 * may write either.
 */
export function asSamplePath(text: string, workdirs: readonly string[], sampleDir: string): string {
  let out = text
  const names = workdirs.flatMap((dir) => [dir, dir.replace(/\\/g, '/')])
  // The longest first, so `/private/var/…` is read before `/var/…` inside it.
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length))
    if (out.includes(name)) out = out.split(name).join(sampleDir)
  return out
}
