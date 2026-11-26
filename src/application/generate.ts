/**
 * Generate a run: one sample directory per case and sample, each what one
 * headless agent session made. The agent works in a folder of its own under
 * the system's temporary folder (`makeWorkdir`), where it sees a copy of the
 * skill (or none, or an older snapshot), the case's input files and the
 * prompt; it writes under `outputs/`, and when it ends everything it made is
 * moved into the sample's directory, where the harness has kept the prompt,
 * the transcript, timing and cost from the start.
 *
 * The skill, the cases and their input files are copied into the run once, as
 * it starts, and every sample is made from those copies. An edit, a save or a
 * restore while the run is going changes nothing the run reads, so all of its
 * samples answer to the one skill text its version names, and each case's
 * outputs to the one prompt the run kept.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { isWithin } from '@domain/paths.ts'
import { agentPrompt, OUTPUTS_DIR, SCRATCH_DIR } from '@domain/prompt.ts'
import { runName, sampleDir } from '@domain/run-name.ts'
import type {
  Case,
  Configuration,
  RunMeta,
  SampleFailure,
  SampleMeta,
  Timing,
} from '@domain/schemas.ts'
import { slug } from '@domain/text.ts'
import { detectArtifacts } from '@infrastructure/artifacts.ts'
import { loadEveryCase } from '@infrastructure/cases.ts'
import type { Engine } from '@infrastructure/engines/index.ts'
import type { EngineResult } from '@infrastructure/engines/types.ts'
import { isStopping } from '@infrastructure/exec.ts'
import {
  assertInside,
  assertSafe,
  copyTree,
  isFile,
  linkDir,
  present,
  realPath,
  today,
  treeFiles,
  writeJson,
} from '@infrastructure/fs.ts'
import { takeStampLock } from '@infrastructure/grading-lock.ts'
import { keepCases } from '@infrastructure/run-cases.ts'
import {
  readRunMeta,
  runDir,
  runsDir,
  skillCopy,
  versionCopy,
  versionsOf,
} from '@infrastructure/runs.ts'
import { skillHead, skillInfo, snapshotSkill } from '@infrastructure/skill.ts'
import { TranscriptWriter } from '@infrastructure/transcript.ts'
import { isVersionLabel } from '@infrastructure/versions.ts'
import { AGENT_FILE, makeWorkdir, moveWork } from '@infrastructure/workdir.ts'
import { countCall } from '@judges/meter.ts'
import { neverReplayed } from '@judges/replies.ts'

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
 * Where a run may hold its copy of one of a case's input files, `rel` being
 * the file's path in the skill, under the run's `inputs` folder. The first is
 * where the case as it is now stages it: a file under the case's own `files/`
 * keeps its path inside it, and one from elsewhere in the skill goes by its
 * name, unless another of the case's files has that name too, when both keep
 * their whole path in the skill so neither takes the other's place. The second,
 * for a file from elsewhere, is where it went if the case had, or lacked, such
 * a namesake when the run was made.
 */
export function stagedInputs(
  inputs: string,
  testCase: Pick<Case, 'id' | 'dir' | 'files'>,
  rel: string,
): string[] {
  const at = (path: string): string => join(inputs, testCase.id, path)
  const own = testCase.dir ? `${testCase.dir}/files/` : null
  if (own && rel.startsWith(own)) return [at(rel.slice(own.length))]
  const name = basename(rel)
  const shared = testCase.files.some((other) => other !== rel && basename(other) === name)
  return shared ? [at(rel), at(name)] : [at(name), at(rel)]
}

/** The run's copy of one of a case's input files, as the case stages it now. */
export const stagedInput = (...where: Parameters<typeof stagedInputs>): string =>
  stagedInputs(...where)[0]
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
  /** What an `old_skill` run generates against: a version (`vN`), or a run whose `_skill/` to use. */
  baseline: string | null
  /**
   * A folder outside the skill whose files a `with_skill` run tests in place of
   * the skill's own, held against the skill's versions as the working tree is.
   */
  from?: string | null
  /** Name for the skill version when the files tested are new. */
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

/**
 * The version a new run is stamped with: that of the files in `tree`, the
 * skill's own or a draft's. Throws when they changed and have no name yet. A
 * run without the skill tests no version: it is stamped with the number the
 * tree has now and no name, which names no version and makes the tree none
 * (`skillVersions` passes over such a run).
 */
function stampSkill(
  skillDir: string,
  tree: string,
  skillName: string | null,
  note: string,
  configuration: Configuration,
): SkillStamp {
  const { current } = versionsOf(skillDir, tree)
  if (!current.changed)
    return { version: current.version, name: current.name, hash: current.hash, note: current.note }
  if (configuration === 'without_skill')
    return { version: current.version, name: '', hash: current.hash, note: '' }
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
  linkSkillAliases(sampleDir)
  return rel
}

/** `.claude/skills` and `.cursor/skills` in a sample, each a link to its `.agents/skills`, made again when one is there. */
function linkSkillAliases(sampleDir: string): void {
  if (!existsSync(join(sampleDir, '.agents/skills'))) return
  for (const alias of ['.claude', '.cursor']) {
    const link = join(sampleDir, alias, 'skills')
    try {
      // Only a link is replaced: a folder the agent made there is its own.
      if (present(link) && !lstatSync(link).isSymbolicLink()) continue
      rmSync(link, { force: true })
      mkdirSync(join(sampleDir, alias), { recursive: true })
      linkDir('../.agents/skills', link)
    } catch {}
  }
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
 * The copy of the skill an `old_skill` run is made against, and the version it
 * is stamped with. `baseline` names a version, whose saved copy or first run's
 * copy is used, or a run, whose own copy is. Throws when nothing is named, or
 * no copy or no record of the version is kept.
 */
function baselineOf(
  skillDir: string,
  baseline: string | null,
): { dir: string; stamp: SkillStamp; partial?: boolean } {
  if (!baseline) throw new Error('old_skill needs the version to run against.')
  if (isVersionLabel(baseline)) {
    const version = versionsOf(skillDir).versions.find((v) => v.version === baseline)
    if (!version) throw new Error(`No version ${baseline} is kept.`)
    const copy = versionCopy(skillDir, baseline)
    return {
      dir: copy.dir,
      ...(copy.whole ? {} : { partial: true }),
      stamp: {
        version: version.version,
        name: version.name,
        hash: version.hash,
        note: version.note,
      },
    }
  }
  const run = assertSafe(baseline, 'run')
  const dir = skillCopy(skillDir, run)
  if (!existsSync(join(dir, 'SKILL.md')))
    throw new Error(`${run} keeps no copy of its skill, so no run can be made against it.`)
  const old = readRunMeta(skillDir, run)
  if (!old) throw new Error(`${run} has no record of the version it ran.`)
  return {
    dir,
    stamp: { version: old.skillVersion, name: old.skillName, hash: old.skillHash, note: old.note },
  }
}

/**
 * The folder a draft is run from, as its real path. Throws when none is
 * named, when it holds no SKILL.md, or when it and the skill's folder are one inside the other: a
 * draft inside the skill would be kept as part of each of the skill's
 * versions, and a folder holding the skill would copy the skill's runs into
 * each of its own.
 */
function draftOf(skillDir: string, from: string, configuration: Configuration): string {
  if (configuration !== 'with_skill')
    throw new Error(
      `A run of the files in another folder runs with the skill, so it cannot be ${configuration}.`,
    )
  if (!from.trim()) throw new Error('No folder was named to run the skill files from.')
  const draft = realPath(resolve(from))
  if (!isFile(join(draft, 'SKILL.md'))) throw new Error(`No SKILL.md at ${draft}.`)
  const skill = realPath(skillDir)
  if (isWithin(draft, skill))
    throw new Error(
      `${draft} is inside the skill's folder. Keep the draft in a folder outside it, or its files become part of the skill's own.`,
    )
  if (isWithin(skill, draft))
    throw new Error(
      `${draft} holds the skill's folder. Keep the draft in a folder outside the skill, holding only the draft.`,
    )
  return draft
}

/**
 * Stamp the run, name it and make its folder: the copy of the skill, the
 * cases' input files, the cases, and `run.json`.
 */
function startRun(
  options: GenerateOptions,
  how: {
    tree: string
    baseline: ReturnType<typeof baselineOf> | null
    model: string
    effort: string
  },
): { name: string; dir: string; snapshot: string; meta: RunMeta } {
  const { skillDir, engine, configuration } = options
  const { tree, baseline, model, effort } = how
  const stamp = baseline
    ? baseline.stamp
    : stampSkill(skillDir, tree, options.skillName, options.note, configuration)
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
  const snapshot = skillCopy(skillDir, name)
  if (baseline) copyTree(baseline.dir, snapshot)
  else snapshotSkill(tree, snapshot)
  stageInputs(skillDir, dir, options.cases, options.log)
  // The cases as they are asked now, with the checks for every case: what the run is read against, whatever is edited since.
  keepCases(skillDir, dir, options.cases, loadEveryCase(skillDir))
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
  return { name, dir, snapshot, meta }
}

export async function generateRun(
  options: GenerateOptions,
): Promise<{ name: string; dir: string; meta: RunMeta }> {
  // The answer under test is never saved: a replay asks nobody, so it runs no agent.
  neverReplayed("The answer under test, a run's agent,")
  const { skillDir, engine, log } = options
  const info = skillInfo(skillDir)
  const configuration = options.configuration
  const draft =
    options.from === undefined || options.from === null
      ? null
      : draftOf(skillDir, options.from, configuration)
  const tree = draft ?? skillDir
  const baseline = configuration === 'old_skill' ? baselineOf(skillDir, options.baseline) : null
  if (baseline?.partial)
    log(
      `${baseline.stamp.version} was kept with SKILL.md and references/ only: this run gets none of its scripts or other files.`,
    )
  // The skill as the run's copy names it: a run against an older version uses the name it had then.
  const skillName = baseline
    ? skillHead(baseline.dir, basename(info.path)).name
    : draft
      ? skillHead(draft, basename(info.path)).name
      : info.name
  const model = options.model?.trim() || engine.defaultModel
  const effort = options.effort || 'default'
  // A run refused for its version is refused before the lock, so it leaves `evals/runs/` as it was.
  if (!baseline) stampSkill(skillDir, tree, options.skillName, options.note, configuration)
  // From the version taken to `run.json` written, no other run of the skill starts: two would take one number.
  const release = await takeStampLock(runsDir(skillDir))
  const { name, dir, snapshot, meta } = (() => {
    try {
      return startRun(options, { tree, baseline, model, effort })
    } finally {
      release()
    }
  })()
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
    skillName,
    // The name is the writer's own text: only a slug of it names a folder.
    skillFolder: slug(skillName) || slug(basename(info.path)) || 'skill',
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
  const wrote = meta.samples.filter((s) => s.ok && !s.stopped && !s.failed).length
  const failed = meta.samples.filter((s) => s.failed).length
  log(
    `${
      options.signal?.aborted
        ? `${name}: stopped, ${wrote}/${jobs.length} wrote output`
        : `${name}: done, ${wrote}/${meta.samples.length} wrote output`
    }${failed ? `, ${failed} failed` : ''}`,
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
    return {
      dir: name,
      case: testCase.id,
      index,
      ok: false,
      seconds: 0,
      costUsd: null,
      tokens: null,
      model: null,
      error: message,
      steps: 0,
      toolCalls: 0,
      outputs: outputsIn(join(options.runDir, name)),
      failed: 'could not start',
    }
  }
}

/**
 * Why a session that no stop ended did not run to its end; null when it did.
 * The engine's own word is what tells them apart: a session that ended well
 * exits with success and reports no error, whether or not it wrote a file.
 */
function sessionFailure(result: EngineResult): SampleFailure | null {
  if (result.ok && result.error === null) return null
  if (result.ended === 'timeout') return 'ran out of time'
  if (result.ended === 'unstarted') return 'could not start'
  return 'ended with an error'
}

/** What an agent has written in its sample folder, fixed as it ends: a file put under outputs/ later is not its output. */
const outputsIn = (dir: string): string[] => detectArtifacts(dir).map((artifact) => artifact.file)

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
  mkdirSync(dir, { recursive: true })
  // The agent works away from the skill, with nothing above it an agent reads,
  // and what it made is moved into the run when it ends, however it ends.
  const work = makeWorkdir(name)
  writeJson(join(dir, AGENT_FILE), { workdir: work.paths })
  try {
    return await runSample(testCase, index, options, dir, work)
  } finally {
    const left = moveWork(work.dir, dir)
    if (left.length) options.log(`${name}: ${left.join('; ')}; the rest is in ${work.dir}`)
    // A link to the skill is made by its full path on Windows, so it is made again where it now sits.
    if (options.skillSource) linkSkillAliases(dir)
  }
}

async function runSample(
  testCase: Case,
  index: number,
  options: SampleOptions,
  dir: string,
  work: { dir: string; paths: string[] },
): Promise<SampleMeta> {
  const name = sampleDir(testCase.id, index)
  const cwd = work.dir
  mkdirSync(join(cwd, OUTPUTS_DIR), { recursive: true })
  mkdirSync(join(cwd, SCRATCH_DIR), { recursive: true })
  const staged = join(options.runDir, INPUTS_DIR, testCase.id)
  const files: string[] = []
  for (const { rel, real } of treeFiles(staged, { hidden: true })) {
    const dest = join(cwd, 'files', rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(real, dest)
    files.push(`files/${rel}`)
  }
  const skillRel = options.skillSource
    ? placeSkill(cwd, options.skillSource, options.skillFolder)
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
    cwd,
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
  // The answer under test is counted once an attempt, never saved: it is what the skill is tried on.
  countCall({
    operation: 'run',
    provider: 'engine',
    model: result.model ?? options.model,
    input: result.tokens?.input ?? 0,
    output: result.tokens?.output ?? 0,
    seconds: timing.durationMs / 1000,
    source: 'asked',
  })
  writeJson(join(dir, AGENT_FILE), {
    workdir: work.paths,
    ok: result.ok,
    error: result.error,
    finalText: result.finalText,
  })
  const counts = transcript.counts()
  // The agent's folder holds them until they are moved, under the same paths.
  const outputs = outputsIn(cwd)
  const ok = outputs.length > 0
  // Its agent was still going when the stop or the quit came, so that is what ended it:
  // what it left, nothing or half a file, is not the skill's doing.
  const stopped = options.signal.aborted || isStopping()
  // No stop ended it, and it did not end well by itself: what it left is no whole answer either.
  const failed = stopped ? null : sessionFailure(result)
  const seconds = Math.round(timing.durationMs / 1000)
  const spend =
    result.costUsd !== null
      ? `, $${result.costUsd.toFixed(result.costUsd < 0.1 ? 4 : 2)}`
      : result.tokens
        ? `, ${result.tokens.input.toLocaleString()} in / ${result.tokens.output.toLocaleString()} out`
        : ''
  options.log(
    stopped
      ? `${label}: stopped before it ${ok ? 'finished' : 'wrote anything'}`
      : failed
        ? `${label}: failed in ${seconds} s, it ${failed}${result.error ? ` (${result.error})` : ''}`
        : ok
          ? `${label}: done in ${seconds} s, ${counts.toolCalls} tool calls${spend}`
          : `${label}: no output written in ${seconds} s`,
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
    outputs,
    ...(stopped ? { stopped: true } : {}),
    ...(failed ? { failed } : {}),
  }
}
