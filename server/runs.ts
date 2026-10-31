/**
 * Runs on disk: `<skill>/evals/runs/<run>/`. A run holds `run.json`,
 * `report.json` once graded, a `_skill/` snapshot and one `<case>-s<n>/`
 * directory per sample. Runs from the reference tool keep flat `*.md` files
 * instead of sample dirs and are read as legacy.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSampleDir } from '@core/run-name.ts'
import type { Artifact, Report, RunMeta, SampleMeta } from '@core/schemas.ts'
import { readFrontMatter } from '@core/text.ts'
import { detectArtifacts } from './artifacts.ts'
import { isDir, isFile, listDirs, listFiles, readJson } from './fs.ts'
import { skillVersions } from './skill.ts'
import { readTranscript } from './transcript.ts'

export const runsDir = (skillDir: string): string => join(skillDir, 'evals/runs')
export const anchorsDir = (skillDir: string): string => join(skillDir, 'evals/anchors')
export const runDir = (skillDir: string, run: string): string => join(runsDir(skillDir), run)

/** A file of a sample. A legacy sample is a flat file at the run root, so its name is the file. */
export const sampleFile = (skillDir: string, run: string, sample: string, file: string): string =>
  sample === file ? join(runDir(skillDir, run), file) : join(runDir(skillDir, run), sample, file)

/** One output as the grader and the UI see it. */
export interface Sample {
  /** Sample dir name, or the legacy file name. */
  name: string
  /** Absolute dir holding the artifacts: the sample dir, or the run dir for a legacy file. */
  path: string
  artifacts: Artifact[]
  hasTranscript: boolean
  legacy: boolean
}

/** Front matter fields of a legacy output or an anchor. */
export interface FileHead {
  case: string | null
  label: string | null
  tests: string[]
}

export function readHead(path: string): FileHead {
  const { meta } = readFrontMatter(readFileSync(path, 'utf8'))
  return {
    case: meta.case ?? null,
    label: meta.label ?? null,
    tests: meta.tests ? meta.tests.split(/,\s*/).filter(Boolean) : [],
  }
}

const isLegacyOutput = (file: string): boolean => file.endsWith('.md') && !file.startsWith('_')

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

/** `run.json` with the legacy shape brought up to `RunMeta`. */
export function readRunMeta(skillDir: string, name: string): RunMeta | null {
  const dir = runDir(skillDir, name)
  type LegacySample = Partial<SampleMeta> & { file?: string }
  type RawMeta = Partial<Omit<RunMeta, 'samples'>> & { samples?: LegacySample[] }
  const raw = readJson<RawMeta | null>(join(dir, 'run.json'), null)
  if (!raw) return null
  const legacy = isLegacy(dir)
  const samples: SampleMeta[] = (raw.samples ?? []).map((s, i) => {
    const sampleName = s.dir ?? s.file ?? `s${i + 1}`
    const parsed = parseSampleDir(sampleName)
    return {
      dir: sampleName,
      case: s.case ?? parsed?.case ?? '',
      index: s.index ?? parsed?.index ?? i + 1,
      ok: s.ok ?? true,
      seconds: s.seconds ?? 0,
      costUsd: s.costUsd ?? null,
      tokens: s.tokens ?? null,
      model: s.model ?? null,
      error: s.error ?? null,
      steps: s.steps ?? 0,
      toolCalls: s.toolCalls ?? 0,
    }
  })
  return {
    name,
    skillPath: raw.skillPath ?? skillDir,
    skillVersion: raw.skillVersion ?? '',
    skillName: raw.skillName ?? '',
    skillHash: raw.skillHash ?? '',
    note: raw.note ?? '',
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

export interface RunView {
  name: string
  meta: RunMeta | null
  report: Report | null
  samples: Sample[]
  hasSkill: boolean
}

export function readRun(skillDir: string, name: string): RunView {
  const dir = runDir(skillDir, name)
  return {
    name,
    meta: readRunMeta(skillDir, name),
    report: readJson<Report | null>(join(dir, 'report.json'), null),
    samples: runSamples(dir),
    hasSkill: isDir(join(dir, '_skill')),
  }
}

export const listRuns = (skillDir: string): RunView[] =>
  listDirs(runsDir(skillDir)).map((name) => readRun(skillDir, name))

const runMetas = (skillDir: string): RunMeta[] =>
  listDirs(runsDir(skillDir)).flatMap((name) => {
    const meta = readRunMeta(skillDir, name)
    return meta ? [meta] : []
  })

export const versionsOf = (skillDir: string) => skillVersions(skillDir, runMetas(skillDir))

export const sampleTranscript = (skillDir: string, run: string, sample: string) =>
  readTranscript(join(runDir(skillDir, run), sample, 'transcript.jsonl'))

export interface AnchorInfo extends FileHead {
  file: string
}

export const anchorList = (skillDir: string): AnchorInfo[] =>
  listFiles(anchorsDir(skillDir), (f) => f.endsWith('.md')).map((file) => ({
    file,
    ...readHead(join(anchorsDir(skillDir), file)),
  }))
