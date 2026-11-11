/**
 * Generate a run: one sample directory per case and sample, each the working
 * directory of a headless agent session. The agent sees a copy of the skill
 * (or none, or an older snapshot), the case's input files and the prompt;
 * it writes under `outputs/` and the harness records the transcript, timing
 * and cost beside them.
 *
 * The skill and the cases' input files are copied into the run once, as it
 * starts, and every sample is made from those copies. An edit, a save or a
 * restore while the run is going changes nothing the run reads, so all of its
 * samples answer to the one skill text its version names.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { agentPrompt, OUTPUTS_DIR } from '@domain/prompt.ts'
import { runName, sampleDir } from '@domain/run-name.ts'
import type { Case, Configuration, RunMeta, SampleMeta, Timing } from '@domain/schemas.ts'
import { slug } from '@domain/text.ts'
import { detectArtifacts } from '@infrastructure/artifacts.ts'
import type { Engine } from '@infrastructure/engines/index.ts'
import { isStopping } from '@infrastructure/exec.ts'
import {
  assertInside,
  assertSafe,
  copyTree,
  isFile,
  linkDir,
  today,
  treeFiles,
  writeJson,
} from '@infrastructure/fs.ts'
import { readRunMeta, runDir, versionsOf } from '@infrastructure/runs.ts'
import { skillInfo, snapshotSkill } from '@infrastructure/skill.ts'
import { TranscriptWriter } from '@infrastructure/transcript.ts'

/** One sample of a long task; longer means the session is stuck. */
const SAMPLE_TIMEOUT_MS = 20 * 60 * 1000
/** The longest one sample may be given by a case's `timeout_seconds`. */
const MAX_TIMEOUT_MS = 6 * 60 * 60 * 1000
const MAX_PARALLEL = 3
/** Outputs per case in one run, at most. */
export const MAX_SAMPLES = 10
/**
 * Where a run keeps the copy of each case's input files its samples are made
 * from. Every run made now has the folder, empty when no case has a file, so
 * grading can tell such a run from one made before runs kept a copy.
 */
export const INPUTS_DIR = '_inputs'

/**
 * The run's copy of one of a case's input files, `rel` being its path in the
 * skill, under the run's `inputs` folder. A file under the case's own `files/`
 * keeps its path inside it; one from elsewhere in the skill goes by its name.
 */
export function stagedInput(
  inputs: string,
  testCase: Pick<Case, 'id' | 'dir'>,
  rel: string,
): string {
  const own = testCase.dir ? `${testCase.dir}/files/` : null
  return join(
    inputs,
    testCase.id,
    own && rel.startsWith(own) ? rel.slice(own.length) : basename(rel),
  )
}
const SKILL_DIR = '_skill'
/** What `exec` rejects with once the process has begun to end everything it started. */
const STOPPING = 'Stopping.'

/** How many outputs a run writes per case: a whole number from 1 to `MAX_SAMPLES`. */
export const samplesPerCase = (samples: number): number =>
  Number.isFinite(samples) ? Math.min(MAX_SAMPLES, Math.max(1, Math.floor(samples))) : 1

export interface GenerateOptions {
  skillDir: string
  cases: Case[]
  engine: Engine
  model: string | null
  effort: string | null
  samples: number
  configuration: Configuration
  /** Run whose `_skill/` an `old_skill` run generates against. */
  baselineRun: string | null
  /** Name for the skill version when the working tree is new. */
  skillName: string | null
  note: string
  parallel?: number
  log: (line: string) => void
  /** Called as each output is written, ok or not. */
  onSample?: () => void
  /** Called once the run has its name and its folder, before any agent starts. */
  onNamed?: (name: string) => void
  /** The job was stopped: workers take no more samples and the agents in flight are ended. */
  signal?: AbortSignal
}

interface SkillStamp {
  version: string
  name: string
  hash: string
  note: string
}

/** The version a new run is stamped with. Throws when the tree changed and has no name yet. */
function stampSkill(skillDir: string, skillName: string | null, note: string): SkillStamp {
  const { current } = versionsOf(skillDir)
  if (!current.changed)
    return { version: current.version, name: current.name, hash: current.hash, note: current.note }
  const name = skillName?.trim()
  if (!name)
    throw new Error(
      `The skill changed since the last run. Name this version (${current.version}) to run it.`,
    )
  return { version: current.version, name, hash: current.hash, note }
}

function freshRunName(skillDir: string, base: string): string {
  let name = base
  for (let n = 2; existsSync(runDir(skillDir, name)); n += 1) name = `${base}-${n}`
  return name
}

/** Where the agent finds the skill inside its sample dir, plus the aliases each tool looks in. */
function placeSkill(sampleDir: string, source: string, folder: string): string {
  const rel = `.agents/skills/${folder}`
  snapshotSkill(source, join(sampleDir, rel))
  for (const alias of ['.claude', '.cursor']) {
    mkdirSync(join(sampleDir, alias), { recursive: true })
    const link = join(sampleDir, alias, 'skills')
    if (!existsSync(link)) linkDir('../.agents/skills', link)
  }
  return rel
}

/**
 * Copy each case's input files into the run, once. A file that is missing, or
 * that a link leads out of the skill to, is left out and the log says so.
 */
function stageInputs(
  skillDir: string,
  run: string,
  cases: Case[],
  log: (line: string) => void,
): void {
  const inputs = join(run, INPUTS_DIR)
  mkdirSync(inputs, { recursive: true })
  for (const testCase of cases)
    for (const rel of testCase.files) {
      const source = join(skillDir, rel)
      try {
        if (!isFile(assertInside(skillDir, source))) throw new Error('missing')
      } catch {
        log(`${testCase.id}: input file missing, ${rel}`)
        continue
      }
      const dest = stagedInput(inputs, testCase, rel)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(source, dest)
    }
}

/**
 * The copy of the skill an `old_skill` run is made against, the baseline
 * run's own, and the version that run was stamped with. Throws when no run is
 * named, or the run kept no copy or no record of its version.
 */
function baselineOf(
  skillDir: string,
  baselineRun: string | null,
): { dir: string; stamp: SkillStamp } {
  if (!baselineRun) throw new Error('old_skill needs the run whose copy of the skill to use.')
  const baseline = assertSafe(baselineRun, 'run')
  const dir = join(runDir(skillDir, baseline), SKILL_DIR)
  if (!existsSync(join(dir, 'SKILL.md')))
    throw new Error(`${baseline} keeps no copy of its skill, so no run can be made against it.`)
  const old = readRunMeta(skillDir, baseline)
  if (!old) throw new Error(`${baseline} has no record of the version it ran.`)
  return {
    dir,
    stamp: { version: old.skillVersion, name: old.skillName, hash: old.skillHash, note: old.note },
  }
}

export async function generateRun(
  options: GenerateOptions,
): Promise<{ name: string; dir: string; meta: RunMeta }> {
  const { skillDir, engine, log } = options
  const info = skillInfo(skillDir)
  const configuration = options.configuration
  const baseline = configuration === 'old_skill' ? baselineOf(skillDir, options.baselineRun) : null
  const stamp = baseline ? baseline.stamp : stampSkill(skillDir, options.skillName, options.note)
  const model = options.model?.trim() || engine.defaultModel
  const effort = options.effort || 'default'
  const name = freshRunName(
    skillDir,
    runName({
      date: today(),
      skillVersion: stamp.version,
      engine: engine.id,
      model,
      effort,
      configuration,
    }),
  )
  const dir = runDir(skillDir, name)
  mkdirSync(dir, { recursive: true })
  // The one copy of the skill every sample of this run is made from.
  const snapshot = join(dir, SKILL_DIR)
  if (baseline) copyTree(baseline.dir, snapshot)
  else snapshotSkill(skillDir, snapshot)
  stageInputs(skillDir, dir, options.cases, log)

  const meta: RunMeta = {
    name,
    skillPath: skillDir,
    skillVersion: stamp.version,
    skillName: stamp.name,
    skillHash: stamp.hash,
    note: stamp.note,
    writer: { engine: engine.id, model, effort, harness: engine.harness },
    configuration,
    baselineDir: baseline ? relative(skillDir, baseline.dir) : null,
    cases: options.cases.map((c) => c.id),
    samplesPerCase: samplesPerCase(options.samples),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    samples: [],
  }
  writeJson(join(dir, 'run.json'), meta)
  options.onNamed?.(name)
  log(`${name}: ${options.cases.length} case(s) × ${meta.samplesPerCase} sample(s)`)

  const jobs = options.cases.flatMap((c) =>
    Array.from({ length: meta.samplesPerCase }, (_, i) => ({ testCase: c, index: i + 1 })),
  )
  // The run's own stop: fired by the job's, and by a failure no sample can go on from.
  const stop = new AbortController()
  const stopped = () => stop.abort()
  if (options.signal?.aborted) stop.abort()
  options.signal?.addEventListener('abort', stopped, { once: true })
  let failure: Error | null = null
  const sampleOptions: SampleOptions = {
    runDir: dir,
    engine,
    model,
    effort,
    skillSource: configuration === 'without_skill' ? null : snapshot,
    skillName: info.name,
    // The name is the writer's own text: only a slug of it names a folder.
    skillFolder: slug(info.name) || slug(basename(skillDir)) || 'skill',
    log,
    signal: stop.signal,
  }
  let next = 0
  const worker = async () => {
    while (next < jobs.length && !stop.signal.aborted) {
      const job = jobs[next++]
      const sample = await sampleOrFailure(job.testCase, job.index, sampleOptions)
      // The process is going away and starts nothing more: the run was stopped, the sample never ran.
      if (!sample) {
        stop.abort()
        return
      }
      try {
        meta.samples.push(sample)
        meta.samples.sort((a, b) => a.dir.localeCompare(b.dir, 'en'))
        writeJson(join(dir, 'run.json'), meta)
      } catch (error) {
        // The run has nowhere left to record a sample (its folder moved, the disk
        // is full): every worker stops and the agents in flight are ended.
        failure ??= error as Error
        stop.abort()
        return
      }
      options.onSample?.()
    }
  }
  const parallel = Math.max(1, Math.min(options.parallel ?? MAX_PARALLEL, jobs.length))
  await Promise.all(Array.from({ length: parallel }, worker))
  options.signal?.removeEventListener('abort', stopped)
  if (failure)
    throw new Error(
      `${name} stopped: its folder could not be written to (${(failure as Error).message}).`,
    )
  meta.finishedAt = new Date().toISOString()
  writeJson(join(dir, 'run.json'), meta)
  const wrote = meta.samples.filter((s) => s.ok).length
  log(
    options.signal?.aborted
      ? `${name}: stopped, ${wrote}/${jobs.length} wrote output`
      : `${name}: done, ${wrote}/${meta.samples.length} wrote output`,
  )
  return { name, dir, meta }
}

/**
 * One sample, or, when it fails, the failure as the run records it, so the
 * other workers go on. Null when the process is going away and the sample
 * never ran.
 */
async function sampleOrFailure(
  testCase: Case,
  index: number,
  options: SampleOptions,
): Promise<SampleMeta | null> {
  try {
    return await generateSample(testCase, index, options)
  } catch (error) {
    const message = (error as Error).message
    if (message === STOPPING) return null
    const name = sampleDir(testCase.id, index)
    options.log(`${name}: failed, ${message}`)
    return failedSample(name, testCase.id, index, message)
  }
}

/** A sample that never ran to the end, as the run records it. */
const failedSample = (dir: string, caseId: string, index: number, error: string): SampleMeta => ({
  dir,
  case: caseId,
  index,
  ok: false,
  seconds: 0,
  costUsd: null,
  tokens: null,
  model: null,
  error,
  steps: 0,
  toolCalls: 0,
})

interface SampleOptions {
  runDir: string
  engine: Engine
  model: string
  effort: string
  /** The run's copy of the skill; null for a sample made without it. */
  skillSource: string | null
  skillName: string
  /** The folder the skill sits in inside the sample. */
  skillFolder: string
  log: (line: string) => void
  signal: AbortSignal
}

async function generateSample(
  testCase: Case,
  index: number,
  options: SampleOptions,
): Promise<SampleMeta> {
  const name = sampleDir(testCase.id, index)
  const dir = join(options.runDir, name)
  mkdirSync(join(dir, OUTPUTS_DIR), { recursive: true })
  const staged = join(options.runDir, INPUTS_DIR, testCase.id)
  const files: string[] = []
  for (const { rel, real } of treeFiles(staged)) {
    const dest = join(dir, 'files', rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(real, dest)
    files.push(`files/${rel}`)
  }
  const skillRel = options.skillSource
    ? placeSkill(dir, options.skillSource, options.skillFolder)
    : null
  const prompt = agentPrompt({
    skillName: options.skillName,
    skillRel,
    request: testCase.prompt,
    files,
  })
  writeFileSync(join(dir, 'prompt.md'), `${prompt}\n`)

  const label = `${name} (${options.engine.id} ${options.model})`
  options.log(`${label}: running`)
  const transcript = new TranscriptWriter(join(dir, 'transcript.jsonl'))
  const startedAt = new Date()
  const result = await options.engine.run({
    cwd: dir,
    prompt,
    model: options.model,
    effort: options.effort,
    allowedTools: testCase.settings.allowedTools,
    timeoutMs: Math.min(
      MAX_TIMEOUT_MS,
      testCase.settings.timeoutSeconds
        ? testCase.settings.timeoutSeconds * 1000
        : SAMPLE_TIMEOUT_MS,
    ),
    signal: options.signal,
    transcript,
    log: (line) => options.log(`${label}: ${line}`),
  })
  const finishedAt = new Date()
  const timing: Timing = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    costUsd: result.costUsd,
    tokens: result.tokens,
    model: result.model,
  }
  writeJson(join(dir, 'timing.json'), timing)
  writeJson(join(dir, 'agent.json'), {
    ok: result.ok,
    error: result.error,
    finalText: result.finalText,
  })
  const counts = transcript.counts()
  const ok = detectArtifacts(dir).length > 0
  // Ended by a stop or a quit before it wrote anything: not the skill's failure.
  const stopped = !ok && (options.signal.aborted || isStopping())
  const seconds = Math.round(timing.durationMs / 1000)
  const spend =
    result.costUsd !== null
      ? `, $${result.costUsd.toFixed(result.costUsd < 0.1 ? 4 : 2)}`
      : result.tokens
        ? `, ${result.tokens.input.toLocaleString()} in / ${result.tokens.output.toLocaleString()} out`
        : ''
  options.log(
    stopped
      ? `${label}: stopped before it wrote anything`
      : ok
        ? `${label}: done in ${seconds} s, ${counts.toolCalls} tool calls${spend}${result.error ? ` (${result.error})` : ''}`
        : `${label}: no output written in ${seconds} s. ${result.error ?? ''}`.trim(),
  )
  return {
    dir: name,
    case: testCase.id,
    index,
    ok,
    seconds,
    costUsd: result.costUsd,
    tokens: result.tokens,
    model: result.model,
    error: result.error,
    steps: counts.steps,
    toolCalls: counts.toolCalls,
    ...(stopped ? { stopped: true } : {}),
  }
}
