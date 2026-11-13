/**
 * Deleting a version or one run, with a way back. What goes (a version's saved
 * copy, the runs, and the corrections on their outputs, with any votes on them
 * an earlier version of the app wrote) moves to `~/.skill-studio/trash/<id>/`,
 * outside the skill so it never shows in its git status. Only the latest
 * delete can be undone: each delete empties the trash first, so it never holds
 * more than one, apart from an entry marked `unfinished`, which may hold the
 * only copy of a run.
 */
import { randomUUID } from 'node:crypto'
import { cpSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type VersionAfterRunDelete, versionAfterRunDelete } from '@domain/run-delete.ts'
import { assertInside, isDir, isFile, listDirs, readJson, writeJson } from './fs.ts'
import { STUDIO_DIR } from './library.ts'
import {
  readStoredReviews,
  type StoredReview,
  type StoredReviews,
  type StoredVote,
  writeStoredReviews,
} from './reviews.ts'
import { readRunMeta, runDir, runsOfVersion, skillCopy, versionsOf } from './runs.ts'
import {
  keepVersion,
  savedVersionFile,
  savedVersionSource,
  type VersionFile,
  versionDir,
} from './versions.ts'

const TRASH = join(STUDIO_DIR, 'trash')

interface TrashEntry {
  /** A delete of one run; a version's delete leaves it out. */
  kind?: 'run'
  skill: string
  version: string
  saved: boolean
  runs: string[]
  reviews: Record<string, StoredReview>
  preferences: StoredVote[]
  /**
   * Set while a delete moves things in, and left set when it, or an undo,
   * stopped partway and could not put everything back: emptying the trash
   * passes such an entry over.
   */
  unfinished?: true
  /** A run's delete that saved its version, so the list kept it: the record it wrote. */
  kept?: VersionFile
  /** A run's delete that took its version with it: the run was its last copy and kept no snapshot. */
  took?: true
}

export interface DeletedVersion {
  deleted: string
  runs: number
  reviews: number
  /** Names the trash entry that `undeleteVersion` puts back. */
  undo: string
}

type Move = [from: string, to: string]

/** A move across disks whose copy is whole, with only the source left to remove: it counts as made. */
type Copied = Error & { copied?: true }

/** A rename, or a copy and delete when the trash sits on another disk. */
function move(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true })
  try {
    renameSync(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    try {
      cpSync(from, to, { recursive: true })
    } catch (failed) {
      // Half a copy is not a move: the source is whole, so the copy goes.
      rmSync(to, { recursive: true, force: true })
      throw failed
    }
    try {
      rmSync(from, { recursive: true, force: true })
    } catch (failed) {
      throw Object.assign(failed as Error, { copied: true as const }) satisfies Copied
    }
  }
}

/** Moves that failed partway. `stuck` holds those made that could not be taken back. */
class MoveFailed extends Error {
  constructor(
    cause: unknown,
    readonly stuck: Move[],
  ) {
    super((cause as Error).message, { cause })
  }
}

/**
 * Make every move in `moves`, or none: when one fails, every one already made
 * is taken back, even past one that cannot be, so a folder is never left half
 * in the skill and half out of it. What could not be taken back is named in
 * the `MoveFailed` thrown.
 */
function moveAll(moves: Move[]): void {
  const made: Move[] = []
  for (const [from, to] of moves) {
    try {
      move(from, to)
    } catch (error) {
      if ((error as Copied).copied) made.push([from, to])
      const stuck = made.reverse().filter(([from, to]) => {
        try {
          move(to, from)
          return false
        } catch {
          return true
        }
      })
      throw new MoveFailed(error, stuck)
    }
    made.push([from, to])
  }
}

/** "a to b, and c to d": the moves that would put each thing back. */
const moveBack = (stuck: Move[]): string =>
  stuck.map(([from, to]) => `${to} to ${from}`).join(', and ')

const entryFile = (entry: string): string => join(entry, 'entry.json')

/** Empty the trash, passing over an entry marked unfinished, or one whose record cannot be read. */
function emptyTrash(): void {
  for (const id of listDirs(TRASH)) {
    let file: TrashEntry | null
    try {
      file = readJson<TrashEntry | null>(entryFile(join(TRASH, id)), null)
    } catch {
      continue
    }
    if (!file?.unfinished) rmSync(join(TRASH, id), { recursive: true, force: true })
  }
}

/** Mark an entry unfinished, so no later delete empties it; a failure to is warned of and passed. */
function markUnfinished(entry: string, file: TrashEntry): void {
  try {
    writeJson(entryFile(entry), { ...file, unfinished: true } satisfies TrashEntry)
  } catch (error) {
    console.warn(`${entry} could not be marked unfinished: ${(error as Error).message}`)
  }
}

/** The run an output key (`<run>/<sample>`) belongs to. */
const runOf = (key: string): string => key.split('/')[0]

/** The file's votes. Nothing writes them now, so a list edited by hand is read as it stands. */
const votesOf = (stored: StoredReviews): StoredVote[] =>
  Array.isArray(stored.preferences) ? stored.preferences : []

/** A vote names an output of one of `runs`. An entry with no output keys names none. */
const onRuns = (vote: StoredVote, runs: ReadonlySet<string>): boolean =>
  vote !== null &&
  typeof vote === 'object' &&
  [vote.a, vote.b].some((key) => typeof key === 'string' && runs.has(runOf(key)))

/**
 * Move `runs` (and the version's saved copy, when `file.saved`) into a new
 * trash entry, with the corrections and old votes on their outputs. All of it
 * moves or none: `what` names the thing in the error when it cannot.
 */
function trash(
  skillDir: string,
  base: Omit<TrashEntry, 'skill' | 'reviews' | 'preferences' | 'unfinished'>,
  what: string,
): { id: string; reviews: number } {
  const gone = new Set(base.runs)
  const stored = readStoredReviews(skillDir)
  const kept = stored.reviews ?? {}
  const votes = votesOf(stored)
  const reviews = Object.fromEntries(Object.entries(kept).filter(([key]) => gone.has(runOf(key))))
  const preferences = votes.filter((p) => onRuns(p, gone))

  emptyTrash()
  const id = randomUUID()
  const entry = join(TRASH, id)
  const file: TrashEntry = { ...base, skill: skillDir, reviews, preferences }
  // Unfinished until every move is made, so a crash partway leaves the entry for no later delete to empty.
  writeJson(entryFile(entry), { ...file, unfinished: true } satisfies TrashEntry)
  try {
    moveAll([
      ...(base.saved ? [[versionDir(skillDir, base.version), join(entry, 'version')] as Move] : []),
      ...base.runs.map((run): Move => [runDir(skillDir, run), join(entry, 'runs', run)]),
    ])
  } catch (error) {
    const stuck = error instanceof MoveFailed ? error.stuck : []
    if (stuck.length)
      throw new Error(
        `${what} could not be deleted (${(error as Error).message}), and part of it could not be put back. Nothing is lost: it is in ${entry}. Move ${moveBack(stuck)}, and ${what} is whole again.`,
        { cause: error },
      )
    // Everything that left the skill went back, so there is nothing to undo.
    rmSync(entry, { recursive: true, force: true })
    throw new Error(
      `${what} could not be deleted, and nothing was changed: ${(error as Error).message}`,
      { cause: error },
    )
  }
  try {
    writeJson(entryFile(entry), file)
  } catch (error) {
    // The delete is made and can be undone; the entry only stays in the trash after the next one.
    console.warn(`${entry} stays marked unfinished: ${(error as Error).message}`)
  }
  if (Object.keys(reviews).length || preferences.length) {
    for (const key of Object.keys(reviews)) delete kept[key]
    writeStoredReviews(skillDir, {
      ...stored,
      reviews: kept,
      // A `preferences` that holds no list is left as the file has it.
      ...(Array.isArray(stored.preferences)
        ? { preferences: votes.filter((p) => !preferences.includes(p)) }
        : {}),
    })
  }
  return { id, reviews: Object.keys(reviews).length }
}

/** Put the corrections and votes an entry holds back in the skill's file. */
function untrashReviews(skillDir: string, file: TrashEntry): void {
  if (!Object.keys(file.reviews).length && !file.preferences.length) return
  const stored = readStoredReviews(skillDir)
  writeStoredReviews(skillDir, {
    ...stored,
    reviews: { ...file.reviews, ...stored.reviews },
    ...(file.preferences.length ? { preferences: [...votesOf(stored), ...file.preferences] } : {}),
  })
}

export function deleteVersion(skillDir: string, version: string): DeletedVersion {
  if (!versionsOf(skillDir).versions.some((v) => v.version === version))
    throw new Error(`There is no ${version}.`)
  const runs = runsOfVersion(skillDir, version)
  const saved = isDir(versionDir(skillDir, version))
  const { id, reviews } = trash(skillDir, { version, saved, runs }, version)
  return { deleted: version, runs: runs.length, reviews, undo: id }
}

export interface DeletedRun {
  deleted: string
  reviews: number
  /** The version saved so it stays in the list, its run being the only one; null when none was. */
  kept: string | null
  /** Names the trash entry that `undeleteRun` puts back. */
  undo: string
}

/**
 * Delete one run, its outputs and the corrections on them. The version it was
 * made with stays: when this run is the only copy of it, the version is saved
 * from the run's `_skill/` first, so the list, Restore and its number keep it.
 */
export function deleteRun(skillDir: string, run: string): DeletedRun {
  if (!isDir(runDir(skillDir, run))) throw new Error(`There is no run called ${run}.`)
  const { version, after, kept } = versionPlan(skillDir, run)
  try {
    if (kept) saveFromSnapshot(skillDir, run, kept)
    const took = after === 'goes' ? { took: true as const } : {}
    const base = { kind: 'run' as const, version, saved: false, runs: [run], ...took }
    const { id, reviews } = trash(skillDir, kept ? { ...base, kept } : base, `The run ${run}`)
    return { deleted: run, reviews, kept: kept ? version : null, undo: id }
  } catch (error) {
    // The run did not move, so it is still the version's copy. The version had no saved copy
    // before this delete, so whatever is in its folder now this delete wrote: it goes.
    if (kept && isDir(runDir(skillDir, run)))
      rmSync(versionDir(skillDir, version), { recursive: true, force: true })
    throw error
  }
}

/** What deleting `run` does to its version, and the record to save it with when it saves it. */
function versionPlan(
  skillDir: string,
  run: string,
): { version: string; after: VersionAfterRunDelete; kept?: VersionFile } {
  const meta = readRunMeta(skillDir, run)
  const version = meta?.skillVersion ?? ''
  const after = versionAfterRunDelete({
    version,
    saved: version !== '' && savedVersionSource(skillDir, version) !== null,
    otherRuns: version ? runsOfVersion(skillDir, version).filter((r) => r !== run).length : 0,
    snapshot: isDir(skillCopy(skillDir, run)),
  })
  if (after !== 'saved' || !meta) return { version, after }
  const { skillName: name, note, skillHash: hash, createdAt } = meta
  return {
    version,
    after,
    kept: { version, name, note, hash, createdAt: createdAt || new Date().toISOString() },
  }
}

/**
 * Save `kept` from the run's snapshot. The app writes `_skill/SKILL.md` as a
 * plain file: a link out, or no file, was put in since, and a version saved
 * from it would restore something other than the skill that ran.
 */
function saveFromSnapshot(skillDir: string, run: string, kept: VersionFile): void {
  const snapshot = skillCopy(skillDir, run)
  if (!isFile(assertInside(snapshot, join(snapshot, 'SKILL.md'))))
    throw new Error(`${run} kept no SKILL.md, so its version cannot be saved. Nothing was deleted.`)
  keepVersion(skillDir, snapshot, kept)
}

const GONE = 'This delete can no longer be undone.'

/** The trash entry `undo` names, when it holds a delete of `kind` from this skill. */
function openEntry(
  skillDir: string,
  undo: string,
  kind: 'run' | 'version',
): { entry: string; file: TrashEntry } {
  const entry = join(TRASH, undo)
  const file = readJson<TrashEntry | null>(entryFile(entry), null)
  if (!file || (file.kind ?? 'version') !== kind || file.skill !== skillDir) throw new Error(GONE)
  return { entry, file }
}

/**
 * Make `moves` out of the trash entry, all or none. When one cannot be taken
 * back, the entry is marked unfinished, so no later delete empties it, and the
 * error says what to move. `what` names what is being brought back.
 */
function restore(entry: string, file: TrashEntry, what: string, moves: Move[]): void {
  try {
    moveAll(moves)
  } catch (error) {
    const stuck = error instanceof MoveFailed ? error.stuck : []
    if (!stuck.length) throw error
    markUnfinished(entry, file)
    throw new Error(
      `${what} could not be brought back (${(error as Error).message}), and part of it could not be returned to the trash. Nothing is lost: move ${moveBack(stuck)}, and the delete can be undone again.`,
      { cause: error },
    )
  }
}

/** Everything is back: the corrections too, and the entry goes. */
function closeEntry(skillDir: string, entry: string, file: TrashEntry): void {
  untrashReviews(skillDir, file)
  rmSync(entry, { recursive: true, force: true })
}

/** The version's saved copy is still the one a run's delete wrote as `kept`. */
function isKept(skillDir: string, kept: VersionFile): boolean {
  const saved = savedVersionFile(skillDir, kept.version)
  return saved?.createdAt === kept.createdAt && saved.hash === kept.hash
}

/**
 * Put back the run the delete named `undo` moved out. Refused when a run of
 * that name is there again, or when the delete took the run's version and its
 * number was given out again since. A version the delete saved for the run
 * goes again while it is still the one the delete wrote: the run is its copy
 * once more.
 */
export function undeleteRun(skillDir: string, undo: string): { restored: string } {
  const { entry, file } = openEntry(skillDir, undo, 'run')
  const [run] = file.runs
  if (!run || !isDir(join(entry, 'runs', run))) throw new Error(GONE)
  if (isDir(runDir(skillDir, run))) throw new Error(`Can't undo: a run called ${run} exists.`)
  // Only a delete that took the version frees its number. Any later delete in the app empties
  // the trash, so while this one can be undone no other could have freed it.
  if (file.took && versionsOf(skillDir).versions.some((v) => v.version === file.version))
    throw new Error(
      `Can't undo: a new ${file.version} was made since. Delete it first to bring the run back.`,
    )

  restore(entry, file, run, [[join(entry, 'runs', run), runDir(skillDir, run)]])
  if (file.kept && isKept(skillDir, file.kept))
    rmSync(versionDir(skillDir, file.version), { recursive: true, force: true })
  closeEntry(skillDir, entry, file)
  return { restored: run }
}

/**
 * Put back what the delete named `undo` moved out, if nothing has taken its
 * place. A version number is given out again once its version is deleted, so
 * when the skill holds a version of that number again the undo is refused: two
 * different skill texts must never share one number.
 */
export function undeleteVersion(skillDir: string, undo: string): { restored: string } {
  const { entry, file } = openEntry(skillDir, undo, 'version')
  if (versionsOf(skillDir).versions.some((v) => v.version === file.version))
    throw new Error(
      `Can't undo: a new ${file.version} was made since. Delete it first to bring the old one back.`,
    )
  if (file.runs.some((run) => isDir(runDir(skillDir, run))))
    throw new Error(`Can't undo: a run of ${file.version} already exists.`)

  restore(entry, file, file.version, [
    ...(file.saved ? [[join(entry, 'version'), versionDir(skillDir, file.version)] as Move] : []),
    // A run folder removed from the trash by hand is passed over; the rest come back.
    ...file.runs
      .filter((run) => isDir(join(entry, 'runs', run)))
      .map((run): Move => [join(entry, 'runs', run), runDir(skillDir, run)]),
  ])
  closeEntry(skillDir, entry, file)
  return { restored: file.version }
}
