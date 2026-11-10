/**
 * Deleting a version, with a way back. The version's saved copy, the runs made
 * with it, and the corrections and picks on their outputs move to
 * `~/.skill-studio/trash/<id>/`, outside the skill so they never show in its
 * git status. Only the latest delete can be undone: each delete empties the
 * trash first, so it never holds more than one version, apart from an entry
 * marked `unfinished`, which may hold the only copy of a run.
 */
import { randomUUID } from 'node:crypto'
import { cpSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDir, listDirs, readJson, writeJson } from './fs.ts'
import { STUDIO_DIR } from './library.ts'
import {
  readStoredReviews,
  type StoredReview,
  type StoredVote,
  writeStoredReviews,
} from './reviews.ts'
import { runDir, runsOfVersion, versionsOf } from './runs.ts'
import { versionDir } from './versions.ts'

const TRASH = join(STUDIO_DIR, 'trash')

interface TrashEntry {
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

export function deleteVersion(skillDir: string, version: string): DeletedVersion {
  if (!versionsOf(skillDir).versions.some((v) => v.version === version))
    throw new Error(`There is no ${version}.`)
  const runs = runsOfVersion(skillDir, version)
  const gone = new Set(runs)
  const stored = readStoredReviews(skillDir)
  const kept = stored.reviews ?? {}
  const votes = stored.preferences ?? []
  const reviews = Object.fromEntries(Object.entries(kept).filter(([key]) => gone.has(runOf(key))))
  const preferences = votes.filter((p) => gone.has(runOf(p.a)) || gone.has(runOf(p.b)))

  emptyTrash()
  const id = randomUUID()
  const entry = join(TRASH, id)
  const saved = isDir(versionDir(skillDir, version))
  const file: TrashEntry = { skill: skillDir, version, saved, runs, reviews, preferences }
  // Unfinished until every move is made, so a crash partway leaves the entry for no later delete to empty.
  writeJson(entryFile(entry), { ...file, unfinished: true } satisfies TrashEntry)
  try {
    moveAll([
      ...(saved ? [[versionDir(skillDir, version), join(entry, 'version')] as Move] : []),
      ...runs.map((run): Move => [runDir(skillDir, run), join(entry, 'runs', run)]),
    ])
  } catch (error) {
    const stuck = error instanceof MoveFailed ? error.stuck : []
    if (stuck.length)
      throw new Error(
        `${version} could not be deleted (${(error as Error).message}), and part of it could not be put back. Nothing is lost: it is in ${entry}. Move ${moveBack(stuck)}, and ${version} is whole again.`,
        { cause: error },
      )
    // Everything that left the skill went back, so there is nothing to undo.
    rmSync(entry, { recursive: true, force: true })
    throw new Error(
      `${version} could not be deleted, and nothing was changed: ${(error as Error).message}`,
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
      preferences: votes.filter((p) => !preferences.includes(p)),
    })
  }
  return {
    deleted: version,
    runs: runs.length,
    reviews: Object.keys(reviews).length,
    undo: id,
  }
}

/**
 * Put back what the delete named `undo` moved out, if nothing has taken its
 * place. A version number is given out again once its version is deleted, so
 * when the skill holds a version of that number again the undo is refused: two
 * different skill texts must never share one number.
 */
export function undeleteVersion(skillDir: string, undo: string): { restored: string } {
  const entry = join(TRASH, undo)
  const file = readJson<TrashEntry | null>(join(entry, 'entry.json'), null)
  if (!file || file.skill !== skillDir) throw new Error('This delete can no longer be undone.')
  if (versionsOf(skillDir).versions.some((v) => v.version === file.version))
    throw new Error(
      `Can't undo: a new ${file.version} was made since. Delete it first to bring the old one back.`,
    )
  if (file.runs.some((run) => isDir(runDir(skillDir, run))))
    throw new Error(`Can't undo: a run of ${file.version} already exists.`)

  try {
    moveAll([
      ...(file.saved ? [[join(entry, 'version'), versionDir(skillDir, file.version)] as Move] : []),
      // A run folder removed from the trash by hand is passed over; the rest come back.
      ...file.runs
        .filter((run) => isDir(join(entry, 'runs', run)))
        .map((run): Move => [join(entry, 'runs', run), runDir(skillDir, run)]),
    ])
  } catch (error) {
    const stuck = error instanceof MoveFailed ? error.stuck : []
    if (!stuck.length) throw error
    markUnfinished(entry, file)
    throw new Error(
      `${file.version} could not be brought back (${(error as Error).message}), and part of it could not be returned to the trash. Nothing is lost: move ${moveBack(stuck)}, and the delete can be undone again.`,
      { cause: error },
    )
  }
  if (Object.keys(file.reviews).length || file.preferences.length) {
    const stored = readStoredReviews(skillDir)
    writeStoredReviews(skillDir, {
      ...stored,
      reviews: { ...file.reviews, ...stored.reviews },
      preferences: [...(stored.preferences ?? []), ...file.preferences],
    })
  }
  rmSync(entry, { recursive: true, force: true })
  return { restored: file.version }
}
