import {
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  checkWeight,
  hasTitle,
  newCaseId,
  promptStart,
  sameTitle,
  sizeProblem,
  titleTaken,
  unusedTitle,
} from '@domain/case-draft.ts'
import { mergeConfig } from '@domain/config.ts'
import { type ImageFormat, imageFileName, imageTypeOf } from '@domain/image.ts'
import type { Rule } from '@domain/rules.ts'
import { rulesFromList, rulesFromSkill } from '@domain/rules.ts'
import {
  type BenchConfig,
  type Case,
  type CaseBench,
  type CaseDraft,
  type CaseSettings,
  type Grader,
  isArtifactKind,
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
  isSafeName,
  listDirs,
  listFiles,
  present,
  readJson,
  treeFiles,
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

/** A yes or no as a case file may say it: YAML reads `no` and `off` as words, and whoever wrote one meant no. */
const SAID: Readonly<Record<string, boolean>> = {
  true: true,
  yes: true,
  on: true,
  false: false,
  no: false,
  off: false,
}
const yesOrNo = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  const word = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return Object.hasOwn(SAID, word) ? SAID[word] : undefined
}

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((n) => Number.isFinite(n))

/** What each key of a case's `bench` block must be, in words, and its value read as that; undefined when it is not one. */
const BENCH_KEYS: Readonly<Record<string, { is: string; read: (value: unknown) => unknown }>> = {
  artifact: {
    is: 'markdown, html, image, code or transcript',
    read: (v) => (isArtifactKind(v) ? v : undefined),
  },
  check: {
    is: 'a command line',
    read: (v) => (typeof v === 'string' && v.trim() ? v : undefined),
  },
  // The range a save allows: a least that is not below nothing, and a most not below it.
  words: {
    is: 'a least and a most number of words',
    read: (v) => (isPair(v) && v[0] >= 0 && v[1] >= v[0] ? v : undefined),
  },
  // The size a save allows: a case file edited by hand or by an agent sizes a window too.
  size: {
    is: 'a width and a height in pixels',
    read: (v) => (isPair(v) && !sizeProblem(v) ? v : undefined),
  },
  phone: { is: 'true or false', read: yesOrNo },
  judge: { is: 'true or false', read: yesOrNo },
}

/**
 * A case's `bench` block as every pack can read it with no check of its own.
 * A value of the wrong kind is left out, so its default stands, with a warning
 * naming the case at `where`. A key nothing here knows passes through.
 */
function benchOf(value: unknown, where: string): CaseBench {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const bench: CaseBench = {}
  for (const [key, raw] of Object.entries(value)) {
    const known = Object.hasOwn(BENCH_KEYS, key) ? BENCH_KEYS[key] : null
    const read = known ? known.read(raw) : raw
    if (read !== undefined) bench[key] = read
    else if (raw !== undefined && raw !== null)
      warnOnce(
        `${where}: bench.${key} is ${JSON.stringify(raw)}, which is not ${known?.is}, so it is left out.`,
      )
  }
  return bench
}

/**
 * Whether a folder's name can be a case's id. The id names a folder in every
 * run and is sent back in requests, which take a name of letters, digits,
 * `_`, `.` and `-`; a folder of any other name, one with a space say, is no
 * case, and the warning names it.
 */
function namesCase(skillDir: string, rel: string): boolean {
  if (isSafeName(basename(rel))) return true
  warnOnce(
    `${join(skillDir, rel)} is left out: a case's folder names a folder in every run, so its name may hold only letters, digits, dots, dashes and underscores.`,
  )
  return false
}

/** One skill-creator case folder. Throws when its `case.yaml` cannot be read. */
function loadFolderCase(skillDir: string, rel: string): Case | null {
  const dir = join(skillDir, rel)
  const promptPath = join(dir, 'prompt.md')
  if (!isFile(promptPath) || !namesCase(skillDir, rel)) return null
  const { meta: settings, text: prompt } = readFrontMatter(readFileSync(promptPath, 'utf8'))
  const yamlPath = join(dir, 'case.yaml')
  const read = isFile(yamlPath) ? parseYaml(readFileSync(yamlPath, 'utf8')) : null
  const spec: Record<string, unknown> =
    read && typeof read === 'object' && !Array.isArray(read) ? read : {}
  const name = basename(rel)
  // Folders too: a screen's code often comes as a folder, and the agent gets it as it is laid out.
  const files = treeFiles(join(dir, 'files'), { root: skillDir }).map(
    (f) => `${rel}/files/${f.rel}`,
  )
  return {
    id: name,
    legacyId: null,
    title: typeof spec.title === 'string' ? spec.title : name,
    prompt,
    expectedOutcome: typeof spec.expected_outcome === 'string' ? spec.expected_outcome.trim() : '',
    files,
    graders: readGraders(skillDir, rel),
    settings: parseSettings(settings),
    bench: benchOf(spec.bench, yamlPath),
    source: 'folder',
    dir: rel,
  }
}

const legacyFile = (skillDir: string): string => join(skillDir, 'evals', 'evals.json')

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
  const where = `${legacyFile(skillDir)}: the case ${JSON.stringify(entry.id)}`
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
    bench: benchOf(entry.bench, `${legacyFile(skillDir)}: the case ${JSON.stringify(entry.id)}`),
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
  const legacy = readJson<{ evals?: unknown }>(legacyFile(skillDir), {})
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
    legacyFile(skillDir),
  ]
  return Math.max(0, ...files.map((file) => (isFile(file) ? statSync(file).mtimeMs : 0)))
}

export function countCases(skillDir: string): number {
  const ids = new Set(
    caseFolders(skillDir)
      .filter((rel) => isFile(join(skillDir, rel, 'prompt.md')) && namesCase(skillDir, rel))
      .map((rel) => basename(rel)),
  )
  for (const entry of legacyEntries(skillDir)) {
    const key = legacyKey(skillDir, entry)
    if (key) ids.add(key)
  }
  return ids.size
}

/**
 * A case by key or by legacy numeric id. With `fileName`, `ref` is the name of
 * a legacy flat file, which starts with its case's id (`email-reply-2.md`):
 * of two cases whose ids both lead the name (`email` and `email-reply`), the
 * longer id is the case. Any other name is a case's own or none, so the output
 * of a case since deleted is never taken for a case whose id starts its name.
 */
export function findCase(
  cases: Case[],
  ref: string | null,
  { fileName = false }: { fileName?: boolean } = {},
): Case | null {
  if (!ref) return null
  const named =
    cases.find((c) => c.id === ref) ??
    cases.find((c) => c.legacyId !== null && String(c.legacyId) === ref)
  if (named || !fileName) return named ?? null
  return cases
    .filter((c) => ref.startsWith(`${c.id}-`))
    .reduce<Case | null>((best, c) => (best && best.id.length >= c.id.length ? best : c), null)
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

/**
 * Adherence rules: `bench.json` `rules` when set, else the bullets of the
 * SKILL.md in `dir`, which is the skill's folder or a copy of it a run kept.
 */
export function loadRules(dir: string, config: BenchConfig): Rule[] {
  if (config.rules?.length) return rulesFromList(config.rules)
  const md = join(dir, 'SKILL.md')
  return existsSync(md) ? rulesFromSkill(readFileSync(md, 'utf8')) : []
}

/** Where a save finds what was added to a case and is kept until then: pictures, and picked files and folders. */
export interface Uploads {
  picture: (id: string) => string
  /** The folder that holds the pick under its own name. */
  input: (id: string) => string
}

/** For a caller with no uploads to give, such as one writing a sample case. */
const NO_UPLOADS: Uploads = {
  picture: () => {
    throw new Error('This case names a picture that was never added.')
  },
  input: () => {
    throw new Error('This case names a file that was never added.')
  },
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

/** A case's `case.yaml` to edit, seeded when absent or empty so a new file is a block mapping, like hand-written ones. */
function caseYaml(path: string) {
  const raw = isFile(path) ? readFileSync(path, 'utf8') : ''
  return parseDocument(raw.trim() ? raw : 'title: untitled\n')
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
 * Pictures the agent gets go right in `files/`, beside its other input files
 * and folders, and a check's reference picture in `references/`, named after
 * its check. A picture just added is copied from where `uploads` says it is
 * kept; one the draft no longer lists is removed. A file or folder the draft
 * adds is copied in the same way, in place of one with its name, and one it
 * removes goes. Any other file in `files/`, such as one put there by hand, is
 * left alone.
 *
 * The save is refused before anything is written when the case folder, one
 * of its folders, its prompt, its `case.yaml` or a check it holds is reached
 * through a link that leads out of the skill.
 */
export function saveCase(
  skillDir: string,
  input: CaseDraft,
  isNew: boolean,
  uploads: Uploads = NO_UPLOADS,
  expectedSavedAt?: string | null,
): string {
  if (!isSlug(input.id)) throw new Error(SLUG_RULE)
  if (!input.prompt.trim()) throw new Error('Write a prompt first.')
  if (input.words && !(input.words[0] >= 0 && input.words[1] >= input.words[0]))
    throw new Error('The word range needs a minimum below its maximum.')
  const badSize = sizeProblem(input.size)
  if (badSize) throw new Error(badSize)
  const cases = loadCases(skillDir)
  const existing = cases.find((c) => c.id === input.id)
  if (isNew && existing) throw new Error(`A case called ${input.id} already exists.`)
  // Cases are told apart by title. One kept as it was saves even if another took it by hand since.
  const title = input.title.trim()
  if (!(existing && sameTitle(existing.title, title)) && titleTaken(cases, title, input.id))
    throw new Error(`Another case is called ${title}. Give this one a title of its own.`)
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
  /** A file or folder right in `files/`, by a name the draft gave: one part, and inside the skill. */
  const entry = (name: string): string => {
    if (name.includes('/')) throw new Error(`Bad input file ${name}.`)
    return inside(join(filesDir, assertSafePath(name, 'input file')))
  }
  const removed = (input.removed ?? []).map(entry)
  const added = (input.added ?? []).map((pick) => {
    const source = join(uploads.input(pick.upload), pick.name)
    if (!present(source)) throw new Error(`${pick.name} is no longer kept. Add it again.`)
    return { source, dest: entry(pick.name) }
  })
  const write = (path: string, text: string): void => writeText(path, text, { root: skillDir })
  mkdirSync(graderDir, { recursive: true })

  const front = isFile(promptPath) ? frontMatterBlock(readFileSync(promptPath, 'utf8')) : ''
  write(promptPath, `${front ? `${front.trimEnd()}\n\n` : ''}${input.prompt.trim()}\n`)

  const doc = caseYaml(yamlPath)
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
  // A draft stored before the form held it says nothing of it: the file keeps what it has.
  if (input.artifact) doc.setIn(['bench', 'artifact'], input.artifact)
  else if (input.artifact === null && doc.hasIn(['bench', 'artifact']))
    doc.deleteIn(['bench', 'artifact'])
  const bench = doc.get('bench')
  if (isMap(bench) && !bench.items.length) doc.delete('bench')
  write(yamlPath, doc.toString())

  const wanted = new Set(input.images.flatMap((i) => (i.file ? [basename(i.file)] : [])))
  // Removing a link removes the link alone, never the file it leads to.
  for (const name of listFiles(filesDir))
    if (imageTypeOf(name) && !wanted.has(name)) rmSync(join(filesDir, name))
  for (const image of input.images) {
    if (!image.upload) continue
    const source = uploads.picture(image.upload)
    mkdirSync(filesDir, { recursive: true })
    const base = imageFileName(image.name, formatOf(source))
    let name = base
    for (let n = 2; present(join(filesDir, name)); n += 1)
      name = base.replace(/(\.\w+)$/, `-${n}$1`)
    // A new file, never through a link that was there.
    copyFileSync(source, join(filesDir, name), constants.COPYFILE_EXCL)
  }
  // A file or folder added under a name already there takes its place: picking a screen's folder
  // again brings its copy up to date. Removing a link removes the link alone.
  for (const path of removed) rmSync(path, { recursive: true, force: true })
  for (const { source, dest } of added) {
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(filesDir, { recursive: true })
    cpSync(source, dest, { recursive: true })
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
      const source = uploads.picture(g.image.upload)
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

/**
 * Copy a folder case whole, prompt, checks, pictures and files, to a new
 * folder under `evals/cases/`, and return its id. The copy is titled after the
 * case with "copy" after it, and a number after that when a case has that title.
 *
 * The copy is made in a hidden folder beside the others and moved into place
 * in one step, so a half-made copy is never read as a case, and a name taken
 * meanwhile, here or by another program, is passed over for the next. A link
 * is copied as the file or folder it leads to, so editing the copy never
 * changes the case it came from; one that leads out of the skill is left out.
 */
export function duplicateCase(skillDir: string, id: string): string {
  const cases = loadCases(skillDir)
  const found = cases.find((c) => c.id === id)
  if (!found?.dir) throw new Error('Only folder cases can be duplicated here.')
  const source = assertInside(skillDir, join(skillDir, found.dir))
  const parent = assertInside(skillDir, join(skillDir, 'evals', 'cases'))
  mkdirSync(parent, { recursive: true })
  const staging = join(parent, `.${id}.copy-${process.pid}-${Date.now()}`)
  const inside = (path: string): boolean => {
    try {
      assertInside(skillDir, path)
      return true
    } catch {
      return false
    }
  }
  // An untitled case is named by its prompt: the copy takes that as its title, so the two differ.
  const named = hasTitle(found) ? found.title.trim() : promptStart(found.prompt) || id
  const title = unusedTitle(cases, `${named} copy`)
  const taken = cases.map((c) => c.id)
  try {
    cpSync(source, staging, { recursive: true, dereference: true, filter: inside })
    const yamlPath = join(staging, 'case.yaml')
    const doc = caseYaml(yamlPath)
    doc.set('title', title)
    writeText(yamlPath, doc.toString())
    for (;;) {
      const copy = newCaseId({ title, prompt: '' }, taken)
      const dest = join(parent, copy)
      if (present(dest)) {
        taken.push(copy)
        continue
      }
      try {
        renameSync(staging, dest)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error
        taken.push(copy)
        continue
      }
      return copy
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
