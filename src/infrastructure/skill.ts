import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { isEditablePath, isWithin } from '@domain/paths.ts'
import type { RunMeta } from '@domain/schemas.ts'
import { type SkillStart, templateBody, templateById } from '@domain/templates.ts'
import { metaText, readFrontMatter } from '@domain/text.ts'
import type { SkillInfo, SkillVersion, SkillVersions } from '@domain/views.ts'
import { stringify as toYaml } from 'yaml'
import {
  assertInside,
  assertSafePath,
  isDir,
  isFile,
  readTree,
  realOf,
  realPath,
  treeFiles,
  writeJson,
  writeText,
} from './fs.ts'

/** The files a writer edits and a version restores: SKILL.md and every reference. */
const SKILL_FILES = ['SKILL.md', 'references']

/**
 * Folders an agent's copy of the skill never holds, at any depth: installed
 * packages and caches, heavy and made again from the files beside them.
 * Hidden names (`.git`, `.venv`, a restore's or a write's leftovers) are left
 * out as well, and `evals/` at the top. The version's hash covers exactly what
 * the copy holds, so it leaves out the same.
 */
const NEVER_COPIED = new Set(['node_modules', 'venv', '__pycache__'])
const passedOver = (name: string): boolean => NEVER_COPIED.has(name)

/** A skill's name and description from its SKILL.md; the folder's name when it gives none. */
export function skillHead(skillDir: string): { name: string; description: string } {
  const { meta } = readFrontMatter(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'))
  return {
    name: metaText(meta, 'name') || basename(skillDir),
    description: metaText(meta, 'description') ?? '',
  }
}

export function skillInfo(skillDir: string): SkillInfo {
  const path = realPath(resolve(skillDir))
  if (!existsSync(join(path, 'SKILL.md'))) throw new Error(`No SKILL.md at ${path}.`)
  return { path, ...skillHead(path) }
}

/** Where SKILL.md and each file under references/ is, by skill-relative path. */
function skillFilePaths(skillDir: string): Array<{ rel: string; real: string }> {
  return SKILL_FILES.flatMap((entry) => {
    const full = join(skillDir, entry)
    if (!existsSync(full)) return []
    if (!isDir(full)) return [{ rel: entry, real: full }]
    return treeFiles(full, { root: skillDir, skip: passedOver }).map((file) => ({
      ...file,
      rel: `${entry}/${file.rel}`,
    }))
  })
}

/** SKILL.md and references/**, keyed by skill-relative path. A link that leaves the skill is not read. */
export function skillFiles(skillDir: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of SKILL_FILES) {
    const full = join(skillDir, entry)
    if (!existsSync(full)) continue
    if (isDir(full)) {
      const tree = readTree(full, undefined, { root: skillDir, skip: passedOver })
      for (const [path, text] of Object.entries(tree)) files[`${entry}/${path}`] = text
    } else files[entry] = readFileSync(full, 'utf8')
  }
  return files
}

/** A skill-relative path the editor may write: SKILL.md or a file under references/. */
export function editablePath(path: string): string {
  assertSafePath(path, 'path')
  if (isEditablePath(path)) return path
  throw new Error('Only SKILL.md and files under references/ can be edited.')
}

/** Where an editable path is on disk. Refused when a link on the way leads out of the skill. */
const editableFile = (skillDir: string, path: string): string =>
  assertInside(skillDir, join(skillDir, editablePath(path)))

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
  const full = editableFile(skillDir, path)
  const current = isFile(full) ? readFileSync(full, 'utf8') : null
  if (current !== previous)
    throw new Error(
      current === null
        ? `${path} was deleted on disk. Reload to see it.`
        : previous === null
          ? `${path} already exists.`
          : `${path} changed on disk since you opened it. Reload to see it.`,
    )
  writeText(full, text, { root: skillDir })
}

/** Remove the folders under references/ that hold nothing, and references/ itself when it is empty. */
function pruneEmpty(skillDir: string, from: string): void {
  for (let dir = from; dir !== skillDir && dir.startsWith(skillDir); dir = dirname(dir)) {
    if (!isDir(dir) || readdirSync(dir).length) break
    rmdirSync(dir)
  }
}

/** Delete one reference file. SKILL.md cannot be deleted. */
export function deleteSkillFile(skillDir: string, path: string): void {
  if (editablePath(path) === 'SKILL.md') throw new Error('SKILL.md cannot be deleted.')
  const full = editableFile(skillDir, path)
  if (!isFile(full)) throw new Error(`No ${path}.`)
  rmSync(full)
  pruneEmpty(skillDir, dirname(full))
}

/**
 * Scaffold a new skill: SKILL.md from a template, with front matter, and an
 * empty evals/cases/. A template with judge packs beyond the default writes
 * them to evals/bench.json, so grading fits the kind of skill from the start.
 */
export function newSkill(
  skillDir: string,
  name: string,
  description: string,
  template: SkillStart = templateById('blank'),
): string {
  const path = resolve(skillDir)
  const md = join(path, 'SKILL.md')
  if (existsSync(md)) throw new Error(`${md} already exists.`)
  mkdirSync(join(path, 'evals', 'cases'), { recursive: true })
  const front = toYaml({ name, description: description || template.description })
  writeText(md, `---\n${front}---\n\n${templateBody(template, name)}`)
  if (template.packs.some((p) => p !== 'generic'))
    writeJson(join(path, 'evals', 'bench.json'), { packs: template.packs })
  return md
}

/** A hash of every file's path and text. Same text, same hash. */
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

/** A file of a skill: its path in the skill, and where its bytes are. */
type SkillFile = { rel: string; real: string }

/**
 * What an agent gets beside SKILL.md and references/: scripts, assets and any
 * other file of the skill, in name order. A link is followed while it stays in
 * the skill. `folder` is told each folder by its real path before it is read.
 */
function otherFiles(skillDir: string, folder?: (real: string) => void): SkillFile[] {
  const base = realOf(skillDir)
  if (!base) return []
  folder?.(base)
  return readdirSync(skillDir)
    .filter(
      (name) =>
        !name.startsWith('.') &&
        name !== 'evals' &&
        !passedOver(name) &&
        !SKILL_FILES.includes(name),
    )
    .sort()
    .flatMap((name) => {
      const full = join(skillDir, name)
      const real = realOf(full)
      // A link that leads out of the skill, or to nothing, is not the skill's.
      if (!real || !isWithin(real, base)) return []
      if (!isDir(real)) return [{ rel: name, real }]
      return treeFiles(full, { root: skillDir, skip: passedOver, folder }).map((file) => ({
        ...file,
        rel: `${name}/${file.rel}`,
      }))
    })
}

/** The last look at a skill's other files: the folders read, with their times then, and what was found. */
interface Look {
  folders: Array<[real: string, mtimeMs: number]>
  /** Every folder had last changed well before it was read, so a time that has not moved means the same entries. */
  settled: boolean
  files: SkillFile[]
  /** Each file's size, times and inode, as the hash was taken. */
  print: string
  hash: string
}
const looks = new Map<string, Look>()

/** A folder changed this close to being read may change again within the same tick of a coarse clock (FAT's is 2 s). */
const CLOCK_STEP_MS = 2000

const mtimeOf = (path: string): number => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return Number.NaN
  }
}

/** Walk the skill's other files, noting each folder's time as it is read. */
function lookAt(skillDir: string): Pick<Look, 'folders' | 'settled' | 'files'> {
  const at = Date.now()
  const folders: Array<[string, number]> = []
  const files = otherFiles(skillDir, (real) => folders.push([real, mtimeOf(real)]))
  return { folders, files, settled: folders.every(([, time]) => time < at - CLOCK_STEP_MS) }
}

const printOf = (files: SkillFile[]): string =>
  files
    .map(({ rel, real }) => {
      const stat = statSync(real)
      return `${rel}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`
    })
    .join('\n')

/**
 * A hash of the skill's other files; null when there are none. The skill is
 * walked again only when a folder in it has changed since the last look, and
 * a file's bytes are read again only when its size, times or inode have.
 */
function otherFilesHash(skillDir: string, fresh = false): string | null {
  const held = looks.get(skillDir)
  const reuse =
    !fresh && held?.settled && held.folders.every(([real, time]) => mtimeOf(real) === time)
  const look = reuse && held ? held : lookAt(skillDir)
  if (!look.files.length) {
    looks.delete(skillDir)
    return null
  }
  let print: string
  try {
    print = printOf(look.files)
  } catch (error) {
    // A file went after the look that listed it: look again, once.
    if (reuse) return otherFilesHash(skillDir, true)
    throw error
  }
  let hash = held?.print === print ? held.hash : null
  if (!hash) {
    const sum = createHash('sha256')
    for (const { rel, real } of look.files) {
      sum.update(rel)
      sum.update('\0')
      sum.update(readFileSync(real))
      sum.update('\0')
    }
    hash = sum.digest('hex')
  }
  looks.set(skillDir, { ...look, print, hash })
  return hash
}

/**
 * The skill's identity: a hash of everything an agent's copy holds. `files`
 * is the hash of SKILL.md and references/ alone, which is the whole identity
 * of a skill with nothing else in it, and what a version was stamped with
 * before the other files were counted.
 */
export function skillIdentity(skillDir: string): { hash: string; files: string } {
  const files = skillHash(skillFiles(skillDir))
  const others = otherFilesHash(skillDir)
  if (!others) return { hash: files, files }
  return {
    hash: createHash('sha256').update(`${files}\0${others}`).digest('hex').slice(0, 16),
    files,
  }
}

/**
 * The skill's versions, oldest first: those saved by hand, then any known only
 * from runs. The working tree is the version stamped with its hash, when saved
 * or by any run, or else the next number, marked changed.
 *
 * A version stamped from SKILL.md and references/ alone, before the other
 * files were counted, cannot say which scripts and assets it had. It is taken
 * for the working tree only while it is the newest version and nothing has
 * stamped it whole, and the hash handed back is the whole one, so the next
 * run stamps it and a later change to a script is a new version.
 */
export function skillVersions(
  skillDir: string,
  runMetas: RunMeta[],
  saved: SkillVersion[] = [],
): SkillVersions {
  const versions = new Map<string, SkillVersion>(saved.map((v) => [v.version, v]))
  const stamps = new Map<string, Set<string>>()
  const stamp = (version: string, hash: string): void => {
    if (!hash) return
    const held = stamps.get(version) ?? new Set<string>()
    stamps.set(version, held.add(hash))
  }
  for (const v of saved) stamp(v.version, v.hash)
  for (const meta of runMetas) {
    if (!meta.skillVersion) continue
    stamp(meta.skillVersion, meta.skillHash)
    if (versions.has(meta.skillVersion)) continue
    versions.set(meta.skillVersion, {
      version: meta.skillVersion,
      name: meta.skillName,
      hash: meta.skillHash,
      note: meta.note,
      date: meta.createdAt.slice(0, 10) || undefined,
      saved: false,
    })
  }
  const list = [...versions.values()].sort(
    (a, b) => Number(a.version.slice(1)) - Number(b.version.slice(1)),
  )
  const stampsOf = (v: SkillVersion | undefined): Set<string> =>
    (v && stamps.get(v.version)) || new Set()
  const { hash, files } = skillIdentity(skillDir)
  const newest = list.at(-1)
  const filesOnly = stampsOf(newest)
  const match =
    list.find((v) => stampsOf(v).has(hash)) ??
    (filesOnly.size === 1 && filesOnly.has(files) ? newest : undefined)
  const next = `v${list.reduce((max, v) => Math.max(max, Number(v.version.slice(1))), -1) + 1}`
  return {
    versions: list,
    current: match
      ? { ...match, hash, changed: false }
      : {
          version: next,
          name: '',
          hash,
          note: '',
          date: undefined,
          saved: false,
          changed: true,
        },
  }
}

/** One rename a restore made: `from` is where the file was, `mine` when it is one of the writer's files. */
interface Moved {
  rel: string
  from: string
  to: string
  mine: boolean
}

/** "a to b, and c to d": the moves that would put each file back. */
const moveBack = (moves: Array<{ from: string; to: string }>): string =>
  moves.map(({ from, to }) => `${to} to ${from}`).join(', and ')

/** Take back every move, the newest first, going on past one that fails; the moves that could not be taken back. */
const takeBack = (moved: Moved[]): Moved[] =>
  [...moved].reverse().filter(({ from, to }) => {
    try {
      mkdirSync(dirname(from), { recursive: true })
      renameSync(to, from)
      return false
    } catch {
      return true
    }
  })

/**
 * What a restore that stopped partway and could not put every file back
 * throws: where the writer's own files are kept (`kept`) and what to move
 * where, and which of the version's files are left over and can go.
 */
function stoppedPartway(error: Error, kept: string, mine: Moved[], left: string[]): Error {
  return new Error(
    [
      `The restore stopped partway (${error.message}), and some files could not be put back.`,
      mine.length
        ? `Nothing of yours is lost: your files are in ${kept}. Move ${moveBack(mine)}.`
        : '',
      left.length ? `${left.join(' and ')} came from the version and can be deleted.` : '',
    ]
      .filter(Boolean)
      .join(' '),
    { cause: error },
  )
}

/**
 * Make the skill's SKILL.md and references/ exactly those in `source`, a
 * folder holding a version's copy. Bytes are copied, never read as text, so a
 * picture or a PDF comes back as it was. All or nothing: every path is checked
 * and every file copied beside the skill before one of the skill's own is
 * touched, and a failure after that puts each file back where it was. When a
 * file cannot be put back, the folder holding the writer's files is kept and
 * the error says what to move where.
 */
export function restoreSkillFiles(skillDir: string, source: string): void {
  const incoming = skillFilePaths(source)
  if (!incoming.some((file) => file.rel === 'SKILL.md'))
    throw new Error('That version has no SKILL.md.')
  const wanted = new Map(incoming.map((file) => [file.rel, editableFile(skillDir, file.rel)]))
  const current = skillFilePaths(skillDir).map((file) => ({
    rel: file.rel,
    path: editableFile(skillDir, file.rel),
  }))

  // A name of its own, so a folder an earlier restore had to keep is never taken for this one's.
  const stage = mkdtempSync(join(skillDir, '.restore-'))
  let keep = false
  const moved: Moved[] = []
  const move = (rel: string, from: string, to: string, mine: boolean): void => {
    mkdirSync(dirname(to), { recursive: true })
    renameSync(from, to)
    moved.push({ rel, from, to, mine })
  }
  try {
    copyFiles(incoming, join(stage, 'new'))
    try {
      for (const file of current) move(file.rel, file.path, join(stage, 'old', file.rel), true)
      for (const [rel, path] of wanted) move(rel, join(stage, 'new', rel), path, false)
    } catch (error) {
      const stuck = takeBack(moved)
      const mine = stuck.filter((m) => m.mine)
      // A file of the version is still in the skill only where the writer had none: theirs went back over it.
      const had = new Set(current.map((file) => file.rel))
      const left = stuck.filter((m) => !m.mine && !had.has(m.rel)).map((m) => m.to)
      if (!mine.length && !left.length) throw error
      keep = mine.length > 0
      throw stoppedPartway(error as Error, join(stage, 'old'), mine, left)
    }
  } finally {
    if (keep) rmSync(join(stage, 'new'), { recursive: true, force: true })
    else rmSync(stage, { recursive: true, force: true })
  }
  for (const file of current) if (!wanted.has(file.rel)) pruneEmpty(skillDir, dirname(file.path))
}

/** Copy each file to its skill-relative path under `dest`. */
function copyFiles(files: SkillFile[], dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const { rel, real } of files) {
    const to = join(dest, rel)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(real, to)
  }
}

/** Copy SKILL.md and references into `dest` (a saved version's `files/`), as `skillFiles` reads them. */
export function snapshotSkillFiles(skillDir: string, dest: string): void {
  copyFiles(skillFilePaths(skillDir), dest)
}

/**
 * Copy what an agent gets of the skill into `dest`: a run's `_skill/`, or an
 * agent's workspace. Its files are read as the version's hash reads them, so
 * the copy holds exactly what the version names: SKILL.md, and beside it
 * every file but those under `evals/` or a folder in `NEVER_COPIED`, hidden
 * ones and those a link out of the skill leads to.
 */
export function snapshotSkill(skillDir: string, dest: string): void {
  copyFiles([...skillFilePaths(skillDir), ...otherFiles(skillDir)], dest)
}
