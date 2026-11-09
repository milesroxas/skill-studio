/**
 * Deleting a version, with a way back. The version's saved copy, the runs made
 * with it, and the corrections and picks on their outputs move to
 * `~/.skill-studio/trash/<id>/`, outside the skill so they never show in its
 * git status. Only the latest delete can be undone: each delete empties the
 * trash first, so it never holds more than one version.
 */
import { randomUUID } from 'node:crypto'
import { cpSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDir, readJson, writeJson } from './fs.ts'
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
}

export interface DeletedVersion {
  deleted: string
  runs: number
  reviews: number
  /** Names the trash entry that `undeleteVersion` puts back. */
  undo: string
}

/** A rename, or a copy and delete when the trash sits on another disk. */
function move(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true })
  try {
    renameSync(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    cpSync(from, to, { recursive: true })
    rmSync(from, { recursive: true, force: true })
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

  rmSync(TRASH, { recursive: true, force: true })
  const id = randomUUID()
  const entry = join(TRASH, id)
  const saved = isDir(versionDir(skillDir, version))
  writeJson(join(entry, 'entry.json'), {
    skill: skillDir,
    version,
    saved,
    runs,
    reviews,
    preferences,
  } satisfies TrashEntry)
  if (saved) move(versionDir(skillDir, version), join(entry, 'version'))
  for (const run of runs) move(runDir(skillDir, run), join(entry, 'runs', run))
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

/** Put back what the delete named `undo` moved out, if nothing has taken its place. */
export function undeleteVersion(skillDir: string, undo: string): { restored: string } {
  const entry = join(TRASH, undo)
  const file = readJson<TrashEntry | null>(join(entry, 'entry.json'), null)
  if (!file || file.skill !== skillDir) throw new Error('This delete can no longer be undone.')
  if (file.saved && isDir(versionDir(skillDir, file.version)))
    throw new Error(`Can't undo: a new ${file.version} was saved since.`)
  if (file.runs.some((run) => isDir(runDir(skillDir, run))))
    throw new Error(`Can't undo: a run of ${file.version} already exists.`)

  if (file.saved) move(join(entry, 'version'), versionDir(skillDir, file.version))
  for (const run of file.runs) move(join(entry, 'runs', run), runDir(skillDir, run))
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
