/**
 * Grade a run or the anchors: every active pack asks its questions about each
 * sample's primary artifact, the raw answers go in `report.json`, and the
 * scores come from core so the app can rescore as a setting moves.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeConfig } from '@domain/config.ts'
import { imageTypeOf } from '@domain/image.ts'
import type { Rule } from '@domain/rules.ts'
import type { BenchConfig, Case, Report, ReportResult } from '@domain/schemas.ts'
import { scoreResult } from '@domain/scoring.ts'
import { copyOf, titleOf, unitsOf, words } from '@domain/text.ts'
import type { Sample } from '@domain/views.ts'
import { primaryArtifact } from '@infrastructure/artifacts.ts'
import { benchPath, findCase, loadCases, loadRules, readSkillFile } from '@infrastructure/cases.ts'
import { readJson, writeJson } from '@infrastructure/fs.ts'
import { anchorsDir, readHead, runDir, runSamples } from '@infrastructure/runs.ts'
import { readTranscript } from '@infrastructure/transcript.ts'
import { requestImages } from '@judges/images.ts'
import { packById } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import type { JudgeContext, JudgeInput, JudgePack } from '@judges/types.ts'

export interface GradeOptions {
  /** False grades with code checks only: no TypeSafe calls, Jev layers stay null. */
  useJev: boolean
  model?: string
  /** Packs to run instead of the skill's `bench.json` list. */
  packs?: string[]
  /** Keys laid over the skill's `bench.json` for this grading only. */
  config?: Partial<BenchConfig>
  log?: (line: string) => void
  /** The job was stopped: no further sample is judged, and no report is written. */
  signal?: AbortSignal
}

/** The file beside `report.json` that keeps each pack's raw answers by the hash of what it was asked. */
const CACHE_FILE = 'judge-cache.json'
/** How a pack's failure reads in a sample's flags; `unjudged` counts these. */
const PACK_FAILED = / pack failed: /

interface Subject extends Sample {
  caseRef: string | null
  label: string | null
  tests: string[]
}

interface JudgeCache {
  /** The answers the last grading kept, by hash. */
  old: Record<string, unknown>
  /** The answers this grading keeps: reused and new. */
  fresh: Record<string, unknown>
}

interface GradeContext {
  cases: Case[]
  rules: Rule[]
  packs: JudgePack[]
  judge: JudgeContext
  cache: JudgeCache
}

/** The skill's `bench.json`, with the call's overrides and pack list laid over it. */
function benchFor(skillDir: string, options: GradeOptions): BenchConfig {
  const saved = readJson<Partial<BenchConfig>>(benchPath(skillDir), {})
  return mergeConfig(
    { ...saved, ...options.config, ...(options.packs ? { packs: options.packs } : {}) },
    scorers,
  )
}

/** One sample as the packs see it. */
function judgeInput(
  skillDir: string,
  sample: Sample,
  testCase: Case | null,
  rules: Rule[],
  log: (line: string) => void,
): JudgeInput {
  const primary = primaryArtifact(sample.artifacts, testCase?.bench.artifact)
  const raw =
    primary && primary.kind !== 'image' ? readFileSync(join(sample.path, primary.file), 'utf8') : ''
  const markdown = primary?.kind === 'markdown'
  const text = markdown ? copyOf(raw) : raw
  const evidence: Record<string, string> = {}
  for (const rel of testCase?.bench.evidence ?? []) {
    const content = readSkillFile(skillDir, rel)
    if (content !== null) evidence[rel] = content
  }
  return {
    text,
    units: markdown ? unitsOf(text) : [],
    title: markdown ? titleOf(text) : null,
    case: testCase,
    // Every picture the agent got: one Jev cannot read is left out, and the log says which and why.
    images: requestImages(
      (testCase?.files ?? []).filter(imageTypeOf).map((rel) => join(skillDir, rel)),
      log,
    ),
    rules,
    evidence,
    artifacts: sample.artifacts,
    primary,
    transcript: readTranscript(join(sample.path, 'transcript.jsonl')),
    dir: sample.path,
  }
}

/**
 * The hash of everything a pack's answer depends on: the model, the pack, the
 * output and what it is judged against. Points per layer and the `yes`
 * threshold are left out, since they are applied after, in scoring. The same
 * hash on Regrade means the same questions over the same text, so the kept
 * answer stands and Jev is not asked again.
 */
function judgeKey(pack: JudgePack, input: JudgeInput, ctx: GradeContext): string {
  const { weights: _weights, yes: _yes, ...config } = ctx.judge.config
  const asked = {
    model: ctx.judge.useJev ? ctx.judge.jev.model : null,
    pack: pack.id,
    config,
    text: input.text,
    title: input.title,
    case: input.case,
    images: input.images.map((image) => image.name),
    rules: input.rules,
    evidence: input.evidence,
    artifacts: input.artifacts,
    primary: input.primary,
    transcript: input.transcript,
  }
  return createHash('sha256').update(JSON.stringify(asked)).digest('hex')
}

async function gradeSubject(
  subject: Subject,
  ctx: GradeContext,
): Promise<{ result: ReportResult; unchanged: boolean }> {
  const testCase = findCase(ctx.cases, subject.caseRef)
  const input = judgeInput(ctx.judge.skillDir, subject, testCase, ctx.rules, (line) =>
    ctx.judge.log(`${subject.name}: ${line}`),
  )
  const { primary } = input
  const packs: Record<string, unknown> = {}
  const failures: string[] = []
  let applied = 0
  let kept = 0
  for (const pack of ctx.packs) {
    const applies =
      pack.artifacts.length === 0 || (primary !== null && pack.artifacts.includes(primary.kind))
    if (!applies) {
      packs[pack.id] = null
      continue
    }
    applied += 1
    const key = judgeKey(pack, input, ctx)
    if (Object.hasOwn(ctx.cache.old, key)) {
      packs[pack.id] = ctx.cache.old[key]
      ctx.cache.fresh[key] = ctx.cache.old[key]
      kept += 1
      continue
    }
    try {
      const answer = await pack.judge(input, ctx.judge)
      packs[pack.id] = answer
      ctx.cache.fresh[key] = answer
    } catch (error) {
      // One pack failing leaves its layers out of the total, so the report says so.
      const failure = `${pack.id} pack failed: ${(error as Error).message}`
      ctx.judge.log(`${subject.name}: ${failure}`)
      failures.push(failure)
      packs[pack.id] = null
    }
  }
  const base = {
    sample: subject.name,
    case: testCase?.id ?? subject.caseRef,
    label: subject.label,
    tests: subject.tests,
    artifacts: subject.artifacts,
    primary,
    // The case's word range is about the copy: prose and list units, not headings or code.
    words: words(input.units.length ? input.units.map((u) => u.text).join(' ') : input.text).length,
    range: testCase?.bench.words ?? null,
    packs,
  }
  const scored = scoreResult(base, ctx.judge.config, scorers)
  return {
    result: {
      ...base,
      scores: scored.scores,
      flags: [...failures, ...scored.flags],
      confidence: scored.confidence,
    },
    unchanged: applied > 0 && kept === applied,
  }
}

/**
 * Grade `subjects` and write the report and the judge cache in `dir`. Stopped
 * part way, it writes neither: the report there stays as it was.
 */
async function gradeSubjects(
  skillDir: string,
  dir: string,
  subjects: Subject[],
  options: GradeOptions,
): Promise<Report> {
  if (options.useJev && !Jev.available())
    throw new Error('TYPESAFE_API_KEY is not set. Add it to .env or pass --no-jev.')
  const config = benchFor(skillDir, options)
  const packs = config.packs.map((id) => {
    const pack = packById(id)
    if (!pack) throw new Error(`No judge pack named ${id}.`)
    return pack
  })
  const jev = new Jev(options.model)
  const log = options.log ?? (() => {})
  const ctx: GradeContext = {
    cases: loadCases(skillDir),
    rules: loadRules(skillDir, config),
    packs,
    judge: { jev, useJev: options.useJev, config, skillDir, log },
    cache: { old: readJson<Record<string, unknown>>(join(dir, CACHE_FILE), {}), fresh: {} },
  }
  const started = performance.now()
  const results: ReportResult[] = []
  let unchanged = 0
  for (const subject of subjects) {
    if (options.signal?.aborted) throw new Error('Stopped.')
    const graded = await gradeSubject(subject, ctx)
    results.push(graded.result)
    if (graded.unchanged) unchanged += 1
    log(`${subject.name}: total ${graded.result.scores.total ?? '-'}`)
  }
  if (unchanged) log(`${unchanged} of ${subjects.length} outputs unchanged: kept their verdicts.`)
  const report: Report = {
    createdAt: new Date().toISOString(),
    model: options.useJev ? (jev.modelSeen ?? jev.model) : null,
    inputTokens: jev.inputTokens,
    seconds: Math.round((performance.now() - started) / 100) / 10,
    config,
    packs: config.packs,
    results,
  }
  writeJson(join(dir, CACHE_FILE), ctx.cache.fresh)
  writeJson(join(dir, 'report.json'), report)
  return report
}

/**
 * How many of a report's outputs a pack failed on, with the first reason. A
 * pack that throws (an expired key, no network) leaves its layers null, and
 * the total is counted from the rest, so a report with failures says less
 * than it seems to.
 */
export function unjudged(report: Report): { failed: number; total: number; reason: string | null } {
  const failed = report.results.filter((r) => r.flags.some((f) => PACK_FAILED.test(f)))
  return {
    failed: failed.length,
    total: report.results.length,
    reason: failed[0]?.flags.find((f) => PACK_FAILED.test(f)) ?? null,
  }
}

/** Grade every sample of a run and write its `report.json`. */
export async function gradeRun(
  skillDir: string,
  run: string,
  options: GradeOptions,
): Promise<Report> {
  const dir = runDir(skillDir, run)
  const subjects: Subject[] = runSamples(dir).map((sample) => {
    if (sample.legacy) {
      const head = readHead(join(sample.path, sample.name))
      return { ...sample, caseRef: head.case ?? sample.name, label: head.label, tests: head.tests }
    }
    return { ...sample, caseRef: sample.name, label: null, tests: [] }
  })
  return gradeSubjects(skillDir, dir, subjects, options)
}

/** Grade `evals/anchors/*.md` and write `evals/anchors/report.json`. */
export async function gradeAnchors(skillDir: string, options: GradeOptions): Promise<Report> {
  const dir = anchorsDir(skillDir)
  const subjects: Subject[] = runSamples(dir).map((sample) => {
    const head = readHead(join(dir, sample.name))
    return { ...sample, caseRef: head.case, label: head.label, tests: head.tests }
  })
  return gradeSubjects(skillDir, dir, subjects, options)
}

export interface SelfTestLine {
  bad: string
  layer: string
  good: number | null
  badScore: number | null
  ok: boolean
}

/** Each bad anchor must score below its case's good anchor on every layer it tests. */
export function selfTest(report: Report): { lines: SelfTestLine[]; failures: number } {
  const goods = new Map(report.results.filter((r) => r.label === 'good').map((r) => [r.case, r]))
  const lines: SelfTestLine[] = []
  for (const bad of report.results.filter((r) => r.label === 'bad')) {
    const good = goods.get(bad.case)
    if (!good) continue
    for (const layer of bad.tests.length ? bad.tests : ['total']) {
      const g = good.scores[layer] ?? null
      const b = bad.scores[layer] ?? null
      lines.push({ bad: bad.sample, layer, good: g, badScore: b, ok: (g ?? -1) > (b ?? -1) })
    }
  }
  return { lines, failures: lines.filter((l) => !l.ok).length }
}

export interface CompareRow {
  key: string
  deltas: Record<string, number | null>
}

/** Per-sample score deltas between two reports, matched on case then sample name. */
export function compareReports(before: Report, after: Report): CompareRow[] {
  const keyOf = (r: ReportResult) => r.case ?? r.sample
  const prior = new Map<string, ReportResult[]>()
  for (const r of before.results) prior.set(keyOf(r), [...(prior.get(keyOf(r)) ?? []), r])
  return after.results.flatMap((r) => {
    const match = prior.get(keyOf(r))?.shift()
    if (!match) return []
    const deltas: Record<string, number | null> = {}
    for (const layer of Object.keys(r.scores)) {
      const a = r.scores[layer]
      const b = match.scores[layer]
      deltas[layer] = a === null || b === null || b === undefined ? null : a - b
    }
    return [{ key: `${keyOf(r)} ${r.sample}`, deltas }]
  })
}
