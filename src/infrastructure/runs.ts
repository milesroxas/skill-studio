/**
 * Runs on disk: `<skill>/evals/runs/<run>/`. A run holds `run.json`,
 * `report.json` once graded, a `_skill/` snapshot and one `<case>-s<n>/`
 * directory per sample. Runs from the reference tool keep flat `*.md` files
 * instead of sample dirs and are read as legacy.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseSampleDir } from '@domain/run-name.ts'
import type { Report, RunMeta, SampleMeta } from '@domain/schemas.ts'
import { metaList, metaText, readFrontMatter } from '@domain/text.ts'
import type { FileHead, RunView, Sample } from '@domain/views.ts'
import { detectArtifacts } from './artifacts.ts'
import { assertInside, isDir, isFile, listDirs, listFiles, readJson } from './fs.ts'
import { skillFiles, skillVersions } from './skill.ts'
import { readTranscript } from './transcript.ts'
import { isVersionLabel, savedVersionSource, savedVersions } from './versions.ts'

const runsDir = (skillDir: string): string => join(skillDir, 'evals/runs')
export const anchorsDir = (skillDir: string): string => join(skillDir, 'evals/anchors')
export const runDir = (skillDir: string, run: string): string => join(runsDir(skillDir), run)

/**
 * A file of a sample. A legacy sample is a flat file at the run root, so its
 * name is the file. A link the agent left that leads out of the skill is refused.
 */
export const sampleFile = (skillDir: string, run: string, sample: string, file: string): string =>
  assertInside(
    skillDir,
    sample === file ? join(runDir(skillDir, run), file) : join(runDir(skillDir, run), sample, file),
  )

export function readHead(path: string): FileHead {
  const { meta } = readFrontMatter(readFileSync(path, 'utf8'))
  return {
    case: metaText(meta, 'case'),
    label: metaText(meta, 'label'),
    tests: metaList(meta, 'tests') ?? [],
  }
}

const isLegacyOutput = (file: string): boolean => file.endsWith('.md') && !file.startsWith('_')

/** A file's size, times and inode: a file written again, or replaced, changes one of them. */
type Print = { size: number; mtimeMs: number; ctimeMs: number; ino: number }
const samePrint = (a: Print, b: Print): boolean =>
  a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.ino === b.ino

/** What a run's JSON files last parsed to, by path, with the print they had then. */
const parsed = new Map<string, { print: Print; value: unknown }>()
/** More files than any one skill's runs hold; past it the oldest readings go. */
const PARSED_KEPT = 2000

/**
 * A run's JSON file, or `fallback` when it is missing or cannot be read: one
 * bad run must not hide the rest. A file that has not changed since it was
 * last read is not parsed again, so listing a skill's runs costs a `stat` per
 * file. What comes back is shared: callers read it and never change it.
 */
function readRunJson<T>(path: string, fallback: T): T {
  let print: Print
  try {
    const { size, mtimeMs, ctimeMs, ino } = statSync(path)
    print = { size, mtimeMs, ctimeMs, ino }
  } catch {
    parsed.delete(path)
    return fallback
  }
  const held = parsed.get(path)
  if (held && samePrint(held.print, print)) return held.value as T
  try {
    const value = readJson<T>(path, fallback)
    if (parsed.size >= PARSED_KEPT)
      for (const key of [...parsed.keys()].slice(0, 500)) parsed.delete(key)
    parsed.set(path, { print, value })
    return value
  } catch (error) {
    console.warn((error as Error).message)
    return fallback
  }
}

const isLegacy = (dir: string): boolean =>
  !listDirs(dir).some((d) => parseSampleDir(d)) && listFiles(dir, isLegacyOutput).length > 0

/** The samples of a run directory, in name order. */
export function runSamples(dir: string): Sample[] {
  if (isLegacy(dir))
    return listFiles(dir, isLegacyOutput).map((file) => ({
      name: file,
      path: dir,
      artifacts: [{ file, kind: 'markdown' as const }],
      hasTranscript: false,
      legacy: true,
    }))
  return listDirs(dir)
    .filter((d) => parseSampleDir(d))
    .map((name) => {
      const path = join(dir, name)
      return {
        name,
        path,
        artifacts: detectArtifacts(path),
        hasTranscript: isFile(join(path, 'transcript.jsonl')),
        legacy: false,
      }
    })
}

type LegacySample = Partial<SampleMeta> & { file?: string }
type RawMeta = Partial<Omit<RunMeta, 'samples'>> & { samples?: LegacySample[] }

/** A sample as `run.json` lists it, the legacy shape brought up to `SampleMeta`. */
function sampleMetaOf(s: LegacySample, i: number): SampleMeta {
  const sampleName = s.dir ?? s.file ?? `s${i + 1}`
  const parsedName = parseSampleDir(sampleName)
  return {
    dir: sampleName,
    case: s.case ?? parsedName?.case ?? '',
    index: s.index ?? parsedName?.index ?? i + 1,
    ok: s.ok ?? true,
    seconds: s.seconds ?? 0,
    costUsd: s.costUsd ?? null,
    tokens: s.tokens ?? null,
    model: s.model ?? null,
    error: s.error ?? null,
    steps: s.steps ?? 0,
    toolCalls: s.toolCalls ?? 0,
    ...(s.stopped === true ? { stopped: true } : {}),
  }
}

/**
 * The skill version a run names. The version is a label (`v3`) or nothing:
 * the file may have been written by anyone, and its version names a folder
 * when the version is deleted.
 */
function stampOf(raw: RawMeta): Pick<RunMeta, 'skillVersion' | 'skillName' | 'skillHash' | 'note'> {
  const version = typeof raw.skillVersion === 'string' ? raw.skillVersion : ''
  return {
    skillVersion: isVersionLabel(version) ? version : '',
    skillName: raw.skillName ?? '',
    skillHash: raw.skillHash ?? '',
    note: raw.note ?? '',
  }
}

/** `run.json` with the legacy shape brought up to `RunMeta`. */
export function readRunMeta(skillDir: string, name: string): RunMeta | null {
  const dir = runDir(skillDir, name)
  const raw = readRunJson<RawMeta | null>(join(dir, 'run.json'), null)
  if (!raw || typeof raw !== 'object') return null
  const legacy = isLegacy(dir)
  const samples = (Array.isArray(raw.samples) ? raw.samples : []).map(sampleMetaOf)
  return {
    name,
    skillPath: raw.skillPath ?? skillDir,
    ...stampOf(raw),
    writer: raw.writer ?? { engine: 'unknown', model: null, effort: null, harness: 'agent' },
    configuration: raw.configuration ?? 'with_skill',
    baselineDir: raw.baselineDir ?? null,
    cases: raw.cases ?? [...new Set(samples.map((s) => s.case).filter(Boolean))],
    samplesPerCase: raw.samplesPerCase ?? 1,
    createdAt: raw.createdAt ?? '',
    finishedAt: raw.finishedAt ?? null,
    samples,
    ...(legacy ? { legacy: true } : {}),
  }
}

export function readRun(skillDir: string, name: string): RunView {
  const dir = runDir(skillDir, name)
  return {
    name,
    meta: readRunMeta(skillDir, name),
    report: readRunJson<Report | null>(join(dir, 'report.json'), null),
    samples: runSamples(dir),
    hasSkill: isDir(join(dir, '_skill')),
  }
}

/** Every run of the skill. One that cannot be read is left out, with a warning, and the rest are listed. */
export const listRuns = (skillDir: string): RunView[] =>
  listDirs(runsDir(skillDir)).flatMap((name) => {
    try {
      return [readRun(skillDir, name)]
    } catch (error) {
      console.warn(`Run ${name} could not be read: ${(error as Error).message}`)
      return []
    }
  })

const runMetas = (skillDir: string): RunMeta[] =>
  listDirs(runsDir(skillDir)).flatMap((name) => {
    const meta = readRunMeta(skillDir, name)
    return meta ? [meta] : []
  })

/** The runs made with `version`, by name. */
export const runsOfVersion = (skillDir: string, version: string): string[] =>
  runMetas(skillDir)
    .filter((meta) => meta.skillVersion === version)
    .map((meta) => meta.name)

export const versionsOf = (skillDir: string) =>
  skillVersions(skillDir, runMetas(skillDir), savedVersions(skillDir))

/** The folder holding a version's files: its saved copy, or else the snapshot of the first run made with it. */
export function versionSource(skillDir: string, version: string): string {
  const saved = savedVersionSource(skillDir, version)
  if (saved) return saved
  const run = runMetas(skillDir).find(
    (meta) => meta.skillVersion === version && isDir(join(runDir(skillDir, meta.name), '_skill')),
  )
  if (!run) throw new Error(`No copy of ${version} is kept: it was neither saved nor run.`)
  return join(runDir(skillDir, run.name), '_skill')
}

/** A version's SKILL.md and references, as text. */
export const versionFiles = (skillDir: string, version: string): Record<string, string> =>
  skillFiles(versionSource(skillDir, version))

/** The SKILL.md and references a run was made with, as text. */
export const runSkillFiles = (skillDir: string, run: string): Record<string, string> =>
  skillFiles(join(runDir(skillDir, run), '_skill'))

export const sampleTranscript = (skillDir: string, run: string, sample: string) =>
  readTranscript(join(runDir(skillDir, run), sample, 'transcript.jsonl'))
