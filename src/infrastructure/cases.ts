import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { checkWeight } from '@domain/case-draft.ts'
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
import { isFile, listDirs, listFiles, readJson } from './fs.ts'

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
        image: image && isFile(join(skillDir, rel, image)) ? `${rel}/${image}` : null,
      },
    ]
  })
}

const benchOf = (value: unknown): CaseBench =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as CaseBench) : {}

/** One skill-creator case folder. */
function loadFolderCase(skillDir: string, rel: string): Case | null {
  const dir = join(skillDir, rel)
  const promptPath = join(dir, 'prompt.md')
  if (!isFile(promptPath)) return null
  const { meta: settings, text: prompt } = readFrontMatter(readFileSync(promptPath, 'utf8'))
  const yamlPath = join(dir, 'case.yaml')
  const spec = isFile(yamlPath)
    ? ((parseYaml(readFileSync(yamlPath, 'utf8')) ?? {}) as Record<string, unknown>)
    : {}
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

/** A legacy `evals.json` entry. The key is `<id>-<name>`, the shape the reference's runs use. */
function fromLegacy(entry: LegacyEval): Case {
  const label = slug(entry.name ?? entry.eval_name ?? entry.title ?? '')
  const id = label ? `${entry.id}-${label}` : String(entry.id)
  const expectations = entry.expectations ?? entry.assertions ?? []
  return {
    id,
    legacyId: entry.id,
    title: entry.title ?? entry.eval_name ?? entry.name ?? id,
    prompt: entry.prompt,
    expectedOutcome: entry.expected_output ?? '',
    files: entry.files ?? [],
    graders: expectations.map((statement, i) => ({
      id: `${String(i + 1).padStart(2, '0')}-${slug(statement, 32)}`,
      type: 'llm',
      focus: null,
      weight: 1,
      statement,
      image: null,
    })),
    settings: { tags: [], maxTurns: null, timeoutSeconds: null, allowedTools: null },
    bench: entry.bench ?? {},
    source: 'evals.json',
    dir: null,
  }
}

/**
 * Every case folder under `evals/cases/` or directly under `evals/`, plus
 * every `evals.json` entry whose key is not already a folder.
 */
export function loadCases(skillDir: string): Case[] {
  const evals = join(skillDir, 'evals')
  const cases: Case[] = []
  const seen = new Set<string>()
  const candidates = [
    ...listDirs(join(evals, 'cases')).map((d) => `evals/cases/${d}`),
    ...listDirs(evals)
      .filter((d) => !RESERVED.has(d))
      .map((d) => `evals/${d}`),
  ]
  for (const rel of candidates) {
    const loaded = loadFolderCase(skillDir, rel)
    if (loaded && !seen.has(loaded.id)) {
      seen.add(loaded.id)
      cases.push(loaded)
    }
  }
  const legacy = readJson<{ evals?: LegacyEval[] }>(join(evals, 'evals.json'), {})
  for (const entry of legacy.evals ?? []) {
    const loaded = fromLegacy(entry)
    if (seen.has(loaded.id)) continue
    seen.add(loaded.id)
    cases.push(loaded)
  }
  return cases
}

/** A case by key, by legacy numeric id, or by the `<id>-...` prefix of a file name. */
export function findCase(cases: Case[], ref: string | null): Case | null {
  if (!ref) return null
  return (
    cases.find((c) => c.id === ref) ??
    cases.find((c) => c.legacyId !== null && String(c.legacyId) === ref) ??
    cases.find((c) => ref.startsWith(`${c.id}-`)) ??
    null
  )
}

export const benchPath = (skillDir: string): string => join(skillDir, 'evals/bench.json')

/** `evals/bench.json` over the defaults of the active packs. */
export const loadBench = (skillDir: string): BenchConfig =>
  mergeConfig(readJson<Partial<BenchConfig>>(benchPath(skillDir), {}), scorers)

/** Adherence rules: `bench.json` `rules` when set, else SKILL.md's bullets. */
export function loadRules(skillDir: string, config: BenchConfig): Rule[] {
  if (config.rules?.length) return rulesFromList(config.rules)
  const md = join(skillDir, 'SKILL.md')
  return existsSync(md) ? rulesFromSkill(readFileSync(md, 'utf8')) : []
}

/** Text of an evidence or input file, by skill-relative path; null when missing. */
export const readSkillFile = (skillDir: string, rel: string): string | null => {
  const full = join(skillDir, rel)
  return isFile(full) ? readFileSync(full, 'utf8') : null
}

/** For a caller with no uploads to give, such as one writing a sample case. */
const noUploads = (): never => {
  throw new Error('This case names a picture that was never added.')
}

/** The format of a kept picture, from its file name. */
const formatOf = (path: string): ImageFormat =>
  extname(path).toLowerCase() === '.png' ? 'png' : 'jpg'

/**
 * Write a case folder under `evals/cases/<id>/`. Front matter, other
 * `case.yaml` keys and grader settings the editor does not show are kept. A
 * legacy `evals.json` case is written out as a folder, which then wins.
 *
 * Pictures the agent gets go in `files/`, beside any other input file, and a
 * check's reference picture in `references/`, named after its check. A picture
 * just added is copied from where `uploadPath` says its upload is; one the
 * draft no longer lists is removed.
 */
export function saveCase(
  skillDir: string,
  input: CaseDraft,
  isNew: boolean,
  uploadPath: (id: string) => string = noUploads,
): string {
  if (!isSlug(input.id)) throw new Error(SLUG_RULE)
  if (!input.prompt.trim()) throw new Error('Write the prompt the agent gets.')
  if (input.words && !(input.words[0] >= 0 && input.words[1] >= input.words[0]))
    throw new Error('The word range needs a minimum below its maximum.')
  const existing = loadCases(skillDir).find((c) => c.id === input.id)
  if (isNew && existing) throw new Error(`A case called ${input.id} already exists.`)
  const rel = existing?.dir ?? `evals/cases/${input.id}`
  const dir = join(skillDir, rel)
  mkdirSync(join(dir, 'graders'), { recursive: true })

  const promptPath = join(dir, 'prompt.md')
  const front = isFile(promptPath) ? frontMatterBlock(readFileSync(promptPath, 'utf8')) : ''
  writeFileSync(promptPath, `${front ? `${front.trimEnd()}\n\n` : ''}${input.prompt.trim()}\n`)

  const yamlPath = join(dir, 'case.yaml')
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
  const bench = doc.get('bench')
  if (isMap(bench) && !bench.items.length) doc.delete('bench')
  writeFileSync(yamlPath, doc.toString())

  const filesDir = join(dir, 'files')
  const wanted = new Set(input.images.flatMap((i) => (i.file ? [basename(i.file)] : [])))
  for (const name of listFiles(filesDir))
    if (imageTypeOf(name) && !wanted.has(name)) rmSync(join(filesDir, name))
  for (const image of input.images) {
    if (!image.upload) continue
    const source = uploadPath(image.upload)
    mkdirSync(filesDir, { recursive: true })
    const base = imageFileName(image.name, formatOf(source))
    let name = base
    for (let n = 2; existsSync(join(filesDir, name)); n += 1)
      name = base.replace(/(\.\w+)$/, `-${n}$1`)
    copyFileSync(source, join(filesDir, name))
  }

  const graderDir = join(dir, 'graders')
  const referenceDir = join(dir, REFERENCES)
  const references = new Set<string>()
  const kept = new Set<string>()
  const taken = new Set(
    listFiles(graderDir, (f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')),
  )
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
      copyFileSync(source, join(referenceDir, name))
      meta.image = `${REFERENCES}/${name}`
    } else if (!g.image) delete meta.image
    if (typeof meta.image === 'string') references.add(basename(meta.image))
    const fields = Object.keys(meta).length ? toYaml(meta) : ''
    writeFileSync(path, `---\n${fields}---\n\n${statement}\n`)
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
  rmSync(join(skillDir, found.dir), { recursive: true })
}
