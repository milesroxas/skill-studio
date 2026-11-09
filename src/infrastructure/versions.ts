/**
 * Versions saved by hand: `<skill>/evals/versions/<vN>/` holds `version.json`
 * and a `files/` copy of SKILL.md and references. They live beside the runs so
 * they travel with the skill, and they take numbers from the same sequence: a
 * run of a saved version is stamped with that version.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillVersion, SkillVersions } from '@domain/views.ts'
import { isDir, isFile, listDirs, readJson, readTree, writeJson } from './fs.ts'
import { snapshotSkillFiles } from './skill.ts'

const versionsDir = (skillDir: string): string => join(skillDir, 'evals/versions')
export const versionDir = (skillDir: string, version: string): string =>
  join(versionsDir(skillDir), version)

const VERSION_LABEL = /^v\d+$/
export const isVersionLabel = (value: string): boolean => VERSION_LABEL.test(value)

interface VersionFile {
  version: string
  name: string
  note: string
  hash: string
  createdAt: string
}

/**
 * `version.json` is written last, so a folder holding one is a saved version
 * and a folder without one is a save that did not finish.
 */
const isSaved = (dir: string): boolean => isFile(join(dir, 'version.json'))

export function savedVersions(skillDir: string): SkillVersion[] {
  return listDirs(versionsDir(skillDir)).flatMap((dir) => {
    const path = join(versionDir(skillDir, dir), 'version.json')
    let file: VersionFile | null
    try {
      file = readJson<VersionFile | null>(path, null)
    } catch (error) {
      // One version that cannot be read must not hide the rest.
      console.warn((error as Error).message)
      return []
    }
    if (!file || !isVersionLabel(file.version)) return []
    return [
      {
        version: file.version,
        name: file.name,
        hash: file.hash,
        note: file.note,
        date: file.createdAt.slice(0, 10) || undefined,
        saved: true,
      },
    ]
  })
}

/** Save the working tree as the next version. Refused when it already is one. */
export function saveVersion(
  skillDir: string,
  current: SkillVersions['current'],
  name: string,
  note: string,
): SkillVersion {
  const title = name.trim()
  if (!title) throw new Error('Name the version first.')
  if (!current.changed) throw new Error(`These files are already ${current.version}.`)
  const dir = versionDir(skillDir, current.version)
  if (isSaved(dir)) throw new Error(`${current.version} is already saved.`)
  // A folder with no version.json is a save that crashed partway: start it over.
  if (isDir(dir)) rmSync(dir, { recursive: true, force: true })
  snapshotSkillFiles(skillDir, join(dir, 'files'))
  const createdAt = new Date().toISOString()
  writeJson(join(dir, 'version.json'), {
    version: current.version,
    name: title,
    note: note.trim(),
    hash: current.hash,
    createdAt,
  } satisfies VersionFile)
  return {
    version: current.version,
    name: title,
    hash: current.hash,
    note: note.trim(),
    date: createdAt.slice(0, 10),
    saved: true,
  }
}

/** A saved version's files, or null when it was never saved by hand. */
export function savedVersionFiles(
  skillDir: string,
  version: string,
): Record<string, string> | null {
  const dir = versionDir(skillDir, version)
  return isSaved(dir) && isDir(join(dir, 'files')) ? readTree(join(dir, 'files')) : null
}
