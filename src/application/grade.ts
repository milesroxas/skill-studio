/**
 * Grade a run or the anchors: every active pack asks its questions about each
 * sample's primary artifact, the raw answers go in `report.json`, and the
 * scores come from core so the app can rescore as a setting moves.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { type PageRenderer, RENDER_SIZES, type RenderSize } from '@domain/artifact-address.ts'
import { mergeConfig } from '@domain/config.ts'
import { imageTypeOf, PICTURE_HEAD_BYTES, pictureSize } from '@domain/image.ts'
import { primaryArtifact } from '@domain/primary.ts'
import type { Rule } from '@domain/rules.ts'
import { parseSampleDir } from '@domain/run-name.ts'
import type { Artifact, BenchConfig, Case, Report, ReportResult } from '@domain/schemas.ts'
import { scoreResult } from '@domain/scoring.ts'
import { copyOf, titleOf, unitsOf, words } from '@domain/text.ts'
import type { Sample } from '@domain/views.ts'
import { benchPath, findCase, loadCases, loadRules, readSkillFile } from '@infrastructure/cases.ts'
import { commandRunner } from '@infrastructure/exec.ts'
import { assertInside, isDir, isFile, readJson, readStart, writeJson } from '@infrastructure/fs.ts'
import { anchorsDir, readHead, readRunMeta, runDir, runSamples } from '@infrastructure/runs.ts'
import { readTranscript } from '@infrastructure/transcript.ts'
import { readForJev, requestImages } from '@judges/images.ts'
import { packById } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import type { JudgeContext, JudgeInput, JudgePack, PageShot } from '@judges/types.ts'
import { INPUTS_DIR, stagedInput } from './generate.ts'

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
  /**
   * Draws an HTML page at a size, for a pack that looks at the page as drawn
   * (`JudgePack.renders`). Only the desktop app has one; without it such a
   * pack judges the markup and any screenshot the agent left.
   */
  render?: PageRenderer
}

/** The folder of a sample the pages drawn for grading are kept in: beside outputs/, never in it. */
const RENDERS_DIR = 'renders'

/** The file beside `report.json` that keeps each pack's raw answers by the hash of what it was asked. */
const CACHE_FILE = 'judge-cache.json'
/** How a pack's failure reads in a sample's flags; `unjudged` counts these. */
const PACK_FAILED = / pack failed: /
/** What a grading that was stopped rejects with. */
const STOPPED = 'Stopped.'

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
  /** The hash of each picture read in this grading, by its path on disk. */
  pictures: Map<string, string>
  /**
   * The run's copy of its cases' input files, taken as it started: what the
   * agent was given. Null for anchors, and for a run made before runs kept one.
   */
  inputs: string | null
  signal?: AbortSignal
  /** Draws a sample's page at each of `RENDER_SIZES`; absent when the host cannot, or nothing looks. */
  draw?: (sample: Sample, page: Artifact, sizes: RenderSize[]) => Promise<Drawn>
}

/** A page drawn at each size, with a hash of each picture so an answer about it is kept by what it saw. */
interface Drawn {
  shots: PageShot[]
  hashes: Record<string, string>
}

const NOTHING_DRAWN: Drawn = { shots: [], hashes: {} }

/**
 * The sizes a case's page is drawn at: the case's own size when it names one,
 * else a desktop window, and a phone only when the case asks for one, since
 * most pages are made for a desktop.
 */
function renderSizes(testCase: Case | null): RenderSize[] {
  const size = testCase?.bench.size
  return RENDER_SIZES.flatMap((s) => {
    if (s.id === 'phone') return testCase?.bench.phone === true ? [s] : []
    return [size ? { ...s, width: size[0], height: size[1] } : s]
  })
}

/**
 * Draw the page at each of `RENDER_SIZES`, kept in the sample's `renders/`
 * folder and drawn again only when the page is newer than the picture. A size
 * that cannot be drawn is logged and left out: the pack judges without it.
 */
async function drawPage(
  render: PageRenderer,
  skillDir: string,
  run: string,
  sample: Sample,
  page: Artifact,
  sizes: RenderSize[],
  log: (line: string) => void,
): Promise<Drawn> {
  const drawn: Drawn = { shots: [], hashes: {} }
  const source = statSync(join(sample.path, page.file)).mtimeMs
  for (const size of sizes) {
    // Named by its size too, so a case asking for another size draws the page again.
    const path = join(sample.path, RENDERS_DIR, `${size.id}-${size.width}x${size.height}.png`)
    if (!isFile(path) || statSync(path).mtimeMs < source) {
      try {
        const png = await render(
          { skill: skillDir, run, sample: sample.name, file: page.file },
          { width: size.width, height: size.height },
        )
        mkdirSync(join(sample.path, RENDERS_DIR), { recursive: true })
        writeFileSync(path, png)
      } catch (error) {
        log(`the page could not be drawn at ${size.id} width: ${(error as Error).message}`)
        continue
      }
    }
    drawn.shots.push({ size, read: readForJev(path) })
    drawn.hashes[`render:${size.id}`] = createHash('sha256')
      .update(readFileSync(path))
      .digest('hex')
  }
  return drawn
}

/**
 * The settings of `config` a pack's answer can depend on: every key but the
 * points and the threshold, which apply after, and the settings that are
 * another pack's alone, so moving one of those never has this pack asked again.
 */
function askedConfig(pack: JudgePack, config: BenchConfig): Record<string, unknown> {
  const own = new Set(Object.keys(pack.defaults))
  const others = new Set(
    scorers.filter((other) => other.id !== pack.id).flatMap((other) => Object.keys(other.defaults)),
  )
  return Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => key !== 'weights' && key !== 'yes' && (own.has(key) || !others.has(key)),
    ),
  )
}

/** `path` when it is a file inside `root`, links resolved; null for anything else (a folder, a pipe, a link out). */
function fileInside(root: string, path: string): string | null {
  try {
    return isFile(assertInside(root, path)) ? path : null
  } catch {
    return null
  }
}

/**
 * Where a picture the case's request came with is read: from the run's copy of
 * the case's input files, so a picture changed or added since the run is not
 * judged as what the agent saw, and from the case as it is now for a run that
 * kept no copy. Null when there is no such file.
 */
function requestPicture(ctx: GradeContext, testCase: Case, rel: string): string | null {
  return ctx.inputs
    ? fileInside(ctx.inputs, stagedInput(ctx.inputs, testCase, rel))
    : fileInside(ctx.judge.skillDir, join(ctx.judge.skillDir, rel))
}

/** Each picture the case's request came with, by its path in the skill: where it is read, or null when it is not there. */
const requestPictures = (
  ctx: GradeContext,
  testCase: Case | null,
): Array<[string, string | null]> =>
  testCase
    ? testCase.files.filter(imageTypeOf).map((rel) => [rel, requestPicture(ctx, testCase, rel)])
    : []

/**
 * The pictures a case is judged with, each by a hash of the bytes the judge
 * reads: the ones the agent got and the ones its checks are about. A picture
 * replaced under the same name is a new picture, and the output is judged again.
 */
function casePictures(ctx: GradeContext, testCase: Case | null): Record<string, string> {
  const paths: Array<[string, string | null]> = [
    ...requestPictures(ctx, testCase),
    ...(testCase?.graders ?? []).flatMap(
      (grader): Array<[string, string | null]> =>
        grader.image
          ? [[grader.image, fileInside(ctx.judge.skillDir, join(ctx.judge.skillDir, grader.image))]]
          : [],
    ),
  ]
  const hashes: Record<string, string> = {}
  for (const [rel, path] of paths) {
    let hash = path === null ? 'missing' : ctx.pictures.get(path)
    if (hash === undefined && path !== null) {
      hash = createHash('sha256').update(readFileSync(path)).digest('hex')
      ctx.pictures.set(path, hash)
    }
    hashes[rel] = hash ?? 'missing'
  }
  return hashes
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
  ctx: GradeContext,
  sample: Sample,
  testCase: Case | null,
  log: (line: string) => void,
): JudgeInput {
  const { skillDir } = ctx.judge
  const primary = primaryArtifact(
    sample.artifacts,
    testCase?.bench.artifact,
    ctx.packs.flatMap((pack) => pack.artifacts),
  )
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
      requestPictures(ctx, testCase).flatMap(([rel, path]) => {
        if (path === null) log(`${basename(rel)} is not shown to Jev: the file is missing.`)
        return path === null ? [] : [path]
      }),
      log,
    ),
    rules: ctx.rules,
    evidence,
    artifacts: sample.artifacts,
    primary,
    transcript: readTranscript(join(sample.path, 'transcript.jsonl')),
    dir: sample.path,
    renders: [],
  }
}

/**
 * The hash of everything a pack's answer depends on: the model, the pack and
 * the version of its questions, the output and what it is judged against.
 * Points per layer and the `yes` threshold are left out, since they are
 * applied after, in scoring, and so are another pack's settings. The same hash
 * on Regrade means the same questions over the same text and pictures, so the
 * kept answer stands and Jev is not asked again.
 */
function judgeKey(
  pack: JudgePack,
  input: JudgeInput,
  pictures: Record<string, string>,
  ctx: GradeContext,
): string {
  const asked = {
    model: ctx.judge.useJev ? ctx.judge.jev.model : null,
    pack: pack.id,
    // A pack raises its version when its questions or its reading of an answer change, so
    // answers given to the old ones are not kept.
    version: pack.version,
    config: askedConfig(pack, ctx.judge.config),
    text: input.text,
    title: input.title,
    case: input.case,
    pictures,
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
  const input = judgeInput(ctx, subject, testCase, (line) =>
    ctx.judge.log(`${subject.name}: ${line}`),
  )
  const { primary } = input
  const pictures = casePictures(ctx, testCase)
  // The page is drawn only when a pack will look at it, and a pack that does is asked again when it changes.
  const looks = ctx.packs.some((pack) => pack.renders)
  const drawn =
    looks && ctx.draw && primary?.kind === 'html' && !subject.legacy
      ? await ctx.draw(subject, primary, renderSizes(testCase))
      : NOTHING_DRAWN
  input.renders = drawn.shots
  const packs: Record<string, unknown> = {}
  /** This sample's new answers: kept only once the whole sample was judged without a stop. */
  const answers: Record<string, unknown> = {}
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
    const key = judgeKey(
      pack,
      input,
      pack.renders ? { ...pictures, ...drawn.hashes } : pictures,
      ctx,
    )
    if (Object.hasOwn(ctx.cache.old, key)) {
      packs[pack.id] = ctx.cache.old[key]
      ctx.cache.fresh[key] = ctx.cache.old[key]
      kept += 1
      continue
    }
    try {
      const answer = await pack.judge(input, ctx.judge)
      packs[pack.id] = answer
      answers[key] = answer
    } catch (error) {
      // A command ended by the stop is no answer, and no failure of the pack either.
      if (ctx.signal?.aborted) throw new Error(STOPPED)
      // One pack failing leaves its layers out of the total, so the report says so.
      const failure = `${pack.id} pack failed: ${(error as Error).message}`
      ctx.judge.log(`${subject.name}: ${failure}`)
      failures.push(failure)
      packs[pack.id] = null
    }
  }
  // Stopped while this sample was judged: a check may have been cut short, so nothing of it is kept.
  if (ctx.signal?.aborted) throw new Error(STOPPED)
  Object.assign(ctx.cache.fresh, answers)
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
    pixels:
      primary?.kind === 'image'
        ? pictureSize(readStart(join(subject.path, primary.file), PICTURE_HEAD_BYTES), primary.file)
        : null,
    size: testCase?.bench.size ?? null,
    // A text output with nothing but whitespace in it is no output; a picture always is one.
    blank: primary !== null && primary.kind !== 'image' && !input.text.trim(),
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
 * The cache as it is written: this grading's answers, and before them the
 * last ones it did not ask about again, so going back to a setting or a key
 * finds its answers still there. The oldest go once the file holds several
 * gradings' worth.
 */
function keptAnswers(cache: JudgeCache, perGrading: number): Record<string, unknown> {
  const earlier = Object.entries(cache.old).filter(([key]) => !Object.hasOwn(cache.fresh, key))
  const all = [...earlier, ...Object.entries(cache.fresh)]
  return Object.fromEntries(all.slice(-Math.max(200, perGrading * 4)))
}

/**
 * Grade `subjects` and write the report and the judge cache in `dir`. The
 * report is written only when the grading ran to its end and judged something:
 * stopped part way, with no output to grade, or with a pack failing on every
 * output, the report there stays as it was. The cache is written either way,
 * with every sample judged whole before the stop, so an answer already paid
 * for is never asked for twice. `inputs` is the run's copy of its cases' input
 * files, when it kept one.
 */
async function gradeSubjects(
  skillDir: string,
  dir: string,
  subjects: Subject[],
  options: GradeOptions,
  inputs: string | null = null,
  run: string | null = null,
): Promise<Report> {
  if (options.useJev && !Jev.available())
    throw new Error('No TypeSafe key is set, so Jev cannot judge. Add the key in Settings.')
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
    judge: {
      jev,
      useJev: options.useJev,
      config,
      skillDir,
      log,
      run: commandRunner(options.signal),
    },
    cache: { old: readCache(join(dir, CACHE_FILE)), fresh: {} },
    pictures: new Map(),
    inputs,
    signal: options.signal,
  }
  // Drawing a page is for Jev to look at: without Jev, or without a browser, nothing is drawn.
  const { render } = options
  if (render && run && options.useJev)
    ctx.draw = (sample, page, sizes) =>
      drawPage(render, skillDir, run, sample, page, sizes, (line) => log(`${sample.name}: ${line}`))
  const started = performance.now()
  const results: ReportResult[] = []
  let unchanged = 0
  try {
    for (const subject of subjects) {
      if (options.signal?.aborted) throw new Error(STOPPED)
      const graded = await gradeSubject(subject, ctx)
      results.push(graded.result)
      if (graded.unchanged) unchanged += 1
      log(`${subject.name}: total ${graded.result.scores.total ?? '-'}`)
    }
    // A stop that came with the last sample's answers: the grading did not run to its end.
    if (options.signal?.aborted) throw new Error(STOPPED)
  } finally {
    // Nothing to keep and nothing kept before: no file is made for a grading that asked nothing.
    if (
      subjects.length &&
      (Object.keys(ctx.cache.fresh).length || Object.keys(ctx.cache.old).length)
    )
      writeJson(join(dir, CACHE_FILE), keptAnswers(ctx.cache, subjects.length * packs.length))
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
  // A report with no output in it, or none judged, holds no verdict: the one before it is worth more.
  const { failed, total } = unjudged(report)
  if (!total)
    log('No output to grade, so no report was written. The last one, if any, still stands.')
  else if (failed < total) writeJson(join(dir, 'report.json'), report)
  return report
}

/** The answers kept by the last grading; none when the file is absent or damaged. */
function readCache(path: string): Record<string, unknown> {
  try {
    const kept = readJson<unknown>(path, {})
    return kept && typeof kept === 'object' && !Array.isArray(kept)
      ? (kept as Record<string, unknown>)
      : {}
  } catch (error) {
    console.warn((error as Error).message)
    return {}
  }
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
  if (!isDir(dir)) throw new Error(`There is no run called ${run}.`)
  // A sample stopped before it wrote anything says nothing of the skill: it is not graded, so it scores nothing.
  const stopped = new Set(
    (readRunMeta(skillDir, run)?.samples ?? []).filter((s) => s.stopped).map((s) => s.dir),
  )
  const kept = runSamples(dir).filter((sample) => !stopped.has(sample.name))
  if (stopped.size)
    options.log?.(
      `${stopped.size} output(s) stopped before they were written: left out of grading.`,
    )
  const subjects: Subject[] = kept.map((sample) => {
    if (sample.legacy) {
      const head = readHead(join(sample.path, sample.name))
      return { ...sample, caseRef: head.case ?? sample.name, label: head.label, tests: head.tests }
    }
    // A sample folder is `<case>-s<n>`: the case is read from the name whole, never guessed by prefix.
    return {
      ...sample,
      caseRef: parseSampleDir(sample.name)?.case ?? sample.name,
      label: null,
      tests: [],
    }
  })
  const inputs = join(dir, INPUTS_DIR)
  return gradeSubjects(skillDir, dir, subjects, options, isDir(inputs) ? inputs : null, run)
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
