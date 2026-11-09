/**
 * Grade a run or the anchors: every active pack asks its questions about each
 * sample's primary artifact, the raw answers go in `report.json`, and the
 * scores come from core so the app can rescore as a setting moves.
 */
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
}

interface Subject extends Sample {
  caseRef: string | null
  label: string | null
  tests: string[]
}

interface GradeContext {
  cases: Case[]
  rules: Rule[]
  packs: JudgePack[]
  judge: JudgeContext
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

async function gradeSubject(subject: Subject, ctx: GradeContext): Promise<ReportResult> {
  const testCase = findCase(ctx.cases, subject.caseRef)
  const input = judgeInput(ctx.judge.skillDir, subject, testCase, ctx.rules, (line) =>
    ctx.judge.log(`${subject.name}: ${line}`),
  )
  const { primary } = input
  const packs: Record<string, unknown> = {}
  const failures: string[] = []
  for (const pack of ctx.packs) {
    const applies =
      pack.artifacts.length === 0 || (primary !== null && pack.artifacts.includes(primary.kind))
    if (!applies) {
      packs[pack.id] = null
      continue
    }
    try {
      packs[pack.id] = await pack.judge(input, ctx.judge)
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
    ...base,
    scores: scored.scores,
    flags: [...failures, ...scored.flags],
    confidence: scored.confidence,
  }
}

async function gradeSubjects(
  skillDir: string,
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
  }
  const started = performance.now()
  const results: ReportResult[] = []
  for (const subject of subjects) {
    const result = await gradeSubject(subject, ctx)
    results.push(result)
    log(`${subject.name}: total ${result.scores.total ?? '-'}`)
  }
  return {
    createdAt: new Date().toISOString(),
    model: options.useJev ? (jev.modelSeen ?? jev.model) : null,
    inputTokens: jev.inputTokens,
    seconds: Math.round((performance.now() - started) / 100) / 10,
    config,
    packs: config.packs,
    results,
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
  const report = await gradeSubjects(skillDir, subjects, options)
  writeJson(join(dir, 'report.json'), report)
  return report
}

/** Grade `evals/anchors/*.md` and write `evals/anchors/report.json`. */
export async function gradeAnchors(skillDir: string, options: GradeOptions): Promise<Report> {
  const dir = anchorsDir(skillDir)
  const subjects: Subject[] = runSamples(dir).map((sample) => {
    const head = readHead(join(dir, sample.name))
    return { ...sample, caseRef: head.case, label: head.label, tests: head.tests }
  })
  const report = await gradeSubjects(skillDir, subjects, options)
  writeJson(join(dir, 'report.json'), report)
  return report
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
