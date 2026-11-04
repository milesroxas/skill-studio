/**
 * Unsaved edits, one file per skill under `~/.skill-studio/drafts/`. Kept out
 * of the skill folder so a draft never shows up in its git status, and named by
 * a hash of the skill's path so any path is a safe file name. An empty draft
 * deletes its file.
 */
import { createHash } from 'node:crypto'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { type CaseDraft, emptyDrafts, type FileDraft, type SkillDrafts } from '@domain/schemas.ts'
import { isFile, readJson, writeJson } from './fs.ts'
import { STUDIO_DIR } from './library.ts'

const draftsFile = (skillPath: string): string =>
  join(
    STUDIO_DIR,
    'drafts',
    `${createHash('sha256').update(skillPath).digest('hex').slice(0, 16)}.json`,
  )

interface DraftsFile extends SkillDrafts {
  skill: string
}

export function readDrafts(skillPath: string): SkillDrafts {
  const saved = readJson<Partial<DraftsFile> | null>(draftsFile(skillPath), null)
  // Two paths can share a short hash in theory; a draft for another skill is not this one's.
  if (!saved || saved.skill !== skillPath) return emptyDrafts()
  return {
    files: (saved.files ?? {}) as Record<string, FileDraft>,
    cases: (saved.cases ?? {}) as Record<string, CaseDraft>,
    updatedAt: saved.updatedAt ?? null,
  }
}

export function writeDrafts(skillPath: string, drafts: SkillDrafts): string | null {
  const file = draftsFile(skillPath)
  if (!Object.keys(drafts.files).length && !Object.keys(drafts.cases).length) {
    if (isFile(file)) rmSync(file)
    return null
  }
  const updatedAt = new Date().toISOString()
  writeJson(file, { skill: skillPath, ...drafts, updatedAt } satisfies DraftsFile)
  return updatedAt
}
