/**
 * Generate a run: one sample directory per case and sample, each the working
 * directory of a headless agent session. The agent sees a copy of the skill
 * (or none, or an older snapshot), the case's input files and the prompt;
 * it writes under `outputs/` and the harness records the transcript, timing
 * and cost beside them.
 */
import { copyFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { runName, sampleDir } from '@core/run-name.ts'
import type { Case, Configuration, RunMeta, SampleMeta, Timing } from '@core/schemas.ts'
import { detectArtifacts } from './artifacts.ts'
import type { Engine } from './engines/index.ts'
import { today, writeJson } from './fs.ts'
import { agentPrompt, OUTPUTS_DIR } from './prompt.ts'
import { readRunMeta, runDir, versionsOf } from './runs.ts'
import { skillInfo, snapshotSkill, snapshotSkillFiles } from './skill.ts'
import { TranscriptWriter } from './transcript.ts'

/** One sample of a long task; longer means the session is stuck. */
const SAMPLE_TIMEOUT_MS = 20 * 60 * 1000
const MAX_PARALLEL = 3

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
      `The skill changed since the last run. Name version ${current.version} (st run --name "..." or the UI).`,
    )
  return { version: current.version, name, hash: current.hash, note }
}

function freshRunName(skillDir: string, base: string): string {
  let name = base
  for (let n = 2; existsSync(runDir(skillDir, name)); n += 1) name = `${base}-${n}`
  return name
}

/** Where the agent finds the skill inside its sample dir, plus the aliases each tool looks in. */
function placeSkill(sampleDir: string, source: string, name: string): string {
  const rel = `.agents/skills/${name}`
  snapshotSkill(source, join(sampleDir, rel))
  for (const alias of ['.claude', '.cursor']) {
    mkdirSync(join(sampleDir, alias), { recursive: true })
    const link = join(sampleDir, alias, 'skills')
    if (!existsSync(link)) symlinkSync('../.agents/skills', link)
  }
  return rel
}

export async function generateRun(
  options: GenerateOptions,
): Promise<{ name: string; dir: string; meta: RunMeta }> {
  const { skillDir, engine, log } = options
  const info = skillInfo(skillDir)
  const configuration = options.configuration
  let stamp: SkillStamp
  let baselineDir: string | null = null
  if (configuration === 'old_skill') {
    if (!options.baselineRun) throw new Error('old_skill needs --baseline <run>.')
    baselineDir = join(runDir(skillDir, options.baselineRun), '_skill')
    if (!existsSync(join(baselineDir, 'SKILL.md')))
      throw new Error(`${options.baselineRun} has no _skill/SKILL.md snapshot.`)
    const old = readRunMeta(skillDir, options.baselineRun)
    if (!old) throw new Error(`${options.baselineRun} has no run.json to take its version from.`)
    stamp = { version: old.skillVersion, name: old.skillName, hash: old.skillHash, note: old.note }
  } else stamp = stampSkill(skillDir, options.skillName, options.note)
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
  snapshotSkillFiles(baselineDir ?? skillDir, join(dir, '_skill'))

  const meta: RunMeta = {
    name,
    skillPath: skillDir,
    skillVersion: stamp.version,
    skillName: stamp.name,
    skillHash: stamp.hash,
    note: stamp.note,
    writer: { engine: engine.id, model, effort, harness: engine.harness },
    configuration,
    baselineDir: baselineDir ? relative(skillDir, baselineDir) : null,
    cases: options.cases.map((c) => c.id),
    samplesPerCase: Math.max(1, options.samples),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    samples: [],
  }
  writeJson(join(dir, 'run.json'), meta)
  log(`${name}: ${options.cases.length} case(s) × ${meta.samplesPerCase} sample(s)`)

  const jobs = options.cases.flatMap((c) =>
    Array.from({ length: meta.samplesPerCase }, (_, i) => ({ testCase: c, index: i + 1 })),
  )
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      const sample = await generateSample(job.testCase, job.index, {
        ...options,
        runDir: dir,
        model,
        effort,
        skillSource: configuration === 'without_skill' ? null : (baselineDir ?? skillDir),
        skillName: info.name,
      })
      meta.samples.push(sample)
      meta.samples.sort((a, b) => a.dir.localeCompare(b.dir))
      writeJson(join(dir, 'run.json'), meta)
    }
  }
  const parallel = Math.max(1, Math.min(options.parallel ?? MAX_PARALLEL, jobs.length))
  await Promise.all(Array.from({ length: parallel }, worker))
  meta.finishedAt = new Date().toISOString()
  writeJson(join(dir, 'run.json'), meta)
  log(
    `${name}: done, ${meta.samples.filter((s) => s.ok).length}/${meta.samples.length} wrote output`,
  )
  return { name, dir, meta }
}

interface SampleOptions {
  skillDir: string
  runDir: string
  engine: Engine
  model: string
  effort: string
  skillSource: string | null
  skillName: string
  log: (line: string) => void
}

async function generateSample(
  testCase: Case,
  index: number,
  options: SampleOptions,
): Promise<SampleMeta> {
  const name = sampleDir(testCase.id, index)
  const dir = join(options.runDir, name)
  mkdirSync(join(dir, OUTPUTS_DIR), { recursive: true })
  const files: string[] = []
  for (const rel of testCase.files) {
    const source = join(options.skillDir, rel)
    if (!existsSync(source)) {
      options.log(`${name}: input file missing, ${rel}`)
      continue
    }
    mkdirSync(join(dir, 'files'), { recursive: true })
    copyFileSync(source, join(dir, 'files', basename(rel)))
    files.push(`files/${basename(rel)}`)
  }
  const skillRel = options.skillSource
    ? placeSkill(dir, options.skillSource, options.skillName)
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
    timeoutMs: (testCase.settings.timeoutSeconds ?? SAMPLE_TIMEOUT_MS / 1000) * 1000,
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
  const seconds = Math.round(timing.durationMs / 1000)
  const spend =
    result.costUsd !== null
      ? `, $${result.costUsd.toFixed(result.costUsd < 0.1 ? 4 : 2)}`
      : result.tokens
        ? `, ${result.tokens.input.toLocaleString()} in / ${result.tokens.output.toLocaleString()} out`
        : ''
  options.log(
    ok
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
  }
}
