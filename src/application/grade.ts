/**
 * Grade a run or the anchors: every active pack asks its questions about each
 * sample's primary artifact, the raw answers go in `report.json`, and the
 * scores come from core so the app can rescore as a setting moves.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { type PageRenderer, RENDER_SIZES, type RenderSize } from '@domain/artifact-address.ts'
import { isPicture } from '@domain/case-draft.ts'
import { mergeConfig } from '@domain/config.ts'
import { fitForJev, PICTURE_HEAD_BYTES, pictureSize } from '@domain/image.ts'
import { packFailedFlag, packFailure } from '@domain/pack.ts'
import { primaryArtifact } from '@domain/primary.ts'
import { NOTES_FILE } from '@domain/prompt.ts'
import type { Rule } from '@domain/rules.ts'
import { parseSampleDir } from '@domain/run-name.ts'
import type { Artifact, BenchConfig, Case, Report, ReportResult } from '@domain/schemas.ts'
import { scoreResult } from '@domain/scoring.ts'
import { copyOf, pageText, unitsOf, words } from '@domain/text.ts'
import type { Sample } from '@domain/views.ts'
import { benchPath, findCase, loadCases, loadRules } from '@infrastructure/cases.ts'
import { commandRunner } from '@infrastructure/exec.ts'
import {
  assertInside,
  isDir,
  isFile,
  readJson,
  readStart,
  writeJson,
  writeText,
} from '@infrastructure/fs.ts'
import {
  anchorsDir,
  finishedSamples,
  readHead,
  runDir,
  runSamples,
  skillCopy,
} from '@infrastructure/runs.ts'
import { readTranscript } from '@infrastructure/transcript.ts'
import { readForJev, requestImages } from '@judges/images.ts'
import { packById } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import { agentPicture } from '@judges/shared/picture.ts'
import type { FittedPicture, JudgeContext, JudgeInput, JudgePack, PageShot } from '@judges/types.ts'
import { INPUTS_DIR, stagedInputs } from './generate.ts'

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
   * pack looks at any screenshot the agent left.
   */
  render?: PageRenderer
}

/** The folder of a sample the pages drawn for grading are kept in: beside outputs/, never in it. */
const RENDERS_DIR = 'renders'

/** The file beside `report.json` that keeps each pack's raw answers by the hash of what it was asked. */
const CACHE_FILE = 'judge-cache.json'
/** What a grading that was stopped rejects with. */
const STOPPED = 'Stopped.'

interface Subject extends Sample {
  caseRef: string | null
  /** `caseRef` is a legacy flat file's own name, which only starts with its case's id. */
  caseFromFileName?: boolean
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
  /** The SKILL.md the rules were read from; null when `bench.json` lists them or there is none. */
  skill: string | null
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
  /** Draws a picture the agent made at a size Jev reads; absent when the host cannot. */
  fit?: (sample: Sample, picture: string) => Promise<Fitted | null>
}

/** A picture drawn again to fit, with a hash of the copy so an answer about it is kept by what it saw. */
interface Fitted {
  picture: FittedPicture
  hash: string
}

/** The run a grading reads, and the copies it kept of the moment it started. */
interface RunCopies {
  name: string
  /** Its cases' input files as the agents got them; null for a run made before runs kept them. */
  inputs: string | null
  /** The skill as the agents got it, whose rules the run is graded on; null for a run that kept none. */
  skill: string | null
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
        // Whole or not at all: half a picture would be newer than the page, and never drawn again.
        writeText(path, png)
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
 * A picture the agent made, drawn again inside the sizes Jev reads when one
 * of its sides is outside them: Jev refuses such a picture whole, and an
 * output that is one would get no rule, no check and no score. Kept in the
 * sample's `renders/` folder like a page, named by the picture and the size.
 * Null when the picture fits as it is, cannot be read, or cannot be drawn.
 */
async function fitPicture(
  render: PageRenderer,
  skillDir: string,
  run: string,
  sample: Sample,
  file: string,
  log: (line: string) => void,
): Promise<Fitted | null> {
  const source = fileInside(sample.path, join(sample.path, file))
  if (source === null) return null
  const pixels = pictureSize(readStart(source, PICTURE_HEAD_BYTES), file)
  if (!pixels) return null
  const fit = fitForJev(pixels[0], pixels[1])
  if (fit.width === pixels[0] && fit.height === pixels[1]) return null
  const name = basename(file).replace(/\.[a-z0-9]+$/i, '')
  const path = join(sample.path, RENDERS_DIR, `${name}-${fit.width}x${fit.height}.png`)
  if (!isFile(path) || statSync(path).mtimeMs < statSync(source).mtimeMs) {
    try {
      // A window of the picture's own shape shows the whole of it, scaled down to the window.
      const png = await render(
        { skill: skillDir, run, sample: sample.name, file },
        { width: fit.width, height: fit.height },
      )
      writeText(path, png)
    } catch (error) {
      log(`${basename(file)} could not be drawn at a size Jev reads: ${(error as Error).message}`)
      return null
    }
  }
  return {
    picture: { file, pixels, read: readForJev(path) },
    hash: createHash('sha256').update(readFileSync(path)).digest('hex'),
  }
}

/** The keys of `bench.json` no pack's answer rests on: they apply after, in scoring, or choose what is judged. */
const SCORING_KEYS = new Set(['weights', 'yes', 'no', 'packs'])

/**
 * The settings of `config` a pack's answer can depend on: every key but the
 * points and the threshold, which apply after, the list of packs, whose one
 * effect on a pack is which file is judged, and the settings that are another
 * pack's alone. So moving one of those never has this pack asked again.
 */
function askedConfig(pack: JudgePack, config: BenchConfig): Record<string, unknown> {
  const own = new Set(Object.keys(pack.defaults))
  const others = new Set(
    scorers.filter((other) => other.id !== pack.id).flatMap((other) => Object.keys(other.defaults)),
  )
  return Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => !SCORING_KEYS.has(key) && (own.has(key) || !others.has(key)),
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
 * kept no copy. The run's copy is looked for wherever the run may have put it
 * (`stagedInputs`), since the case's other files may have changed since. Null
 * when there is no such file.
 */
function requestPicture(ctx: GradeContext, testCase: Case, rel: string): string | null {
  const { inputs } = ctx
  if (!inputs) return fileInside(ctx.judge.skillDir, join(ctx.judge.skillDir, rel))
  for (const staged of stagedInputs(inputs, testCase, rel)) {
    const path = fileInside(inputs, staged)
    if (path !== null) return path
  }
  return null
}

/** Each picture the case's request came with, by its path in the skill: where it is read, or null when it is not there. */
const requestPictures = (
  ctx: GradeContext,
  testCase: Case | null,
): Array<[string, string | null]> =>
  testCase
    ? testCase.files
        .filter((rel) => isPicture(testCase, rel))
        .map((rel) => [rel, requestPicture(ctx, testCase, rel)])
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

/**
 * The skill's `bench.json`, with the call's overrides and pack list laid over
 * it. A pack the call names that the app does not have is refused: a file may
 * outlive a pack, but a name typed for this grading is a mistake to say.
 */
function benchFor(skillDir: string, options: Pick<GradeOptions, 'packs' | 'config'>): BenchConfig {
  const unknown = options.packs?.find((id) => !packById(id))
  if (unknown !== undefined) throw new Error(`No judge pack named ${unknown}.`)
  const saved = readJson<Partial<BenchConfig>>(benchPath(skillDir), {})
  return mergeConfig(
    { ...saved, ...options.config, ...(options.packs ? { packs: options.packs } : {}) },
    scorers,
  )
}

/** How much of each file beside the primary one a pack is given, and of all of them together. */
const OTHER_FILE_CHARS = 6000
const OTHER_FILES_CHARS = 18_000
const READ_AS_TEXT = new Set(['markdown', 'html', 'code'])

/**
 * The start of each text file the agent wrote beside the primary one, in the
 * order they are listed, until the room for them is used. A copy of the
 * primary file, such as a preview that is the page itself, is left out.
 */
function othersOf(
  sample: Sample,
  primary: Artifact | null,
  primaryText: string,
): JudgeInput['others'] {
  const others: JudgeInput['others'] = []
  let room = OTHER_FILES_CHARS
  for (const artifact of sample.artifacts) {
    if (room <= 0) break
    if (artifact.file === primary?.file || !READ_AS_TEXT.has(artifact.kind)) continue
    const path = fileInside(sample.path, join(sample.path, artifact.file))
    if (path === null) continue
    // Read by bytes so a file of any size costs no more than its start.
    const start = new TextDecoder().decode(readStart(path, OTHER_FILE_CHARS * 4))
    if (!start.trim() || start === primaryText.slice(0, start.length)) continue
    const text = start.slice(0, Math.min(OTHER_FILE_CHARS, room))
    others.push({ file: artifact.file, text })
    room -= text.length
  }
  return others
}

/**
 * What the agent told the user beside its files; null when it wrote none. The
 * file is the agent's, so a link out of the sample or anything that is not a
 * file is not read.
 */
function notesOf(sampleDir: string): string | null {
  const path = fileInside(sampleDir, join(sampleDir, NOTES_FILE))
  return path === null ? null : readFileSync(path, 'utf8')
}

/** One sample as the packs see it. */
function judgeInput(
  ctx: GradeContext,
  sample: Sample,
  testCase: Case | null,
  log: (line: string) => void,
): JudgeInput {
  const primary = primaryArtifact(
    sample.artifacts,
    testCase?.bench.artifact,
    ctx.packs.flatMap((pack) => pack.artifacts),
  )
  const raw =
    primary && primary.kind !== 'image' ? readFileSync(join(sample.path, primary.file), 'utf8') : ''
  const markdown = primary?.kind === 'markdown'
  const text = markdown ? copyOf(raw) : raw
  return {
    text,
    units: markdown ? unitsOf(text) : [],
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
    skill: ctx.skill,
    artifacts: sample.artifacts,
    primary,
    others: sample.legacy ? [] : othersOf(sample, primary, raw),
    notes: sample.legacy ? null : notesOf(sample.path),
    transcript: readTranscript(join(sample.path, 'transcript.jsonl')),
    dir: sample.path,
    renders: [],
  }
}

/**
 * The hash of everything a pack's answer depends on: the model, the pack and
 * the version of its questions, the output and what it is judged against.
 * Points per layer and the `yes` and `no` thresholds are left out, since they are
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
    case: input.case,
    pictures,
    rules: input.rules,
    skill: input.skill,
    artifacts: input.artifacts,
    primary: input.primary,
    others: input.others,
    notes: input.notes,
    transcript: input.transcript,
  }
  return createHash('sha256').update(JSON.stringify(asked)).digest('hex')
}

/**
 * Whether `pack` has anything to say of this sample. A pack with no kinds
 * judges every sample. One that judges the sample's folder judges every sample
 * that has a folder: a flat file, an anchor included, has none for a command
 * to run in. Any other judges the samples whose primary artifact is of its kinds.
 */
function applies(pack: JudgePack, subject: Subject, primary: Artifact | null): boolean {
  if (pack.artifacts.length === 0) return true
  if (pack.wholeSample) return !subject.legacy
  return primary !== null && pack.artifacts.includes(primary.kind)
}

/**
 * The text a case's word range counts: the prose and list text of Markdown,
 * not its headings or code; what a reader sees of a page, not its markup; and
 * every word of anything else.
 */
function countedText({ primary, text, units }: JudgeInput): string {
  if (primary?.kind === 'markdown') return units.map((unit) => unit.text).join(' ')
  return primary?.kind === 'html' ? pageText(text) : text
}

/**
 * `work`, or a rejection with "Stopped." the moment the stop comes: an answer
 * still on its way is not waited for, and is no answer once it lands.
 */
function untilStopped<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error(STOPPED))
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
  })
}

async function gradeSubject(
  subject: Subject,
  ctx: GradeContext,
): Promise<{ result: ReportResult; unchanged: boolean }> {
  const testCase = findCase(ctx.cases, subject.caseRef, { fileName: subject.caseFromFileName })
  const input = judgeInput(ctx, subject, testCase, (line) =>
    ctx.judge.log(`${subject.name}: ${line}`),
  )
  const { primary } = input
  const pictures = casePictures(ctx, testCase)
  // The page is drawn only when a pack will look at it, and a pack that does is asked again when it changes.
  const looks = ctx.packs.some((pack) => pack.renders)
  const drawn =
    looks && ctx.draw && primary?.kind === 'html' && !subject.legacy
      ? await untilStopped(ctx.draw(subject, primary, renderSizes(testCase)), ctx.signal)
      : NOTHING_DRAWN
  input.renders = drawn.shots
  // A picture is fitted only where it is what Jev looks at: no page was drawn in its place.
  const shot = looks && !drawn.shots.some((s) => s.read.image) ? agentPicture(input) : null
  const fitted =
    shot && ctx.fit && !subject.legacy
      ? await untilStopped(ctx.fit(subject, shot.file), ctx.signal)
      : null
  if (fitted) input.fitted = fitted.picture
  const seen = fitted ? { ...drawn.hashes, 'fitted:picture': fitted.hash } : drawn.hashes
  const packs: Record<string, unknown> = {}
  /** This sample's new answers: kept only once the whole sample was judged without a stop. */
  const answers: Record<string, unknown> = {}
  const failures: string[] = []
  /** The packs whose answers the cache keeps, and how many of them it had. */
  let keepable = 0
  let kept = 0
  for (const pack of ctx.packs) {
    if (!applies(pack, subject, primary)) {
      packs[pack.id] = null
      continue
    }
    // A pack that reads its answer off the machine has no key: it is run at every grading.
    const key = pack.live
      ? null
      : judgeKey(pack, input, pack.renders ? { ...pictures, ...seen } : pictures, ctx)
    if (key !== null) {
      keepable += 1
      if (Object.hasOwn(ctx.cache.old, key)) {
        packs[pack.id] = ctx.cache.old[key]
        ctx.cache.fresh[key] = ctx.cache.old[key]
        kept += 1
        continue
      }
    }
    try {
      const answer = await untilStopped(pack.judge(input, ctx.judge), ctx.signal)
      packs[pack.id] = answer
      if (key !== null) answers[key] = answer
    } catch (error) {
      // A command ended by the stop is no answer, and no failure of the pack either.
      if (ctx.signal?.aborted) throw new Error(STOPPED)
      // One pack failing leaves its layers out of the total, so the report says so.
      const failure = packFailedFlag(pack.id, (error as Error).message)
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
    words: words(countedText(input)).length,
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
  // The failures go in with the output: one a pack failed on has no total, and its flags open with why.
  const scored = scoreResult({ ...base, flags: failures }, ctx.judge.config, scorers)
  return {
    result: {
      ...base,
      scores: scored.scores,
      flags: scored.flags,
      confidence: scored.confidence,
    },
    // Unchanged is said of what the cache keeps: Jev was asked nothing new about this output.
    unchanged: keepable > 0 && kept === keepable,
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
 * for is never asked for twice. `run` is the run graded and what it kept of
 * the moment it started; anchors have none, and are graded on the skill as it
 * is now.
 */
async function gradeSubjects(
  skillDir: string,
  dir: string,
  subjects: Subject[],
  options: GradeOptions,
  run: RunCopies | null = null,
): Promise<Report> {
  if (options.useJev && !Jev.available())
    throw new Error('No TypeSafe key is set, so Jev cannot judge. Add the key in Settings.')
  const config = benchFor(skillDir, options)
  // `mergeConfig` keeps only the packs the app has, so each id names one.
  const packs = config.packs.flatMap((id) => packById(id) ?? [])
  const jev = new Jev(options.model)
  const log = options.log ?? (() => {})
  // A run is graded on the rules of the skill it ran, whatever the skill says since.
  const ruled = run?.skill ?? skillDir
  const ctx: GradeContext = {
    cases: loadCases(skillDir),
    rules: loadRules(ruled, config),
    skill: config.rules?.length ? null : skillText(ruled),
    packs,
    judge: {
      jev,
      useJev: options.useJev,
      config,
      skillDir,
      log,
      signal: options.signal,
      run: commandRunner(options.signal),
    },
    cache: { old: readCache(join(dir, CACHE_FILE)), fresh: {} },
    pictures: new Map(),
    inputs: run?.inputs ?? null,
    signal: options.signal,
  }
  // Drawing a page is for Jev to look at: without Jev, or without a browser, nothing is drawn.
  const { render } = options
  if (render && run && options.useJev) {
    ctx.draw = (sample, page, sizes) =>
      drawPage(render, skillDir, run.name, sample, page, sizes, (line) =>
        log(`${sample.name}: ${line}`),
      )
    ctx.fit = (sample, picture) =>
      fitPicture(render, skillDir, run.name, sample, picture, (line) =>
        log(`${sample.name}: ${line}`),
      )
  }
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

/** The SKILL.md in `dir`, as it is written; null when there is none. */
function skillText(dir: string): string | null {
  const path = join(dir, 'SKILL.md')
  return isFile(path) ? readFileSync(path, 'utf8') : null
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
 * pack that throws (an expired key, no network) leaves its layers null and
 * the output without a total (`scoreResult`), so a report with failures holds
 * fewer scores than it has outputs.
 */
export function unjudged(report: Report): { failed: number; total: number; reason: string | null } {
  // The first failure of each output that has one.
  const failures = report.results.flatMap(
    (r) => r.flags.find((flag) => packFailure(flag) !== null) ?? [],
  )
  return { failed: failures.length, total: report.results.length, reason: failures[0] ?? null }
}

/**
 * Whether a grading of `run` that would ask Jev can: true with a TypeSafe key.
 * With none, a run Jev never scored is graded by code alone, so false. A run
 * Jev scored is refused: a grading without Jev holds none of Jev's answers,
 * and would write the scores they gave out of the report.
 */
export function jevForRun(skillDir: string, run: string): boolean {
  if (Jev.available()) return true
  let scored: Partial<Report> | null = null
  try {
    scored = readJson<Partial<Report> | null>(join(runDir(skillDir, run), 'report.json'), null)
  } catch {
    // A report that cannot be read holds no score to lose.
  }
  if (scored?.model)
    throw new Error(
      'Jev scored this run, and no TypeSafe key is set to grade it again. Add the key in Settings.',
    )
  return false
}

/** Grade every sample of a run and write its `report.json`. */
export async function gradeRun(
  skillDir: string,
  run: string,
  options: GradeOptions,
): Promise<Report> {
  const dir = runDir(skillDir, run)
  if (!isDir(dir)) throw new Error(`There is no run called ${run}.`)
  // A sample whose agent was stopped or cut off says nothing of the skill: it is not graded, so it scores nothing.
  const { samples, unfinished } = finishedSamples(skillDir, run)
  if (unfinished)
    options.log?.(`${unfinished} output(s) stopped before they were finished: left out of grading.`)
  const subjects: Subject[] = samples.map((sample) => {
    if (sample.legacy) {
      const head = readHead(join(sample.path, sample.name))
      // A flat file that names no case is its case's by the start of its own name.
      return {
        ...sample,
        caseRef: head.case ?? sample.name,
        caseFromFileName: head.case === null,
        label: head.label,
        tests: head.tests,
      }
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
  const skill = skillCopy(skillDir, run)
  return gradeSubjects(skillDir, dir, subjects, options, {
    name: run,
    inputs: isDir(inputs) ? inputs : null,
    skill: isFile(join(skill, 'SKILL.md')) ? skill : null,
  })
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
      // A layer with no score on either side says nothing, so it is no pass.
      const ok = g !== null && b !== null && g > b
      lines.push({ bad: bad.sample, layer, good: g, badScore: b, ok })
    }
  }
  return { lines, failures: lines.filter((l) => !l.ok).length }
}

export interface CompareRow {
  key: string
  deltas: Record<string, number | null>
}

/**
 * Per-sample score deltas between two reports. Between two runs of sample
 * folders, a sample is matched with the one of its name, which holds its case
 * and its number, so `email-s2` is read against `email-s2` however many
 * samples either run has. A run of legacy flat files names its files its own
 * way, so against one the samples are matched by their case, in order.
 */
export function compareReports(before: Report, after: Report): CompareRow[] {
  const caseOf = (r: ReportResult) => r.case ?? r.sample
  const folders = (report: Report) => report.results.every((r) => parseSampleDir(r.sample))
  const byName = folders(before) && folders(after)
  const keyOf = (r: ReportResult) => (byName ? r.sample : caseOf(r))
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
    return [{ key: `${caseOf(r)} ${r.sample}`, deltas }]
  })
}

/**
 * A report as the app shows it: each output's stored answers scored under the
 * skill's `bench.json` as it is now, with the call's overrides laid over it,
 * and without the reader's corrections. So what `st report` and `st compare`
 * print follows a setting changed since the grading, as Results does.
 */
export function scoredReport(
  skillDir: string,
  report: Report,
  options: Pick<GradeOptions, 'packs' | 'config'> = {},
): Report {
  const config = benchFor(skillDir, options)
  return {
    ...report,
    config,
    packs: config.packs,
    results: report.results.map((result) => {
      const { scores, flags, confidence } = scoreResult(result, config, scorers)
      return { ...result, scores, flags, confidence }
    }),
  }
}
