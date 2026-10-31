import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { RunMeta } from '@core/schemas.ts'
import { metaText, readFrontMatter } from '@core/text.ts'
import { assertSafePath, copyTree, isDir, isFile, readTree } from './fs.ts'

/** The files that make a skill version: SKILL.md and every reference. */
const SKILL_FILES = ['SKILL.md', 'references']

export interface SkillInfo {
  path: string
  name: string
  description: string
}

export function skillInfo(skillDir: string): SkillInfo {
  const path = resolve(skillDir)
  const md = join(path, 'SKILL.md')
  if (!existsSync(md)) throw new Error(`No SKILL.md at ${path}.`)
  const { meta } = readFrontMatter(readFileSync(md, 'utf8'))
  return {
    path,
    name: metaText(meta, 'name') ?? basename(path),
    description: metaText(meta, 'description') ?? '',
  }
}

/** SKILL.md and references/**, keyed by skill-relative path. */
export function skillFiles(skillDir: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of SKILL_FILES) {
    const full = join(skillDir, entry)
    if (!existsSync(full)) continue
    if (isDir(full))
      for (const [path, text] of Object.entries(readTree(full))) files[`${entry}/${path}`] = text
    else files[entry] = readFileSync(full, 'utf8')
  }
  return files
}

/** A skill-relative path the editor may write: SKILL.md or a file under references/. */
export function editablePath(path: string): string {
  assertSafePath(path, 'path')
  const parts = path.split('/')
  if (path === 'SKILL.md' || (parts[0] === 'references' && parts.length > 1)) return path
  throw new Error('Only SKILL.md and files under references/ can be edited.')
}

/**
 * Write one skill file. `previous` is the text the editor loaded (null for a
 * new file); a mismatch means the file changed on disk since, so the write is
 * refused rather than overwriting someone else's edit.
 */
export function writeSkillFile(
  skillDir: string,
  path: string,
  text: string,
  previous: string | null,
): void {
  const full = join(skillDir, editablePath(path))
  const current = isFile(full) ? readFileSync(full, 'utf8') : null
  if (current !== previous)
    throw new Error(
      current === null
        ? `${path} was deleted on disk. Reload to see it.`
        : previous === null
          ? `${path} already exists.`
          : `${path} changed on disk since you opened it. Reload to see it.`,
    )
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
}

/** Delete one reference file. SKILL.md cannot be deleted. */
export function deleteSkillFile(skillDir: string, path: string): void {
  if (editablePath(path) === 'SKILL.md') throw new Error('SKILL.md cannot be deleted.')
  const full = join(skillDir, path)
  if (!isFile(full)) throw new Error(`No ${path}.`)
  rmSync(full)
  // Drop folders the delete left empty, up to references/ itself.
  for (let dir = dirname(full); dir !== skillDir; dir = dirname(dir)) {
    if (readdirSync(dir).length) break
    rmdirSync(dir)
  }
}

/** Scaffold a new skill: SKILL.md with front matter and an empty evals/cases/. */
export function newSkill(skillDir: string, name: string, description: string): string {
  const path = resolve(skillDir)
  const md = join(path, 'SKILL.md')
  if (existsSync(md)) throw new Error(`${md} already exists.`)
  mkdirSync(join(path, 'evals', 'cases'), { recursive: true })
  const title = name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  writeFileSync(
    md,
    `---\nname: ${name}\ndescription: ${description || 'What the skill does. Use when ...'}\n---\n\n# ${title}\n\n## Rules\n\n- One rule per top-level bullet. Each becomes a graded rule.\n`,
  )
  return md
}

/** The skill's identity: a hash of every file's path and text. Same text, same version. */
export function skillHash(files: Record<string, string>): string {
  const hash = createHash('sha256')
  for (const path of Object.keys(files).sort()) {
    hash.update(path)
    hash.update('\0')
    hash.update(files[path])
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 12)
}

export interface SkillVersion {
  version: string
  name: string
  hash: string
  note: string
  date: string | undefined
}

export interface SkillVersions {
  versions: SkillVersion[]
  current: SkillVersion & { changed: boolean }
}

/** Skill versions seen in runs, oldest first, and where the working tree stands. */
export function skillVersions(skillDir: string, runMetas: RunMeta[]): SkillVersions {
  const versions = new Map<string, SkillVersion>()
  for (const meta of runMetas) {
    if (!meta.skillVersion || versions.has(meta.skillVersion)) continue
    versions.set(meta.skillVersion, {
      version: meta.skillVersion,
      name: meta.skillName,
      hash: meta.skillHash,
      note: meta.note,
      date: meta.createdAt.slice(0, 10) || undefined,
    })
  }
  const list = [...versions.values()].sort(
    (a, b) => Number(a.version.slice(1)) - Number(b.version.slice(1)),
  )
  const hash = skillHash(skillFiles(skillDir))
  const match = list.find((v) => v.hash === hash)
  const next = `v${list.reduce((max, v) => Math.max(max, Number(v.version.slice(1))), -1) + 1}`
  return {
    versions: list,
    current: match
      ? { ...match, changed: false }
      : { version: next, name: '', hash, note: '', date: undefined, changed: true },
  }
}

/** Copy SKILL.md and references into `dest` (the run's `_skill/`). */
export function snapshotSkillFiles(skillDir: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of SKILL_FILES) {
    const full = join(skillDir, entry)
    if (existsSync(full)) copyTree(full, join(dest, entry))
  }
}

/**
 * Copy the whole skill except its evals (and junk) into `dest`, for an agent's
 * workspace. Entry by entry: `dest` sits under `evals/`, and `cpSync` refuses
 * a copy into its own subtree even when the filter would skip it.
 */
export function snapshotSkill(skillDir: string, dest: string): void {
  const skip = new Set(['evals', 'node_modules', '.git', '.DS_Store'])
  mkdirSync(dest, { recursive: true })
  for (const name of readdirSync(skillDir)) {
    if (skip.has(name)) continue
    copyTree(join(skillDir, name), join(dest, name))
  }
}
