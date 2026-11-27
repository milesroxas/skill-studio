/**
 * Runs on disk: `<skill>/evals/runs/<run>/`. A run holds `run.json`,
 * `report.json` once graded, a `_skill/` snapshot and one `<case>-s<n>/`
 * directory per sample. Runs from the reference tool keep flat `*.md` files
 * instead of sample dirs and are read as legacy.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { type AnswerCost, gradingCostIn } from '@domain/cost.ts'
import { OUTPUTS_DIR } from '@domain/prompt.ts'
import { parseSampleDir } from '@domain/run-name.ts'
import type {
  Artifact,
  Case,
  Grader,
  Report,
  RunMeta,
  SampleFailure,
  SampleMeta,
  Timing,
  TranscriptEvent,
} from '@domain/schemas.ts'
import { metaList, metaText, readFrontMatter, textIn } from '@domain/text.ts'
import type { FileHead, RunView, Sample, SkillVersions } from '@domain/views.ts'
import { detectArtifacts } from './artifacts.ts'
import { loadCases, loadEveryCase } from './cases.ts'
import { assertInside, isDir, isFile, listDirs, listFiles, present, readJson } from './fs.ts'
import { readKept, runCases } from './run-cases.ts'
import { type SkillTexts, skillIdentity, skillTexts, skillVersions } from './skill.ts'
import { readTranscript } from './transcript.ts'
import { isVersionLabel, savedVersionFile, savedVersionSource, savedVersions } from './versions.ts'
import { asSamplePath, liveWorkdir, workdirsOf } from './workdir.ts'

export const runsDir = (skillDir: string): string => join(skillDir, 'evals/runs')
export const anchorsDir = (skillDir: string): string => join(skillDir, 'evals/anchors')
export const runDir = (skillDir: string, run: string): string => join(runsDir(skillDir), run)
/** Where a run keeps the copy of the skill its samples were made from: what the run is graded on. */
export const skillCopy = (skillDir: string, run: string): string =>
  join(runDir(skillDir, run), '_skill')

/**
 * A file of a sample. A legacy sample is a flat file at the run root, so its
 * name is the file. A link the agent left that leads out of the skill is refused.
 * While the sample's agent works, its files are in its own folder
 * (`liveWorkdir`), and one not in the sample yet is read from there, with a
 * link that leads out of that folder refused.
 */
export function sampleFile(skillDir: string, run: string, sample: string, file: string): string {
  if (sample === file) return assertInside(skillDir, join(runDir(skillDir, run), file))
  const dir = join(runDir(skillDir, run), sample)
  const own = assertInside(skillDir, join(dir, file))
  const work = present(own) ? null : liveWorkdir(dir)
  return work ? assertInside(work, join(work, file)) : own
}

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

type LegacySample = Partial<SampleMeta> & { file?: string }

const FAILURES: readonly SampleFailure[] = [
  'ran out of time',
  'could not start',
  'ended with an error',
]
const isFailure = (value: unknown): value is SampleFailure =>
  FAILURES.includes(value as SampleFailure)
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
    ...(isFailure(s.failed) ? { failed: s.failed } : {}),
    ...(Array.isArray(s.outputs)
      ? { outputs: s.outputs.filter((file) => typeof file === 'string') }
      : {}),
  }
}

/** The samples a `run.json` lists; null when it holds no list of them. An entry that is no record is passed over. */
const listedSamples = (raw: RawMeta | null): SampleMeta[] | null =>
  raw && typeof raw === 'object' && Array.isArray(raw.samples)
    ? raw.samples.filter((s) => s && typeof s === 'object').map(sampleMetaOf)
    : null

const readRaw = (dir: string): RawMeta | null =>
  readRunJson<RawMeta | null>(join(dir, 'run.json'), null)

/**
 * A sample's outputs: the files under `outputs/` the run recorded when its
 * agent ended, those of them still there. A file put there since, such as one
 * a check command builds, is not something the agent wrote. A sample with no
 * record, one still being written or from a run that kept none, is every file
 * under `outputs/`: in the agent's own folder until they are moved into the sample.
 */
function outputsOf(path: string, recorded: string[] | undefined): Artifact[] {
  // While its agent works, a sample's outputs are in the agent's own folder, under the same paths.
  const work = isDir(join(path, OUTPUTS_DIR)) ? null : liveWorkdir(path)
  const found = detectArtifacts(work ?? path)
  if (!recorded) return found
  const wrote = new Set(recorded)
  return found.filter((artifact) => wrote.has(artifact.file))
}

/**
 * The samples of a run directory, in name order. In a run that lists its
 * samples, each is marked with how its agent ended when that was not at its
 * own end (`Sample.cut`): this is the one place that says so, for grading and
 * for Results alike.
 */
export function runSamples(dir: string): Sample[] {
  if (isLegacy(dir))
    return listFiles(dir, isLegacyOutput).map((file) => ({
      name: file,
      path: dir,
      artifacts: [{ file, kind: 'markdown' as const }],
      hasTranscript: false,
      legacy: true,
    }))
  const listed = listedSamples(readRaw(dir))
  const recorded = new Map((listed ?? []).map((s) => [s.dir, s]))
  return listDirs(dir)
    .filter((d) => parseSampleDir(d))
    .map((name) => {
      const path = join(dir, name)
      const record = recorded.get(name)
      const cut = !listed
        ? null
        : !record
          ? 'unlisted'
          : record.stopped
            ? 'stopped'
            : record.failed
              ? 'failed'
              : null
      return {
        name,
        path,
        artifacts: outputsOf(path, record?.outputs),
        hasTranscript: isFile(join(path, 'transcript.jsonl')),
        legacy: false,
        ...(cut ? { cut } : {}),
      }
    })
}

/** A number a hand-edited file holds as one, else null. */
const numberIn = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * What each attempt's answer cost, as its `timing.json` keeps it, in the
 * order of the run's sample folders: null for an attempt with none, as one
 * cut off before its agent ended, a flat file of an old run, or one whose
 * file does not read. A figure the file holds in another shape is read as
 * not kept.
 */
export function answerCosts(skillDir: string, run: string): Array<AnswerCost | null> {
  return runSamples(runDir(skillDir, run)).map((sample) => {
    if (sample.legacy) return null
    const timing = readRunJson<Partial<Record<keyof Timing, unknown>> | null>(
      join(sample.path, 'timing.json'),
      null,
    )
    const ms = numberIn(timing?.durationMs)
    if (!timing || typeof timing !== 'object' || ms === null) return null
    const tokens = timing.tokens as Partial<Record<'input' | 'output', unknown>> | null
    const input = numberIn(tokens?.input)
    const output = numberIn(tokens?.output)
    return {
      seconds: ms / 1000,
      tokens: input === null || output === null ? null : { input, output },
      usd: numberIn(timing.costUsd),
    }
  })
}

/**
 * The samples of a run whose agents ran to their end, which are the ones
 * grading reads, and how many folders were left out: those a stop ended, those
 * that failed (the time limit, an error, an agent that never began), and
 * those the run never recorded, each made for an agent that was cut off (the
 * app quit or crashed). Neither says anything of the skill. A run with no
 * list of its samples, and one of flat files, is graded whole.
 */
export function finishedSamples(
  skillDir: string,
  run: string,
): { samples: Sample[]; unfinished: number } {
  const all = runSamples(runDir(skillDir, run))
  const samples = all.filter((sample) => !sample.cut)
  return { samples, unfinished: all.length - samples.length }
}

/**
 * The skill version a run names. The version is a label (`v3`) or nothing:
 * the file may have been written by anyone, and its version names a folder
 * when the version is deleted. Its name, hash and note are text, and one that
 * is not is none.
 */
function stampOf(raw: RawMeta): Pick<RunMeta, 'skillVersion' | 'skillName' | 'skillHash' | 'note'> {
  const version = textIn(raw.skillVersion)
  return {
    skillVersion: isVersionLabel(version) ? version : '',
    skillName: textIn(raw.skillName),
    skillHash: textIn(raw.skillHash),
    note: textIn(raw.note),
  }
}

/** `run.json` with the legacy shape brought up to `RunMeta`. */
export function readRunMeta(skillDir: string, name: string): RunMeta | null {
  const dir = runDir(skillDir, name)
  const raw = readRaw(dir)
  if (!raw || typeof raw !== 'object') return null
  const legacy = isLegacy(dir)
  const samples = listedSamples(raw) ?? []
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

/**
 * A report as every reader gets it: what its gradings cost (`gradingCost`)
 * checked whole (`gradingCostIn`), and left out where it is in another shape,
 * so it reads as a cost not kept. The report read is shared, so a checked one
 * is a copy.
 */
function checkedReport(report: Report | null): Report | null {
  if (!report || typeof report !== 'object' || !('gradingCost' in report)) return report
  const { gradingCost, ...rest } = report
  const checked = gradingCostIn(gradingCost)
  return checked ? { ...rest, gradingCost: checked } : rest
}

/**
 * A run as every interface reads it. `live` is the skill's cases as they are
 * now, and `every` the checks for every case as they are now, each read once
 * for a list of runs.
 */
export function readRun(
  skillDir: string,
  name: string,
  live: readonly Case[] = loadCases(skillDir),
  every: readonly Grader[] = loadEveryCase(skillDir),
): RunView {
  const dir = runDir(skillDir, name)
  const meta = readRunMeta(skillDir, name)
  // A hand-edited `run.json` may hold anything under `cases`.
  const answered = Array.isArray(meta?.cases)
    ? meta.cases.filter((id) => typeof id === 'string')
    : []
  const { kept, damaged } = readKept(dir, answered)
  return {
    name,
    meta,
    report: checkedReport(readRunJson<Report | null>(join(dir, 'report.json'), null)),
    samples: runSamples(dir),
    hasSkill: isDir(skillCopy(skillDir, name)),
    cases: runCases(skillDir, dir, live, kept, answered, every),
    ...(damaged ? { casesDamaged: true } : {}),
  }
}

/** Every run of the skill. One that cannot be read is left out, with a warning, and the rest are listed. */
export function listRuns(skillDir: string, live: readonly Case[] = loadCases(skillDir)): RunView[] {
  const every = loadEveryCase(skillDir)
  return listDirs(runsDir(skillDir)).flatMap((name) => {
    try {
      return [readRun(skillDir, name, live, every)]
    } catch (error) {
      console.warn(`Run ${name} could not be read: ${(error as Error).message}`)
      return []
    }
  })
}

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

/**
 * The skill's versions (`skillVersions`), each marked `partial` when no copy
 * kept of it holds all it was stamped with. `current` is the files in `tree`,
 * the skill's own by default, or a draft's held against the skill's versions.
 */
export function versionsOf(skillDir: string, tree = skillDir): SkillVersions {
  const metas = runMetas(skillDir)
  const versions = skillVersions(tree, metas, savedVersions(skillDir), (run) =>
    skillCopy(skillDir, run),
  )
  return {
    ...versions,
    versions: versions.versions.map((v) =>
      copyOf(skillDir, v.version, metas)?.whole === false ? { ...v, partial: true } : v,
    ),
  }
}

/**
 * Whether the copy in `dir` holds all a version stamped `hash` holds. A
 * version stamped from SKILL.md and references alone is held whole by a copy
 * of those, whatever else it holds.
 */
function holdsWhole(dir: string, hash: string): boolean {
  try {
    const identity = skillIdentity(dir)
    return identity.hash === hash || identity.files === hash
  } catch {
    return false
  }
}

/**
 * The copy of `version` a run of it is made from, and whether it holds all
 * the version was stamped with: the first of its saved copy and its runs'
 * copies, oldest run first, that holds the whole of it. A saved copy that
 * holds SKILL.md and references only, as one saved by Skill Studio 0.14.0 or
 * earlier does, gives way to a run's copy that holds the rest. With none whole,
 * the saved copy, else the first run's. Null when no copy is kept.
 */
function copyOf(
  skillDir: string,
  version: string,
  metas: RunMeta[] = runMetas(skillDir),
): { dir: string; whole: boolean } | null {
  const saved = savedVersionSource(skillDir, version)
  // A run without the skill tested no version: its copy is of whatever the files were then.
  const runs = metas.filter(
    (meta) =>
      meta.skillVersion === version &&
      meta.configuration !== 'without_skill' &&
      isDir(skillCopy(skillDir, meta.name)),
  )
  const copies = [...(saved ? [saved] : []), ...runs.map((meta) => skillCopy(skillDir, meta.name))]
  if (!copies.length) return null
  const hash = (saved ? savedVersionFile(skillDir, version)?.hash : null) ?? runs[0]?.skillHash
  const whole = hash ? copies.find((dir) => holdsWhole(dir, hash)) : undefined
  return whole ? { dir: whole, whole: true } : { dir: copies[0], whole: false }
}

/**
 * The folder holding a version's files, and whether it holds all the version
 * was stamped with (`copyOf`).
 */
export function versionCopy(skillDir: string, version: string): { dir: string; whole: boolean } {
  const copy = copyOf(skillDir, version)
  if (!copy) throw new Error(`No copy of ${version} is kept: it was neither saved nor run.`)
  return copy
}

/** The folder holding a version's files: the first copy kept of it that holds the whole of it. */
const versionSource = (skillDir: string, version: string): string =>
  versionCopy(skillDir, version).dir

/** A version's files as the editor reads them, from the copy kept of it. */
export const versionFiles = (skillDir: string, version: string): SkillTexts =>
  skillTexts(versionSource(skillDir, version))

/** The files a run was made with, as the editor reads them. */
export const runSkillFiles = (skillDir: string, run: string): SkillTexts =>
  skillTexts(skillCopy(skillDir, run))

export const sampleTranscript = (skillDir: string, run: string, sample: string) =>
  readSampleTranscript(join(runDir(skillDir, run), sample))

/**
 * A sample's transcript, with the paths its agent named in its own folder
 * read as the sample's: the agent worked under the system's temporary folder,
 * and what it did there it did to what is now the sample. A transcript of an
 * agent that worked in the sample itself is read as it is.
 */
export function readSampleTranscript(sampleDir: string): TranscriptEvent[] | null {
  const events = readTranscript(join(sampleDir, 'transcript.jsonl'))
  const workdirs = workdirsOf(sampleDir)
  if (!events || !workdirs.length) return events
  const placed = (text: string | undefined) =>
    text === undefined ? undefined : asSamplePath(text, workdirs, sampleDir)
  return events.map((event) => ({
    ...event,
    ...(event.args !== undefined ? { args: placed(event.args) } : {}),
    ...(event.result !== undefined ? { result: placed(event.result) } : {}),
    ...(event.text !== undefined ? { text: placed(event.text) } : {}),
  }))
}
