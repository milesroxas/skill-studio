import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, extname, join } from 'node:path'
import { checkWeight, sizeProblem } from '@domain/case-draft.ts'
import { mergeConfig } from '@domain/config.ts'
import { type ImageFormat, imageFileName, imageTypeOf } from '@domain/image.ts'
import type { Rule } from '@domain/rules.ts'
import { rulesFromList, rulesFromSkill } from '@domain/rules.ts'
import type {
  BenchConfig,
  Case,
  CaseBench,
  CaseDraft,
  CaseSettings,
  Grader,
} from '@domain/schemas.ts'
import {
  frontMatterBlock,
  isSlug,
  metaList,
  metaText,
  readFrontMatter,
  SLUG_RULE,
  slug,
} from '@domain/text.ts'
import { scorers } from '@judges/scorers.ts'
import { isMap, parseDocument, parse as parseYaml, stringify as toYaml } from 'yaml'
import {
  assertInside,
  assertSafePath,
  isFile,
  listDirs,
  listFiles,
  present,
  readJson,
  writeJson,
  writeText,
} from './fs.ts'

/** `evals/` entries that are never case folders. */
const RESERVED = new Set([
  'runs',
  'anchors',
  'files',
  'results',
  'mocks',
  'cases',
  'node_modules',
  'reviews',
  'benchmarks',
])

/** A positive number from front matter; null when absent or not a positive number. */
const positive = (front: Record<string, unknown>, key: string): number | null => {
  const value = Number(metaText(front, key) ?? Number.NaN)
  return Number.isFinite(value) && value > 0 ? value : null
}

function parseSettings(front: Record<string, unknown>): CaseSettings {
  return {
    tags: metaList(front, 'tags') ?? [],
    maxTurns: positive(front, 'max_turns'),
    timeoutSeconds: positive(front, 'timeout_seconds'),
    allowedTools: metaList(front, 'allowed_tools'),
  }
}

/** Where a case keeps the pictures its checks are about, beside `graders/`. */
const REFERENCES = 'references'

/** True when a check's `image` names a file there is, by a path that stays in the case folder. */
function isCasePicture(skillDir: string, rel: string, image: string): boolean {
  try {
    assertSafePath(image, 'picture')
    return isFile(assertInside(skillDir, join(skillDir, rel, image)))
  } catch {
    return false
  }
}

/** The graders of the case folder at `rel`, each with its reference picture when the file is there. */
function readGraders(skillDir: string, rel: string): Grader[] {
  const dir = join(skillDir, rel, 'graders')
  return listFiles(dir, (name) => name.endsWith('.md')).flatMap((name) => {
    const raw = readFileSync(join(dir, name), 'utf8')
    if (!raw.startsWith('---')) return []
    const { meta, text } = readFrontMatter(raw)
    const image = metaText(meta, 'image')
    return [
      {
        id: name.replace(/\.md$/, ''),
        type: metaText(meta, 'type') ?? 'llm',
        focus: metaText(meta, 'focus'),
        // Held to the range the form offers, so a file written by hand scores as it shows.
        weight: checkWeight(positive(meta, 'weight')) ?? 1,
        statement: text,
        image: image && isCasePicture(skillDir, rel, image) ? `${rel}/${image}` : null,
      },
    ]
  })
}

/** Each warning once a session: the cases are read again every few seconds while a run goes on. */
const warned = new Set<string>()
const warnOnce = (message: string): void => {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(message)
}

/** The entries of `value` that are paths inside the skill; one that could climb out of it is dropped. */
function safePaths(value: unknown, what: string): string[] {
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    try {
      return [assertSafePath(typeof entry === 'string' ? entry : null, what)]
    } catch {
      warnOnce(`A case names ${what} ${JSON.stringify(entry)}, which is not a path in the skill.`)
      return []
    }
  })
}

/**
 * A case's `bench` block. Its evidence files are held to paths inside the
 * skill, and a size to the one a save allows: a case file edited by hand or
 * by an agent sizes a window too, so a size that could not be saved is dropped.
 */
function benchOf(value: unknown): CaseBench {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const { size, phone, ...bench } = value as CaseBench
  const sized = Array.isArray(size) && size.length === 2 && !sizeProblem(size)
  if (size !== undefined && !sized)
    warnOnce(
      `A case asks for the size ${JSON.stringify(size)}, which is not a width and a height in pixels.`,
    )
  return {
    ...bench,
    ...(sized ? { size } : {}),
    ...(typeof phone === 'boolean' ? { phone } : {}),
    ...(bench.evidence === undefined
      ? {}
      : { evidence: safePaths(bench.evidence, 'the evidence file') }),
  }
}

/** One skill-creator case folder. Throws when its `case.yaml` cannot be read. */
function loadFolderCase(skillDir: string, rel: string): Case | null {
  const dir = join(skillDir, rel)
  const promptPath = join(dir, 'prompt.md')
  if (!isFile(promptPath)) return null
  const { meta: settings, text: prompt } = readFrontMatter(readFileSync(promptPath, 'utf8'))
  const yamlPath = join(dir, 'case.yaml')
  const read = isFile(yamlPath) ? parseYaml(readFileSync(yamlPath, 'utf8')) : null
  const spec: Record<string, unknown> =
    read && typeof read === 'object' && !Array.isArray(read) ? read : {}
  const name = basename(rel)
  const files = listFiles(join(dir, 'files')).map((f) => `${rel}/files/${f}`)
  return {
    id: name,
    legacyId: null,
    title: typeof spec.title === 'string' ? spec.title : name,
    prompt,
    expectedOutcome: typeof spec.expected_outcome === 'string' ? spec.expected_outcome.trim() : '',
    files,
    graders: readGraders(skillDir, rel),
    settings: parseSettings(settings),
    bench: benchOf(spec.bench),
    source: 'folder',
    dir: rel,
  }
}

interface LegacyEval {
  id: number | string
  name?: string
  eval_name?: string
  title?: string
  prompt: string
  expected_output?: string
  files?: string[]
  expectations?: string[]
  assertions?: string[]
  bench?: CaseBench
}

/**
 * The key of a legacy `evals.json` entry: `<id>-<name>`, the shape the
 * reference's runs use. The key names a folder in every run, so an entry whose
 * key is not a slug, or that has no prompt, is not a case: null, with a
 * warning naming the entry.
 */
function legacyKey(skillDir: string, entry: LegacyEval): string | null {
  if (!entry || typeof entry !== 'object') return null
  const label = slug(String(entry.name ?? entry.eval_name ?? entry.title ?? ''))
  const id = label ? `${entry.id}-${label}` : String(entry.id)
  const where = `${join(skillDir, 'evals', 'evals.json')}: the case ${JSON.stringify(entry.id)}`
  if (typeof entry.prompt !== 'string') {
    warnOnce(`${where} has no prompt, so it is left out.`)
    return null
  }
  if (!isSlug(id)) {
    warnOnce(`${where} is left out: its name, ${id}, names a folder in every run. ${SLUG_RULE}`)
    return null
  }
  return id
}

/** A legacy `evals.json` entry as a case; null when it is not one. Its files are held to paths inside the skill. */
function fromLegacy(skillDir: string, entry: LegacyEval): Case | null {
  const id = legacyKey(skillDir, entry)
  if (!id) return null
  const expectations = (entry.expectations ?? entry.assertions ?? []).filter(
    (statement): statement is string => typeof statement === 'string',
  )
  return {
    id,
    legacyId: entry.id,
    title: String(entry.title ?? entry.eval_name ?? entry.name ?? id),
    prompt: entry.prompt,
    expectedOutcome: typeof entry.expected_output === 'string' ? entry.expected_output : '',
    files: safePaths(entry.files, 'the input file'),
    graders: expectations.map((statement, i) => ({
      id: `${String(i + 1).padStart(2, '0')}-${slug(statement, 32)}`,
      type: 'llm',
      focus: null,
      weight: 1,
      statement,
      image: null,
    })),
    settings: { tags: [], maxTurns: null, timeoutSeconds: null, allowedTools: null },
    bench: benchOf(entry.bench),
    source: 'evals.json',
    dir: null,
  }
}

/** The folders that may hold a case: under `evals/cases/`, then directly under `evals/`. */
const caseFolders = (skillDir: string): string[] => {
  const evals = join(skillDir, 'evals')
  return [
    ...listDirs(join(evals, 'cases')).map((d) => `evals/cases/${d}`),
    ...listDirs(evals)
      .filter((d) => !RESERVED.has(d))
      .map((d) => `evals/${d}`),
  ]
}

/** The entries of `evals.json`; none when the file is absent or holds no list. */
function legacyEntries(skillDir: string): LegacyEval[] {
  const legacy = readJson<{ evals?: unknown }>(join(skillDir, 'evals', 'evals.json'), {})
  return Array.isArray(legacy?.evals) ? (legacy.evals as LegacyEval[]) : []
}

/**
 * Every case folder under `evals/cases/` or directly under `evals/`, plus
 * every `evals.json` entry whose key is not already a folder. A case that
 * cannot be read is left out with a warning naming its file, so one bad
 * `case.yaml` never hides the skill's other cases.
 */
export function loadCases(skillDir: string): Case[] {
  const cases: Case[] = []
  const seen = new Set<string>()
  for (const rel of caseFolders(skillDir)) {
    let loaded: Case | null
    try {
      loaded = loadFolderCase(skillDir, rel)
    } catch (error) {
      warnOnce(`${join(skillDir, rel)} could not be read as a case: ${(error as Error).message}`)
      continue
    }
    if (loaded && !seen.has(loaded.id)) {
      seen.add(loaded.id)
      cases.push(loaded)
    }
  }
  for (const entry of legacyEntries(skillDir)) {
    const loaded = fromLegacy(skillDir, entry)
    if (!loaded || seen.has(loaded.id)) continue
    seen.add(loaded.id)
    cases.push(loaded)
  }
  return cases
}

/**
 * How many cases the skill has, without reading one: the folders that hold a
 * prompt, and the `evals.json` entries that are cases and are not already a
 * folder. For a list of many skills, where parsing every case of every skill
 * would be the whole cost.
 */
/** The newest change to any case's prompt, or to `evals.json`, in ms; 0 with no cases. */
export function casesChanged(skillDir: string): number {
  const files = [
    ...caseFolders(skillDir).map((rel) => join(skillDir, rel, 'prompt.md')),
    join(skillDir, 'evals', 'evals.json'),
  ]
  return Math.max(0, ...files.map((file) => (isFile(file) ? statSync(file).mtimeMs : 0)))
}

export function countCases(skillDir: string): number {
  const ids = new Set(
    caseFolders(skillDir)
      .filter((rel) => isFile(join(skillDir, rel, 'prompt.md')))
      .map((rel) => basename(rel)),
  )
  for (const entry of legacyEntries(skillDir)) {
    const key = legacyKey(skillDir, entry)
    if (key) ids.add(key)
  }
  return ids.size
}

/**
 * A case by key, by legacy numeric id, or by the `<id>-...` prefix of a legacy
 * file name. Of two cases whose ids both lead the name (`email` and
 * `email-reply` for `email-reply-2.md`), the longer id is the case.
 */
export function findCase(cases: Case[], ref: string | null): Case | null {
  if (!ref) return null
  return (
    cases.find((c) => c.id === ref) ??
    cases.find((c) => c.legacyId !== null && String(c.legacyId) === ref) ??
    cases
      .filter((c) => ref.startsWith(`${c.id}-`))
      .reduce<Case | null>((best, c) => (best && best.id.length >= c.id.length ? best : c), null)
  )
}

export const benchPath = (skillDir: string): string => join(skillDir, 'evals/bench.json')

/** `evals/bench.json` over the defaults of the active packs. */
export const loadBench = (skillDir: string): BenchConfig =>
  mergeConfig(readJson<Partial<BenchConfig>>(benchPath(skillDir), {}), scorers)

/**
 * Set the packs a skill is graded as. Every other key of `bench.json` is
 * written back as the file holds it now, values out of range and keys nothing
 * reads included: the file is the reader's, and only `packs` is the app's to
 * change. A file that holds no object is replaced.
 */
export function savePacks(skillDir: string, packs: string[]): void {
  const file = benchPath(skillDir)
  const held = readJson<unknown>(file, {})
  const kept = held && typeof held === 'object' && !Array.isArray(held) ? held : {}
  writeJson(file, { ...kept, packs })
}

/** Adherence rules: `bench.json` `rules` when set, else SKILL.md's bullets. */
export function loadRules(skillDir: string, config: BenchConfig): Rule[] {
  if (config.rules?.length) return rulesFromList(config.rules)
  const md = join(skillDir, 'SKILL.md')
  return existsSync(md) ? rulesFromSkill(readFileSync(md, 'utf8')) : []
}

/** Text of an evidence or input file, by skill-relative path; null when missing. */
export const readSkillFile = (skillDir: string, rel: string): string | null => {
  const full = join(skillDir, rel)
  if (!isFile(full)) return null
  try {
    return readFileSync(assertInside(skillDir, full), 'utf8')
  } catch {
    // A path or a link that leads out of the skill is not one of its files.
    return null
  }
}

/** For a caller with no uploads to give, such as one writing a sample case. */
const noUploads = (): never => {
  throw new Error('This case names a picture that was never added.')
}

/** The format of a kept picture, from its file name. */
const formatOf = (path: string): ImageFormat =>
  extname(path).toLowerCase() === '.png' ? 'png' : 'jpg'

/**
 * When a case folder was last written: the newest change to its prompt, its
 * `case.yaml` or one of its checks, as an ISO time. Null when it holds none of
 * them. What a form loads beside the case and gives back to `saveCase`, so a
 * save over a newer one is refused.
 */
export function caseSavedAt(skillDir: string, rel: string): string | null {
  const dir = join(skillDir, rel)
  const graders = join(dir, 'graders')
  const files = [
    join(dir, 'prompt.md'),
    join(dir, 'case.yaml'),
    ...listFiles(graders, (name) => name.endsWith('.md')).map((name) => join(graders, name)),
  ]
  let latest = Number.NEGATIVE_INFINITY
  for (const file of files) if (isFile(file)) latest = Math.max(latest, statSync(file).mtimeMs)
  return Number.isFinite(latest) ? new Date(latest).toISOString() : null
}

/**
 * Write a case folder under `evals/cases/<id>/`. Front matter, other
 * `case.yaml` keys and grader settings the editor does not show are kept. A
 * legacy `evals.json` case is written out as a folder, which then wins.
 *
 * `expectedSavedAt` is the `caseSavedAt` the form loaded. Given, the save is
 * refused when the folder was written since, so a stale form never writes over
 * a newer save; left out, no check is made. A legacy `evals.json` case has no
 * folder to check.
 *
 * Pictures the agent gets go in `files/`, beside any other input file, and a
 * check's reference picture in `references/`, named after its check. A picture
 * just added is copied from where `uploadPath` says its upload is; one the
 * draft no longer lists is removed.
 *
 * The save is refused before anything is written when the case folder, one
 * of its folders, its prompt, its `case.yaml` or a check it holds is reached
 * through a link that leads out of the skill.
 */
export function saveCase(
  skillDir: string,
  input: CaseDraft,
  isNew: boolean,
  uploadPath: (id: string) => string = noUploads,
  expectedSavedAt?: string | null,
): string {
  if (!isSlug(input.id)) throw new Error(SLUG_RULE)
  if (!input.prompt.trim()) throw new Error('Write the prompt the agent gets.')
  if (input.words && !(input.words[0] >= 0 && input.words[1] >= input.words[0]))
    throw new Error('The word range needs a minimum below its maximum.')
  const badSize = sizeProblem(input.size)
  if (badSize) throw new Error(badSize)
  const existing = loadCases(skillDir).find((c) => c.id === input.id)
  if (isNew && existing) throw new Error(`A case called ${input.id} already exists.`)
  if (!isNew && expectedSavedAt != null) {
    if (!existing) throw new Error(`Case ${input.id} was deleted on disk. Reload to see it.`)
    if (existing.dir && caseSavedAt(skillDir, existing.dir) !== expectedSavedAt)
      throw new Error(`Case ${input.id} changed on disk since you opened it. Reload to see it.`)
  }
  const rel = existing?.dir ?? `evals/cases/${input.id}`
  // Every folder and file read, written or deleted below, checked before the first write: a link
  // that leads out of the skill must not have a picture deleted, or a file written, somewhere else.
  const inside = (path: string): string => assertInside(skillDir, path)
  const dir = inside(join(skillDir, rel))
  const promptPath = inside(join(dir, 'prompt.md'))
  const yamlPath = inside(join(dir, 'case.yaml'))
  const graderDir = inside(join(dir, 'graders'))
  const filesDir = inside(join(dir, 'files'))
  const referenceDir = inside(join(dir, REFERENCES))
  const taken = new Set(
    listFiles(graderDir, (f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')),
  )
  for (const id of taken) inside(join(graderDir, `${id}.md`))
  const write = (path: string, text: string): void => writeText(path, text, { root: skillDir })
  mkdirSync(graderDir, { recursive: true })

  const front = isFile(promptPath) ? frontMatterBlock(readFileSync(promptPath, 'utf8')) : ''
  write(promptPath, `${front ? `${front.trimEnd()}\n\n` : ''}${input.prompt.trim()}\n`)

  const raw = isFile(yamlPath) ? readFileSync(yamlPath, 'utf8') : ''
  // Seeded so a new file is a block mapping, like hand-written ones.
  const doc = parseDocument(raw.trim() ? raw : 'title: untitled\n')
  doc.set('title', input.title.trim() || input.id)
  if (input.expectedOutcome.trim()) doc.set('expected_outcome', input.expectedOutcome.trim())
  else doc.delete('expected_outcome')
  if (input.words) {
    const words = doc.createNode(input.words)
    words.flow = true
    doc.setIn(['bench', 'words'], words)
  } else if (doc.hasIn(['bench', 'words'])) doc.deleteIn(['bench', 'words'])
  if (input.size) {
    const size = doc.createNode(input.size)
    size.flow = true
    doc.setIn(['bench', 'size'], size)
  } else if (doc.hasIn(['bench', 'size'])) doc.deleteIn(['bench', 'size'])
  if (input.phone) doc.setIn(['bench', 'phone'], true)
  else if (doc.hasIn(['bench', 'phone'])) doc.deleteIn(['bench', 'phone'])
  const bench = doc.get('bench')
  if (isMap(bench) && !bench.items.length) doc.delete('bench')
  write(yamlPath, doc.toString())

  const wanted = new Set(input.images.flatMap((i) => (i.file ? [basename(i.file)] : [])))
  // Removing a link removes the link alone, never the file it leads to.
  for (const name of listFiles(filesDir))
    if (imageTypeOf(name) && !wanted.has(name)) rmSync(join(filesDir, name))
  for (const image of input.images) {
    if (!image.upload) continue
    const source = uploadPath(image.upload)
    mkdirSync(filesDir, { recursive: true })
    const base = imageFileName(image.name, formatOf(source))
    let name = base
    for (let n = 2; present(join(filesDir, name)); n += 1)
      name = base.replace(/(\.\w+)$/, `-${n}$1`)
    // A new file, never through a link that was there.
    copyFileSync(source, join(filesDir, name), constants.COPYFILE_EXCL)
  }

  const references = new Set<string>()
  const kept = new Set<string>()
  input.graders.forEach((g, index) => {
    const statement = g.statement.trim()
    if (!statement) return
    let id = g.id && taken.has(g.id) ? g.id : null
    if (!id) {
      const base = `${String(index + 1).padStart(2, '0')}-${slug(statement, 32) || 'check'}`
      id = base
      for (let n = 2; taken.has(id) || kept.has(id); n += 1) id = `${base}-${n}`
    }
    const path = join(graderDir, `${id}.md`)
    const meta: Record<string, unknown> = isFile(path)
      ? readFrontMatter(readFileSync(path, 'utf8')).meta
      : { type: 'llm' }
    const weight = checkWeight(g.weight) ?? 1
    if (weight === 1) delete meta.weight
    else meta.weight = weight
    if (g.image?.upload) {
      const source = uploadPath(g.image.upload)
      mkdirSync(referenceDir, { recursive: true })
      const name = `${id}.${formatOf(source)}`
      // The check's picture replaces whatever had its name, a link included, and writes through none.
      rmSync(join(referenceDir, name), { force: true })
      copyFileSync(source, join(referenceDir, name), constants.COPYFILE_EXCL)
      meta.image = `${REFERENCES}/${name}`
    } else if (!g.image) delete meta.image
    if (typeof meta.image === 'string') references.add(basename(meta.image))
    const fields = Object.keys(meta).length ? toYaml(meta) : ''
    write(path, `---\n${fields}---\n\n${statement}\n`)
    kept.add(id)
  })
  for (const id of taken) if (!kept.has(id)) rmSync(join(graderDir, `${id}.md`))
  for (const name of listFiles(referenceDir))
    if (!references.has(name)) rmSync(join(referenceDir, name))
  return rel
}

/** Remove a case folder. Legacy `evals.json` entries are left to that file. */
export function deleteCase(skillDir: string, id: string): void {
  const found = loadCases(skillDir).find((c) => c.id === id)
  if (!found?.dir) throw new Error('Only folder cases can be deleted here.')
  rmSync(assertInside(skillDir, join(skillDir, found.dir)), { recursive: true })
}
