import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { mergeConfig } from '@core/config.ts'
import type { Rule } from '@core/rules.ts'
import { rulesFromList, rulesFromSkill } from '@core/rules.ts'
import type { BenchConfig, Case, CaseBench, CaseSettings, Grader } from '@core/schemas.ts'
import { readFrontMatter, slug } from '@core/text.ts'
import { scorers } from '@judges/scorers.ts'
import { parseDocument, parse as parseYaml } from 'yaml'
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

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === 'string' ? [value] : []

function parseSettings(front: Record<string, string>): CaseSettings {
  const list = (raw: string | undefined) =>
    raw === undefined ? null : asList(parseYaml(raw) as unknown)
  return {
    tags: list(front.tags) ?? [],
    maxTurns: front.max_turns ? Number(front.max_turns) : null,
    timeoutSeconds: front.timeout_seconds ? Number(front.timeout_seconds) : null,
    allowedTools: list(front.allowed_tools),
  }
}

function readGraders(dir: string): Grader[] {
  return listFiles(dir, (name) => name.endsWith('.md')).flatMap((name) => {
    const raw = readFileSync(join(dir, name), 'utf8')
    if (!raw.startsWith('---')) return []
    const { meta, text } = readFrontMatter(raw)
    return [
      {
        id: name.replace(/\.md$/, ''),
        type: meta.type ?? 'llm',
        focus: meta.focus ?? null,
        weight: Number(meta.weight ?? 1) || 1,
        statement: text,
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
    graders: readGraders(join(dir, 'graders')),
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

/** What the case editor sends. Graders keep their id; a new one has none. */
export interface CaseInput {
  id: string
  title: string
  prompt: string
  expectedOutcome: string
  words: [number, number] | null
  graders: Array<{ id: string | null; statement: string; weight: number }>
}

const CASE_ID = /^[a-z0-9][a-z0-9-]*$/

/**
 * Write a case folder under `evals/cases/<id>/`. Front matter, other
 * `case.yaml` keys and grader settings the editor does not show are kept. A
 * legacy `evals.json` case is written out as a folder, which then wins.
 */
export function saveCase(skillDir: string, input: CaseInput, isNew: boolean): string {
  if (!CASE_ID.test(input.id))
    throw new Error('Use lowercase letters, digits and dashes for the case id, like short-note.')
  if (!input.prompt.trim()) throw new Error('Write the prompt the agent gets.')
  const existing = loadCases(skillDir).find((c) => c.id === input.id)
  if (isNew && existing) throw new Error(`A case called ${input.id} already exists.`)
  const rel = existing?.dir ?? `evals/cases/${input.id}`
  const dir = join(skillDir, rel)
  mkdirSync(join(dir, 'graders'), { recursive: true })

  const promptPath = join(dir, 'prompt.md')
  const front = isFile(promptPath)
    ? (/^---\n[\s\S]*?\n---\n?/.exec(readFileSync(promptPath, 'utf8'))?.[0] ?? '')
    : ''
  writeFileSync(promptPath, `${front ? `${front.trimEnd()}\n\n` : ''}${input.prompt.trim()}\n`)

  const yamlPath = join(dir, 'case.yaml')
  const raw = isFile(yamlPath) ? readFileSync(yamlPath, 'utf8') : ''
  const doc = parseDocument(raw.trim() ? raw : '{}')
  doc.set('title', input.title.trim() || input.id)
  if (input.expectedOutcome.trim()) doc.set('expected_outcome', input.expectedOutcome.trim())
  else doc.delete('expected_outcome')
  if (input.words) {
    const [min, max] = input.words
    if (!(min >= 0 && max >= min))
      throw new Error('The word range needs a minimum below its maximum.')
    const words = doc.createNode([min, max])
    words.flow = true
    doc.setIn(['bench', 'words'], words)
  } else if (doc.hasIn(['bench', 'words'])) doc.deleteIn(['bench', 'words'])
  writeFileSync(yamlPath, doc.toString())

  const graderDir = join(dir, 'graders')
  const kept = new Set<string>()
  const taken = new Set(listFiles(graderDir).map((f) => f.replace(/\.md$/, '')))
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
    const meta = isFile(path) ? readFrontMatter(readFileSync(path, 'utf8')).meta : { type: 'llm' }
    const weight = Number.isFinite(g.weight) && g.weight > 0 ? g.weight : 1
    if (weight === 1) delete meta.weight
    else meta.weight = String(weight)
    const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`)
    writeFileSync(path, `---\n${lines.join('\n')}\n---\n\n${statement}\n`)
    kept.add(id)
  })
  for (const id of taken) if (!kept.has(id)) rmSync(join(graderDir, `${id}.md`))
  return rel
}

/** Remove a case folder. Legacy `evals.json` entries are left to that file. */
export function deleteCase(skillDir: string, id: string): void {
  const found = loadCases(skillDir).find((c) => c.id === id)
  if (!found?.dir) throw new Error('Only folder cases can be deleted here.')
  rmSync(join(skillDir, found.dir), { recursive: true })
}
