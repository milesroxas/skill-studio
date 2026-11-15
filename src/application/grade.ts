/**
 * Grade a run or the anchors: every active pack asks its questions about each
 * sample's primary artifact, the raw answers go in `report.json`, and the
 * scores come from core so the app can rescore as a setting moves.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { type PageRenderer, RENDER_SIZES, type RenderSize } from '@domain/artifact-address.ts'
import { inputName, isPicture } from '@domain/case-draft.ts'
import { mergeConfig } from '@domain/config.ts'
import {
  fitForJev,
  imageTypeOf,
  JEV_IMAGE,
  jevImageProblem,
  orientationOf,
  PICTURE_HEAD_BYTES,
  pictureSize,
} from '@domain/image.ts'
import { type PageLayout, readLayout } from '@domain/layout.ts'
import { packFailedFlag, packFailure } from '@domain/pack.ts'
import { differing, SAME_PICTURE, scaleOf } from '@domain/picture-match.ts'
import { primaryArtifact } from '@domain/primary.ts'
import { NOTES_FILE } from '@domain/prompt.ts'
import type { Rule } from '@domain/rules.ts'
import { parseSampleDir } from '@domain/run-name.ts'
import type { Artifact, BenchConfig, Case, Report, ReportResult } from '@domain/schemas.ts'
import { behindOf, gradedNow, scoreResult } from '@domain/scoring.ts'
import { copyOf, pageText, unitsOf, words } from '@domain/text.ts'
import type { RunCase, Sample } from '@domain/views.ts'
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
import { readPng } from '@infrastructure/png.ts'
import { CASES_FILE, type KeptCase, readKept, takenCase } from '@infrastructure/run-cases.ts'
import {
  anchorsDir,
  finishedSamples,
  readHead,
  readRunMeta,
  readSampleTranscript,
  runDir,
  runSamples,
  skillCopy,
} from '@infrastructure/runs.ts'
import { readForJev, requestImages } from '@judges/images.ts'
import { packById, packVersions } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import { agentPicture } from '@judges/shared/picture.ts'
import { asksJev } from '@judges/shared/questions.ts'
import type {
  FileStart,
  FittedPicture,
  JudgeContext,
  JudgeInput,
  JudgePack,
  PageShot,
  SourcePage,
} from '@judges/types.ts'
import { INPUTS_DIR, stagedInputs } from './generate.ts'
import { type Asked, cachedAsker, JudgeCache } from './judge-cache.ts'

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

/** The file beside `report.json` that keeps Jev's answers by the hash of what each was asked (`JudgeCache`). */
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

interface GradeContext {
  /** The skill's cases as they are now. */
  cases: Case[]
  /**
   * The cases the run kept as it started: what its agents were asked. Null for
   * anchors, and for a run made before runs kept them.
   */
  kept: KeptCase[] | null
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
  /** Finds the page a picture was made from, by drawing it; absent when the host cannot. */
  source?: (
    sample: Sample,
    picture: string,
    size: [number, number] | null,
  ) => Promise<Sourced | null>
}

/** The page a picture was made from, with a hash so an answer that read its measures is kept by them. */
interface Sourced {
  page: SourcePage
  hash: string
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
  /** Its cases as the agents were asked them; null for a run that kept none. */
  cases: KeptCase[] | null
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

/** The layout kept beside a page's picture, or null when there is none or it does not read. */
function keptLayout(path: string): PageLayout | null {
  if (!isFile(path)) return null
  try {
    return readLayout(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

/**
 * Draw the page at each of `RENDER_SIZES`, kept in the sample's `renders/`
 * folder with the layout the window measured, and drawn again only when the
 * page is newer than the picture or the picture has no layout beside it. A
 * size that cannot be drawn is logged and left out: the pack judges without it.
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
    const name = `${size.id}-${size.width}x${size.height}`
    const path = join(sample.path, RENDERS_DIR, `${name}.png`)
    // What the window measured, beside the picture it drew. A picture drawn before pages
    // were measured has none, and is drawn once more for it.
    const measured = join(sample.path, RENDERS_DIR, `${name}.json`)
    if (!isFile(path) || statSync(path).mtimeMs < source || !isFile(measured)) {
      try {
        const shot = await render(
          { skill: skillDir, run, sample: sample.name, file: page.file },
          { width: size.width, height: size.height },
        )
        // Whole or not at all: half a picture would be newer than the page, and never drawn again.
        writeText(path, shot.png)
        // A page that could not be measured keeps a file that says so, and is not drawn on every grading.
        writeText(measured, JSON.stringify(shot.layout))
      } catch (error) {
        log(`the page could not be drawn at ${size.id} width: ${(error as Error).message}`)
        continue
      }
    }
    const layout = keptLayout(measured)
    drawn.shots.push({ size, read: readForJev(path), layout })
    drawn.hashes[`render:${size.id}`] = createHash('sha256')
      .update(readFileSync(path))
      .digest('hex')
    // An answer rests on the layout too: a page measured since is asked about again.
    if (layout)
      drawn.hashes[`layout:${size.id}`] = createHash('sha256')
        .update(JSON.stringify(layout))
        .digest('hex')
  }
  return drawn
}

/**
 * A picture the agent made, drawn again by the app when Jev would refuse it or
 * show it otherwise than it looks (`jevImageProblem`): a side outside the sizes
 * Jev reads, an animated PNG, a JPEG saved to load in passes, a photo turned
 * by its camera note. Jev refuses such a picture whole, and an output that is
 * one would get no rule, no check and no score. The copy is a still PNG,
 * upright, inside the sizes, kept in the sample's `renders/` folder like a
 * page, named by the picture and the size. Null when Jev reads the picture as
 * it is, or it cannot be read or drawn.
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
  const head = readStart(source, PICTURE_HEAD_BYTES)
  const stored = pictureSize(head, file)
  if (!stored) return null
  // A photo its note turns a quarter is upright with its sides the other way round.
  const pixels: [number, number] = (orientationOf(head) ?? 1) >= 5 ? [stored[1], stored[0]] : stored
  // A picture Jev reads as it is goes as it is.
  if (statSync(source).size <= JEV_IMAGE.maxBytes && jevImageProblem(head) === null) return null
  const fit = fitForJev(pixels[0], pixels[1])
  const name = basename(file).replace(/\.[a-z0-9]+$/i, '')
  const path = join(sample.path, RENDERS_DIR, `${name}-${fit.width}x${fit.height}.png`)
  if (!isFile(path) || statSync(path).mtimeMs < statSync(source).mtimeMs) {
    try {
      // A window of the picture's own shape shows the whole of it, scaled down to the window.
      const { png } = await render(
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

/** The longest side a page is drawn at without its picture being scaled down after. */
const UNSCALED_SIDE = 1568

/**
 * The windows a page may have been drawn in to make a picture of `pixels`:
 * the case's size when it names one, else the picture's own size, then a half
 * and a third of it, for an export at 2x or 3x.
 */
function sourceWindows(
  pixels: [number, number],
  size: [number, number] | null,
): [number, number][] {
  const candidates: [number, number][] = size
    ? [size]
    : [1, 2, 3].map((times): [number, number] => [pixels[0] / times, pixels[1] / times])
  return candidates.filter(
    ([width, height]) =>
      Number.isInteger(width) &&
      Number.isInteger(height) &&
      Math.max(width, height) <= UNSCALED_SIDE &&
      scaleOf({ width: pixels[0], height: pixels[1] }, { width, height }) !== null,
  )
}

/** A comparison kept beside a drawing: the picture it was of, and the share of pixels that differed. */
function keptVerdict(path: string): { file: string; differs: number | null } | null {
  const kept = readJson<unknown>(path, null)
  if (typeof kept !== 'object' || kept === null) return null
  const { file, differs } = kept as { file?: unknown; differs?: unknown }
  return typeof file === 'string'
    ? { file, differs: typeof differs === 'number' && Number.isFinite(differs) ? differs : null }
    : null
}

/**
 * The page beside a picture that is the work, when it draws that picture. An
 * agent often writes a page to make a picture: the picture is what is used,
 * and the page is where a size or a place can be measured. The page is drawn
 * in the window the picture's size points to and the two are compared, pixel
 * by pixel. Only a page that draws the same picture is its source: one
 * changed since the export would give the picture measures that are not its
 * own. The verdict is kept beside the drawing, and read again only when the
 * picture or the page changes. Null when there is no page, the picture is not
 * a PNG that is read, or the two differ.
 */
async function sourcePage(
  render: PageRenderer,
  skillDir: string,
  run: string,
  sample: Sample,
  file: string,
  size: [number, number] | null,
  log: (line: string) => void,
): Promise<Sourced | null> {
  const page = primaryArtifact(sample.artifacts, 'html')
  const picture = fileInside(sample.path, join(sample.path, file))
  if (page?.kind !== 'html' || picture === null) return null
  const pixels = pictureSize(readStart(picture, PICTURE_HEAD_BYTES), file)
  if (!pixels) return null
  for (const [width, height] of sourceWindows(pixels, size)) {
    const window: RenderSize = { id: 'desktop', width, height }
    const { shots } = await drawPage(render, skillDir, run, sample, page, [window], log)
    const drawing = join(sample.path, RENDERS_DIR, `desktop-${width}x${height}.png`)
    if (!shots.length || !isFile(drawing)) continue
    const verdict = join(sample.path, RENDERS_DIR, `desktop-${width}x${height}.match.json`)
    const kept = isFile(verdict) ? keptVerdict(verdict) : null
    const fresh =
      kept?.file === file &&
      statSync(verdict).mtimeMs >= Math.max(statSync(picture).mtimeMs, statSync(drawing).mtimeMs)
    let differs = fresh ? kept.differs : null
    if (!fresh) {
      const [a, b] = [picture, drawing].map((path) => readPng(new Uint8Array(readFileSync(path))))
      differs = a && b ? differing(a, b) : null
      writeText(verdict, JSON.stringify({ file, differs }))
    }
    if (differs === null || differs > SAME_PICTURE) continue
    const layout = shots[0].layout
    return {
      page: { file: page.file, window: [width, height], times: pixels[0] / width, layout },
      hash: createHash('sha256')
        .update(JSON.stringify([page.file, width, height, layout]))
        .digest('hex'),
    }
  }
  log(`${basename(file)} is not what ${basename(page.file)} draws, so nothing is measured for it`)
  return null
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
 * Where a file the case's request came with is read, a picture or a text file:
 * from the run's copy of the case's input files, so a file changed or added
 * since the run is not judged as what the agent saw, and from the case as it is now for a run that
 * kept no copy. The run's copy is looked for wherever the run may have put it
 * (`stagedInputs`), since the case's other files may have changed since. Null
 * when there is no such file.
 */
function requestFile(ctx: GradeContext, testCase: Case, rel: string): string | null {
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
        .map((rel) => [rel, requestFile(ctx, testCase, rel)])
    : []

/**
 * How much of each text file a case's request came with is read, and of all of
 * them together: more than a request holds, which the pack shares out among them.
 */
const REQUEST_FILE_CHARS = 8000
const REQUEST_FILES_CHARS = 80_000

/** Whether the start of a file reads as text: no NUL byte, and next to nothing that is not a character. */
function readsAsText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null
  const text = new TextDecoder().decode(bytes)
  const unreadable = text.split('\uFFFD').length - 1
  return unreadable > Math.max(4, text.length / 100) ? null : text
}

/**
 * The start of each text file the case's request came with, read where the run
 * kept it, in the case's order, until the room for them is used: the files the
 * agent had to work from, which a rule may hold the work to. The generic pack
 * shares out what a request holds among them. Pictures go to
 * Jev as pictures, and any other file that is not text is left out. A file that
 * goes on past its start is marked `cut`, and one past the room is listed with
 * no text, so the output is flagged with what Jev did not read.
 */
function requestFilesOf(ctx: GradeContext, testCase: Case | null): FileStart[] {
  if (!testCase) return []
  const files: FileStart[] = []
  let room = REQUEST_FILES_CHARS
  for (const rel of testCase.files) {
    if (imageTypeOf(rel)) continue
    const path = requestFile(ctx, testCase, rel)
    if (path === null) continue
    const bytes = REQUEST_FILE_CHARS * 4
    const start = readsAsText(readStart(path, bytes))
    if (!start?.trim()) continue
    const text = start.slice(0, Math.max(0, Math.min(REQUEST_FILE_CHARS, room)))
    const cut = text.length < start.length || statSync(path).size > bytes
    const file = inputName(testCase, rel)
    files.push(cut ? { file, text, cut } : { file, text })
    room -= text.length
  }
  return files
}

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

/** The hash of each file a sample's agent wrote, by its name, read once a grading. */
function outputHashes(ctx: GradeContext, sample: Sample): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const { file } of sample.artifacts) {
    const path = fileInside(sample.path, join(sample.path, file))
    let hash = path === null ? 'missing' : ctx.pictures.get(path)
    if (hash === undefined && path !== null) {
      hash = createHash('sha256').update(readFileSync(path)).digest('hex')
      ctx.pictures.set(path, hash)
    }
    hashes[`output:${file}`] = hash ?? 'missing'
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
 * primary file, such as a preview that is the page itself, is left out. A file
 * that goes on past its start is marked `cut`, and one past the room is listed
 * with no text, so the output is flagged with what Jev did not read.
 */
function othersOf(
  sample: Sample,
  primary: Artifact | null,
  primaryText: string,
): JudgeInput['others'] {
  const others: JudgeInput['others'] = []
  let room = OTHER_FILES_CHARS
  for (const artifact of sample.artifacts) {
    if (artifact.file === primary?.file || !READ_AS_TEXT.has(artifact.kind)) continue
    const path = fileInside(sample.path, join(sample.path, artifact.file))
    if (path === null) continue
    // Read by bytes so a file of any size costs no more than its start.
    const bytes = OTHER_FILE_CHARS * 4
    const start = new TextDecoder().decode(readStart(path, bytes))
    if (!start.trim() || start === primaryText.slice(0, start.length)) continue
    const text = start.slice(0, Math.max(0, Math.min(OTHER_FILE_CHARS, room)))
    const cut = text.length < start.length || statSync(path).size > bytes
    others.push(cut ? { file: artifact.file, text, cut } : { file: artifact.file, text })
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
    testCase?.prompt,
  )
  const raw =
    primary && primary.kind !== 'image' && primary.kind !== 'other'
      ? readFileSync(join(sample.path, primary.file), 'utf8')
      : ''
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
    requestFiles: requestFilesOf(ctx, testCase),
    rules: ctx.rules,
    skill: ctx.skill,
    artifacts: sample.artifacts,
    primary,
    others: sample.legacy ? [] : othersOf(sample, primary, raw),
    notes: sample.legacy ? null : notesOf(sample.path),
    transcript: readSampleTranscript(sample.path),
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
    requestFiles: input.requestFiles ?? [],
    notes: input.notes,
    transcript: input.transcript,
  }
  return createHash('sha256').update(JSON.stringify(asked)).digest('hex')
}

/**
 * Whether `pack` has anything to say of this sample. None has of an output
 * that stands on a file of a kind Jev cannot read (`other`). A pack with no kinds
 * judges every sample. One that judges the sample's folder judges every sample
 * that has a folder: a flat file, an anchor included, has none for a command
 * to run in. Any other judges the samples whose primary artifact is of its kinds.
 */
function applies(pack: JudgePack, subject: Subject, primary: Artifact | null): boolean {
  // A file Jev cannot read, such as a PDF, is judged by no pack: the output has no score.
  if (primary?.kind === 'other') return false
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

/**
 * The case an output is graded on. While the skill's case asks what the run
 * was asked, it is the skill's, so its checks are read as they are now. Once
 * its prompt or files have changed, or the case is gone, it is the run's own
 * copy: an output is never held to a request its agent did not get.
 */
function caseOf(subject: Subject, ctx: GradeContext) {
  const live = findCase(ctx.cases, subject.caseRef, { fileName: subject.caseFromFileName })
  const id = live?.id ?? subject.caseRef
  const kept = ctx.kept?.find((entry) => entry.case.id === id) ?? null
  return takenCase(ctx.judge.skillDir, kept, live)
}

async function gradeSubject(
  subject: Subject,
  ctx: GradeContext,
): Promise<{ result: ReportResult; unchanged: boolean; asked: number }> {
  const taken = caseOf(subject, ctx)
  const testCase = taken?.case ?? null
  const input = judgeInput(ctx, subject, testCase, (line) =>
    ctx.judge.log(`${subject.name}: ${line}`),
  )
  const { primary } = input
  // The bytes of every file the agent wrote are in each pack's hash: a picture has no text to hash, and one rewritten is new work.
  const pictures = { ...casePictures(ctx, testCase), ...outputHashes(ctx, subject) }
  // The page is drawn only when a pack will look at it, and a pack that does is asked again when it changes.
  // A pack looks when it judges this output, Jev is asked of this case and the pack has a question for it.
  const looks =
    asksJev(input, ctx.judge) &&
    ctx.packs.some(
      (pack) => pack.renders && applies(pack, subject, primary) && (pack.asks?.(input) ?? true),
    )
  const drawn =
    looks && ctx.draw && primary?.kind === 'html' && !subject.legacy
      ? await untilStopped(ctx.draw(subject, primary, renderSizes(testCase)), ctx.signal)
      : NOTHING_DRAWN
  input.renders = drawn.shots
  // Whether this output had anything for the host to draw, so a grading that drew it is told from one that could not.
  const drawable =
    looks &&
    !subject.legacy &&
    (primary?.kind === 'html' || primary?.kind === 'image' || agentPicture(input) !== null)
  // A picture is fitted only where it is what Jev looks at: no page was drawn in its place.
  const shot = looks && !drawn.shots.some((s) => s.read.image) ? agentPicture(input) : null
  const fitted =
    shot && ctx.fit && !subject.legacy
      ? await untilStopped(ctx.fit(subject, shot.file), ctx.signal)
      : null
  if (fitted) input.fitted = fitted.picture
  // A picture that is the work may have the page it was made from beside it: measured there, if so.
  const sourced =
    looks && ctx.source && primary?.kind === 'image' && !subject.legacy
      ? await untilStopped(
          ctx.source(subject, primary.file, testCase?.bench.size ?? null),
          ctx.signal,
        )
      : null
  if (sourced) input.source = sourced.page
  const seen = {
    ...drawn.hashes,
    ...(fitted ? { 'fitted:picture': fitted.hash } : {}),
    ...(sourced ? { 'source:page': sourced.hash } : {}),
  }
  const packs: Record<string, unknown> = {}
  /** This sample's new readings, with the answers each rests on: kept only once the whole sample was judged without a stop. */
  const readings: Array<{ key: string; raw: unknown; keys: string[] }> = []
  const failures: string[] = []
  /** The version of the questions of each pack that judged this output. */
  const judgedBy: Record<string, number> = {}
  /** How many of this output's questions went to Jev, and how many were answered from the cache. */
  const counts: Asked = { asked: 0, kept: 0 }
  for (const pack of ctx.packs) {
    if (!applies(pack, subject, primary)) {
      packs[pack.id] = null
      continue
    }
    // A pack that reads its answer off the machine has no key: it is run at every grading.
    const key = pack.live
      ? null
      : judgeKey(pack, input, pack.renders ? { ...pictures, ...seen } : pictures, ctx)
    const reading = key === null ? undefined : ctx.cache.pack(key)
    if (reading) {
      packs[pack.id] = reading.raw
      judgedBy[pack.id] = pack.version
      counts.kept += 1
      continue
    }
    // Whatever the pack asks Jev is asked through the cache: a question asked before over the same state is not asked again.
    const keys: string[] = []
    const judge = { ...ctx.judge, jev: cachedAsker(ctx.judge.jev, ctx.cache, pack, keys, counts) }
    try {
      const answer = await untilStopped(pack.judge(input, judge), ctx.signal)
      packs[pack.id] = answer
      judgedBy[pack.id] = pack.version
      if (key !== null) readings.push({ key, raw: answer, keys })
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
  for (const { key, raw, keys } of readings) ctx.cache.keepPack(key, raw, keys)
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
    // A text output with nothing but whitespace in it is no output; a picture always is one, and so is a file Jev cannot read.
    blank:
      primary !== null &&
      primary.kind !== 'image' &&
      primary.kind !== 'other' &&
      !input.text.trim(),
    // What the output was held to, so a grading made before its case changed is told from one made since.
    ...(taken ? { yardstick: taken.yardstick } : {}),
    // What graded it, so a grading by other questions, another model or a host that drew nothing is told apart.
    graded: {
      model: ctx.judge.useJev ? ctx.judge.jev.model : null,
      packs: judgedBy,
      ...(drawable ? { drawn: ctx.draw !== undefined } : {}),
    },
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
    unchanged: counts.asked === 0 && counts.kept > 0,
    asked: counts.asked,
  }
}

/**
 * Grade `subjects` and write the report and the judge cache in `dir`. The
 * report is written only when the grading ran to its end and judged something:
 * stopped part way, with no output to grade, or with a pack failing on every
 * output, the report there stays as it was. The cache is written either way,
 * with every sample judged whole before the stop, so an answer already paid
 * for is never asked for twice. `run` is the run graded and what it kept of
 * the moment it started; anchors have none, and are graded on the skill and
 * the cases as they are now.
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
    kept: run?.cases ?? null,
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
      once: new Map(),
    },
    cache: new JudgeCache(join(dir, CACHE_FILE)),
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
    ctx.source = (sample, picture, size) =>
      sourcePage(render, skillDir, run.name, sample, picture, size, (line) =>
        log(`${sample.name}: ${line}`),
      )
  }
  const started = performance.now()
  const results: ReportResult[] = []
  let unchanged = 0
  let questions = 0
  try {
    for (const subject of subjects) {
      if (options.signal?.aborted) throw new Error(STOPPED)
      const graded = await gradeSubject(subject, ctx)
      results.push(graded.result)
      if (graded.unchanged) unchanged += 1
      questions += graded.asked
      log(`${subject.name}: total ${graded.result.scores.total ?? '-'}`)
    }
    // A stop that came with the last sample's answers: the grading did not run to its end.
    if (options.signal?.aborted) throw new Error(STOPPED)
  } finally {
    // Nothing to keep and nothing kept before: no file is made for a grading that asked nothing.
    if (subjects.length && ctx.cache.holds) ctx.cache.write(join(dir, CACHE_FILE))
  }
  if (unchanged) log(`${unchanged} of ${subjects.length} outputs unchanged: kept their verdicts.`)
  const report: Report = {
    createdAt: new Date().toISOString(),
    model: options.useJev ? (jev.modelSeen ?? jev.model) : null,
    // What the answers cost in all, so a grading that kept them all does not write nothing over it.
    inputTokens: ctx.cache.tokens(),
    seconds: Math.round((performance.now() - started) / 100) / 10,
    asked: { questions, inputTokens: jev.inputTokens },
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
  // A sample whose agent was stopped, failed or was cut off says nothing whole of the skill: it is not graded, so it scores nothing.
  const { samples, unfinished } = finishedSamples(skillDir, run)
  if (unfinished)
    options.log?.(`${unfinished} output(s) did not run to their end: left out of grading.`)
  // A run with no end of its own is still being written, here or by another copy, or was cut off.
  const meta = readRunMeta(skillDir, run)
  if (meta && !meta.legacy && !meta.finishedAt)
    options.log?.(`${run} has not finished: only the outputs it has recorded so far are graded.`)
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
  const answered = readRunMeta(skillDir, run)?.cases
  const { kept, damaged } = readKept(dir, Array.isArray(answered) ? answered : [])
  if (damaged)
    options.log?.(
      `${CASES_FILE} does not read whole: a case it lost is graded on the case as it is now.`,
    )
  return gradeSubjects(skillDir, dir, subjects, options, {
    name: run,
    inputs: isDir(inputs) ? inputs : null,
    skill: isFile(join(skill, 'SKILL.md')) ? skill : null,
    cases: kept,
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
  /** The good anchor it is checked against; null when its case has none, which fails the line. */
  against: string | null
  layer: string
  good: number | null
  badScore: number | null
  ok: boolean
}

/**
 * Each bad anchor must score below every good anchor of its case on every
 * layer it tests. A bad anchor whose case has no good anchor fails: it was
 * written to be checked, and nothing checks it.
 */
export function selfTest(report: Report): { lines: SelfTestLine[]; failures: number } {
  const goods = new Map<string | null, ReportResult[]>()
  for (const good of report.results.filter((r) => r.label === 'good'))
    goods.set(good.case, [...(goods.get(good.case) ?? []), good])
  const lines: SelfTestLine[] = []
  for (const bad of report.results.filter((r) => r.label === 'bad')) {
    const layers = bad.tests.length ? bad.tests : ['total']
    const against = goods.get(bad.case) ?? []
    if (!against.length)
      for (const layer of layers)
        lines.push({
          bad: bad.sample,
          against: null,
          layer,
          good: null,
          badScore: bad.scores[layer] ?? null,
          ok: false,
        })
    for (const good of against)
      for (const layer of layers) {
        const g = good.scores[layer] ?? null
        const b = bad.scores[layer] ?? null
        // A layer with no score on either side says nothing, so it is no pass.
        const ok = g !== null && b !== null && g > b
        lines.push({ bad: bad.sample, against: good.sample, layer, good: g, badScore: b, ok })
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
 * print follows a setting changed since the grading, as Results does. Given
 * the run's `cases` (`RunView.cases`), an output graded before its case's
 * checks or settings changed has no total, as in the app. A grading without
 * Jev is one the command line asks for by name, so here it stands.
 */
export function scoredReport(
  skillDir: string,
  report: Report,
  options: Pick<GradeOptions, 'packs' | 'config'> = {},
  cases: Readonly<Record<string, RunCase>> = {},
): Report {
  const config = benchFor(skillDir, options)
  // The command line draws nothing and names its model by hand, so only the packs' questions are asked of a grading.
  const now = gradedNow(packVersions(), config.packs, null, false)
  return {
    ...report,
    config,
    packs: config.packs,
    results: report.results.map((result) => {
      const taken = result.case !== null && Object.hasOwn(cases, result.case)
      const behind = behindOf(
        { yardstick: result.yardstick, model: report.model, graded: result.graded },
        {
          yardstick: taken ? cases[result.case as string].yardstick : null,
          jev: false,
          with: now,
        },
      )
      const { scores, flags, confidence } = scoreResult(result, config, scorers, undefined, behind)
      return { ...result, scores, flags, confidence }
    }),
  }
}
