/**
 * Versions saved by hand: `<skill>/evals/versions/<vN>/` holds `version.json`
 * and a `files/` copy of SKILL.md and references. They live beside the runs so
 * they travel with the skill, and they take numbers from the same sequence: a
 * run of a saved version is stamped with that version.
 */
import { join } from 'node:path'
import type { SkillVersion, SkillVersions } from '@domain/views.ts'
import { isDir, listDirs, readJson, readTree, writeJson } from './fs.ts'
import { snapshotSkillFiles } from './skill.ts'

const versionsDir = (skillDir: string): string => join(skillDir, 'evals/versions')
const versionDir = (skillDir: string, version: string): string =>
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

export function savedVersions(skillDir: string): SkillVersion[] {
  return listDirs(versionsDir(skillDir)).flatMap((dir) => {
    const file = readJson<VersionFile | null>(join(versionDir(skillDir, dir), 'version.json'), null)
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
  if (isDir(dir)) throw new Error(`${current.version} is already saved.`)
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
  const dir = join(versionDir(skillDir, version), 'files')
  return isDir(dir) ? readTree(dir) : null
}
