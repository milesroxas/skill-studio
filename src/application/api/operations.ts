/**
 * The operations table: one entry per name in the contract, each with a
 * `parse` that turns untrusted input into the typed shape (or throws) and a
 * `run` that does the work. Interfaces call `invoke`, so request checking and
 * behaviour live here once, whatever the transport.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import type { PageRenderer } from '@domain/artifact-address.ts'
import {
  ASSIST_FIELD_IDS,
  ASSIST_LIMIT,
  type AssistInput,
  type ChatScene,
  workingSkill,
} from '@domain/assist.ts'
import { checkWeight } from '@domain/case-draft.ts'
import { type ImageRef, MAX_IMAGES } from '@domain/image.ts'
import { type RuleScene, worthChecking } from '@domain/lint.ts'
import { LOOK_STEPS } from '@domain/practice.ts'
import { preferencesOf } from '@domain/preferences.ts'
import {
  type BenchConfig,
  type Case,
  type CaseDraft,
  CONFIGURATIONS,
  type Configuration,
  emptyDrafts,
  type FileDraft,
  NEW_CASE_KEY,
  type Report,
  type SkillDrafts,
} from '@domain/schemas.ts'
import {
  SECRET_IDS,
  type SecretId,
  type Settings,
  secretOf,
  statusOfEach,
} from '@domain/secrets.ts'
import { TEMPLATE_IDS } from '@domain/templates.ts'
import type { Job, SkillInfo } from '@domain/views.ts'
import {
  benchPath,
  caseSavedAt,
  deleteCase,
  loadBench,
  loadCases,
  loadRules,
  saveCase,
  savePacks,
} from '@infrastructure/cases.ts'
import { readDrafts, writeDrafts } from '@infrastructure/drafts.ts'
import { engineById, engineInfo } from '@infrastructure/engines/index.ts'
import { assertSafe, assertSafePath, isDir, readJson, realPath } from '@infrastructure/fs.ts'
import { findImage, readImage, saveUpload, uploadPath } from '@infrastructure/images.ts'
import { inputUploadPath, saveInputUpload } from '@infrastructure/inputs.ts'
import {
  createSkill,
  isPracticeSkill,
  linkSkill,
  lockSource,
  markDone,
  markPracticeSeen,
  openPractice,
  practiceSeen,
  restartPractice,
  scanLibrary,
  setWorkspaces,
  touchRecent,
  unlinkSkill,
} from '@infrastructure/library.ts'
import { readPreferences, writePreferences } from '@infrastructure/preferences.ts'
import { loadReviews, reviewsPath, saveCorrection } from '@infrastructure/reviews.ts'
import {
  listRuns,
  readRun,
  runDir,
  runSkillFiles,
  sampleFile,
  sampleTranscript,
  versionFiles,
  versionSource,
  versionsOf,
} from '@infrastructure/runs.ts'
import {
  deleteSkillFile,
  restoreSkillFiles,
  skillFiles,
  skillInfo,
  writeSkillFile,
} from '@infrastructure/skill.ts'
import { deleteRun, deleteVersion, undeleteRun, undeleteVersion } from '@infrastructure/trash.ts'
import { isVersionLabel, saveVersion } from '@infrastructure/versions.ts'
import { Jev } from '@judges/jev.ts'
import { scorers } from '@judges/scorers.ts'
import {
  aiCommands,
  aiStatus,
  aiUsage,
  chatThread,
  clearChat,
  clearImprove,
  findRun,
  improveThread,
  sendChat,
  sendImprove,
  startAssist,
  startImprove,
  startRefine,
  startRewrites,
  stopRun,
} from '../ai.ts'
import { generateRun, MAX_SAMPLES, samplesPerCase } from '../generate.ts'
import { gradeRun, unjudged } from '../grade.ts'
import {
  anyRunning,
  listJobs,
  markGrading,
  markWriting,
  runJob,
  runningJob,
  say,
  sizeJob,
  stepJob,
  stopJob,
} from '../jobs.ts'
import {
  type GenerateInput,
  type Input,
  type OperationName,
  type Output,
  type Scoped,
  SHELL_OPERATIONS,
  type ShellOperation,
} from './contract.ts'

/** Content types of the files a sample may write, for the artifact operation. */
export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}
const OCTET_STREAM = 'application/octet-stream'
export const contentTypeOf = (path: string): string =>
  CONTENT_TYPES[extname(path).toLowerCase()] ?? OCTET_STREAM

type Raw = Record<string, unknown>

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback
const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
export const record = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {}
/** The packs a skill can be graded as. */
const PACK_IDS = scorers.map((pack) => pack.id)
const oneOf = <T extends string>(value: unknown, options: readonly T[], what: string): T => {
  if (typeof value !== 'string' || !options.includes(value as T)) throw new Error(`Bad ${what}.`)
  return value as T
}

const scoped = (raw: Raw): Scoped => ({ skill: str(raw.skill) })
const none = (): Record<string, never> => ({})

/** A picture reference from untrusted input; null when it names neither a file nor an upload. */
function imageRefOf(value: unknown): ImageRef | null {
  const { name, file, upload } = record(value)
  const ref = {
    name: str(name).slice(0, 200),
    file: typeof file === 'string' && file ? assertSafePath(file, 'picture') : null,
    upload: typeof upload === 'string' && upload ? assertSafe(upload, 'picture') : null,
  }
  return ref.file || ref.upload ? ref : null
}

const imageRefsOf = (value: unknown): ImageRef[] => {
  const refs = (Array.isArray(value) ? value : []).flatMap((raw) => imageRefOf(raw) ?? [])
  if (refs.length > MAX_IMAGES) throw new Error(`Add ${MAX_IMAGES} pictures at most.`)
  return refs
}

function caseDraftOf(value: unknown): CaseDraft {
  const input = record(value)
  const words = Array.isArray(input.words) ? input.words.map(Number) : []
  return {
    id: str(input.id).trim(),
    title: str(input.title),
    prompt: str(input.prompt),
    expectedOutcome: str(input.expectedOutcome),
    words: words.length === 2 ? [words[0], words[1]] : null,
    phone: input.phone === true,
    size:
      Array.isArray(input.size) && input.size.length === 2
        ? [Number(input.size[0]), Number(input.size[1])]
        : null,
    images: imageRefsOf(input.images),
    added: (Array.isArray(input.added) ? input.added : []).map((raw) => {
      const pick = record(raw)
      return {
        name: str(pick.name),
        upload: str(pick.upload),
        files: num(pick.files, 1),
        folder: pick.folder === true,
      }
    }),
    removed: list(input.removed),
    graders: (Array.isArray(input.graders) ? input.graders : []).map((raw) => {
      const g = record(raw)
      return {
        id: typeof g.id === 'string' ? g.id : null,
        statement: str(g.statement),
        weight: checkWeight(g.weight) ?? 1,
        image: imageRefOf(g.image),
      }
    }),
  }
}

/** What the reader has open, from untrusted input: a file path and a case key, each checked. */
function chatOpenOf(value: unknown): ChatScene['open'] {
  const { file, case: key } = record(value)
  return {
    file: typeof file === 'string' && file ? assertSafePath(file, 'file') : null,
    case:
      typeof key === 'string' && key
        ? key === NEW_CASE_KEY
          ? key
          : assertSafe(key, 'case')
        : null,
  }
}

function draftsOf(value: unknown): SkillDrafts {
  const input = record(value)
  const files: Record<string, FileDraft> = {}
  for (const [path, raw] of Object.entries(record(input.files))) {
    const draft = record(raw)
    if (typeof draft.text !== 'string') throw new Error(`Bad draft of ${path}.`)
    files[assertSafePath(path, 'path')] = {
      text: draft.text,
      previous: typeof draft.previous === 'string' ? draft.previous : null,
    }
  }
  const cases = Object.fromEntries(
    Object.entries(record(input.cases)).map(([key, raw]) => [key, caseDraftOf(raw)]),
  )
  // A base is kept only beside the draft it dates, as a save time or null.
  const caseBases = Object.fromEntries(
    Object.entries(record(input.caseBases)).filter(
      ([key, at]) => Object.hasOwn(cases, key) && (at === null || typeof at === 'string'),
    ),
  ) as Record<string, string | null>
  return { files, cases, caseBases, updatedAt: null }
}

function generateInputOf(raw: Raw): GenerateInput {
  const configs = (Array.isArray(raw.configs) ? raw.configs : []).slice(0, 4).map((c) => {
    const choice = record(c)
    return { engine: str(choice.engine), model: str(choice.model), effort: str(choice.effort) }
  })
  return {
    ...scoped(raw),
    cases: list(raw.cases),
    configs,
    // A whole number from 1 to the most one run writes per case.
    samples: samplesPerCase(Math.min(MAX_SAMPLES, num(raw.samples, 1))),
    configuration: oneOf(str(raw.configuration, 'with_skill'), CONFIGURATIONS, 'configuration'),
    // A run's name is a folder's name: checked like every other.
    baselineRun: str(raw.baselineRun) ? assertSafe(str(raw.baselineRun), 'run') : null,
    skillName: str(raw.skillName) || null,
    note: str(raw.note),
    grade: raw.grade !== false,
  }
}

function assistInputOf(raw: Raw): Scoped & AssistInput {
  const context = (Array.isArray(raw.context) ? raw.context : []).map((item) => {
    const { label, text } = record(item)
    return { label: str(label), text: str(text) }
  })
  const input: Scoped & AssistInput = {
    ...scoped(raw),
    field: oneOf(raw.field, ASSIST_FIELD_IDS, 'field'),
    instruction: str(raw.instruction).trim(),
    current: str(raw.current),
    context,
    images: imageRefsOf(raw.images),
  }
  if (!input.instruction) throw new Error('Say what to write or change.')
  const size =
    input.instruction.length +
    input.current.length +
    context.reduce((sum, c) => sum + c.text.length, 0)
  if (size > ASSIST_LIMIT) throw new Error('This is more text than one request can carry.')
  return input
}

const runId = (raw: Raw): { id: string } => ({ id: str(raw.id) })

/** Longer than any rule or check a verdict is named after. */
const VERDICT_MAX = 4000

/** A selected rule with its surroundings. Too little to check, or more than a request carries, is refused. */
const sceneOf = (raw: Raw): RuleScene => {
  const selection = str(raw.selection)
  if (!worthChecking(selection)) throw new Error('Select at least four words.')
  const before = str(raw.before)
  const after = str(raw.after)
  if (selection.length + before.length + after.length > ASSIST_LIMIT)
    throw new Error('The selection is too long for one request.')
  return {
    selection,
    before,
    after,
    description: str(raw.description),
    band: oneOf(raw.band, ['fine', 'long', 'over'], 'band'),
  }
}

/**
 * A case as the Cases form loads it: with the time its folder was last saved,
 * which the form gives back to `skill.saveCase` so a newer save on disk refuses it.
 */
const savedCase = (skillDir: string, c: Case): Case & { savedAt: string | null } =>
  Object.assign({}, c, { savedAt: c.dir ? caseSavedAt(skillDir, c.dir) : null })

/** Every operation's input check, keyed like the contract. Shared by every host of the table. */
export const parsers: { [K in OperationName]: (raw: Raw) => Input<K> } = {
  'library.skills': none,
  'library.scan': none,
  'library.create': (raw) => ({
    scope: str(raw.scope, 'user'),
    name: str(raw.name).trim(),
    description: str(raw.description).trim(),
    agents: list(raw.agents).map((a) => oneOf(a, ['claude', 'cursor', 'codex'], 'agent')),
    template: oneOf(str(raw.template, 'blank'), TEMPLATE_IDS, 'template'),
    samples: raw.samples === true,
  }),
  'library.practice': none,
  'library.restartPractice': none,
  'library.practiceSeen': (raw) => ({ step: oneOf(raw.step, LOOK_STEPS, 'step') }),
  'library.link': (raw) => ({
    path: str(raw.path),
    agent: oneOf(raw.agent, ['claude', 'cursor', 'codex'], 'agent'),
    scope: str(raw.scope, 'user'),
  }),
  'library.unlink': (raw) => parsers['library.link'](raw),
  'library.workspaces': (raw) => ({ workspaces: list(raw.workspaces) }),
  'library.done': (raw) => ({ path: str(raw.path), done: raw.done === true }),
  'jobs.list': none,
  'jobs.stop': (raw) => ({ id: num(raw.id, 0) }),
  'settings.read': none,
  'settings.key': (raw) => ({
    id: oneOf(raw.id, SECRET_IDS, 'key'),
    value: str(raw.value).trim(),
  }),
  'ai.status': none,
  'ai.usage': none,
  'ai.commands': none,
  'ai.assist': assistInputOf,
  'ai.run': runId,
  'ai.stop': runId,
  'chat.read': none,
  'chat.send': (raw) => {
    const text = str(raw.text).trim()
    // A conversation outlives the open skill, so it holds uploads only, never a skill's files.
    const images = imageRefsOf(raw.images).filter((image) => image.upload)
    if (!text && !images.length) throw new Error('Write a message first.')
    if (text.length > ASSIST_LIMIT)
      throw new Error('This message is longer than one request can carry.')
    return {
      ...scoped(raw),
      text,
      images,
      screen: str(raw.screen).slice(0, 80),
      open: chatOpenOf(raw.open),
    }
  },
  'chat.clear': none,
  'ai.refine': sceneOf,
  'ai.rewrites': sceneOf,
  'improve.read': none,
  'improve.start': sceneOf,
  'improve.send': (raw) => {
    const text = str(raw.text).trim()
    if (!text) throw new Error('Write a reply first.')
    if (text.length > ASSIST_LIMIT)
      throw new Error('This reply is longer than one request can carry.')
    return { text }
  },
  'improve.clear': none,
  'image.upload': (raw) => {
    if (typeof raw.data !== 'string' || !raw.data) throw new Error('No picture was sent.')
    return { name: str(raw.name).slice(0, 200), data: raw.data }
  },
  'input.upload': (raw) => ({
    name: str(raw.name),
    files: (Array.isArray(raw.files) ? raw.files : []).map((f) => {
      const file = record(f)
      if (typeof file.data !== 'string') throw new Error('No file was sent.')
      return { path: str(file.path), data: file.data }
    }),
  }),
  'image.read': (raw) => {
    const ref = imageRefOf(raw)
    if (!ref) throw new Error('Bad picture.')
    return { ...scoped(raw), file: ref.file ?? '', upload: ref.upload ?? '' }
  },
  'preferences.read': none,
  'preferences.write': (raw) => ({ preferences: preferencesOf(raw.preferences) }),
  'skill.state': scoped,
  'skill.run': (raw) => ({ ...scoped(raw), run: assertSafe(str(raw.run), 'run') }),
  'skill.transcript': (raw) => ({
    ...scoped(raw),
    run: assertSafe(str(raw.run), 'run'),
    sample: assertSafe(str(raw.sample), 'sample'),
  }),
  'skill.artifact': (raw) => ({
    ...scoped(raw),
    run: assertSafe(str(raw.run), 'run'),
    sample: assertSafe(str(raw.sample), 'sample'),
    file: assertSafePath(str(raw.file), 'file'),
  }),
  'skill.files': (raw) => {
    const source = str(raw.source, 'current')
    return {
      ...scoped(raw),
      source: source === 'current' || isVersionLabel(source) ? source : assertSafe(source, 'run'),
    }
  },
  'skill.saveVersion': (raw) => ({ ...scoped(raw), name: str(raw.name), note: str(raw.note) }),
  'skill.restoreVersion': (raw) => {
    const version = str(raw.version)
    if (!isVersionLabel(version)) throw new Error('Bad version.')
    return { ...scoped(raw), version, force: raw.force === true }
  },
  'skill.deleteVersion': (raw) => {
    const version = str(raw.version)
    if (!isVersionLabel(version)) throw new Error('Bad version.')
    return { ...scoped(raw), version }
  },
  'skill.undeleteVersion': (raw) => ({ ...scoped(raw), undo: assertSafe(str(raw.undo), 'undo') }),
  'skill.deleteRun': (raw) => ({ ...scoped(raw), run: assertSafe(str(raw.run), 'run') }),
  'skill.undeleteRun': (raw) => ({ ...scoped(raw), undo: assertSafe(str(raw.undo), 'undo') }),
  'skill.drafts': scoped,
  'skill.saveDrafts': (raw) => ({ ...scoped(raw), drafts: draftsOf(raw.drafts) }),
  'skill.correct': (raw) => {
    const verdict = str(raw.verdict)
    if (!verdict || verdict.length > VERDICT_MAX) throw new Error('Bad verdict.')
    return {
      ...scoped(raw),
      key: assertSafePath(str(raw.key), 'key'),
      verdict,
      met: typeof raw.met === 'boolean' ? raw.met : null,
    }
  },
  'skill.saveFile': (raw) => {
    if (typeof raw.text !== 'string') throw new Error('Bad text.')
    return {
      ...scoped(raw),
      path: str(raw.path),
      text: raw.text,
      previous: typeof raw.previous === 'string' ? raw.previous : null,
    }
  },
  'skill.deleteFile': (raw) => ({ ...scoped(raw), path: str(raw.path) }),
  'skill.saveCase': (raw) => ({
    ...scoped(raw),
    case: caseDraftOf(raw.case),
    isNew: raw.isNew === true,
    savedAt: typeof raw.savedAt === 'string' && raw.savedAt ? raw.savedAt : null,
  }),
  'skill.deleteCase': (raw) => ({ ...scoped(raw), id: assertSafe(str(raw.id), 'case') }),
  'skill.gradedAs': (raw) => {
    const packs = Array.isArray(raw.packs) ? raw.packs : []
    // Named once each, every one a pack the app has: a skill is always graded as something.
    if (!packs.length || new Set(packs).size !== packs.length) throw new Error('Bad packs.')
    for (const pack of packs) oneOf(pack, PACK_IDS, 'pack')
    return { ...scoped(raw), packs: packs as string[] }
  },
  'skill.generate': generateInputOf,
  'skill.grade': (raw) => ({
    ...scoped(raw),
    run: assertSafe(str(raw.run), 'run'),
    jev: raw.jev !== false,
  }),
}

export type Runner<K extends OperationName> = (input: Input<K>) => Output<K> | Promise<Output<K>>
export type Runners = { [K in OperationName]: Runner<K> }

/** Where a host keeps its keys when it can; the default knows only the environment. */
export interface SecretStore {
  read(): Promise<Settings>
  write(id: SecretId, value: string): Promise<Settings>
}

const environmentSecrets: SecretStore = {
  read: async () => ({
    canStore: false,
    keys: statusOfEach((id) => {
      const set = Boolean(secretOf(id, process.env))
      return { set, source: set ? 'environment' : null }
    }),
  }),
  write: async () => {
    throw new Error('Set the key in the environment; this host keeps no key of its own.')
  },
}

export interface OperationsOptions {
  /** Skill folders served from the start. */
  skills: string[]
  secrets?: SecretStore
  /** Draws a sample's page for grading to look at; only the desktop app has a browser to. */
  render?: PageRenderer
}

/**
 * Say in the job's log what a grading could not judge. False when no output
 * was judged at all: the report then holds no verdicts, and the job fails
 * rather than say "Graded." over scores counted from nothing.
 */
function reportJudging(job: Job, report: Report): boolean {
  const { failed, total, reason } = unjudged(report)
  // Nothing to grade: the grading's own log said so, and wrote no report.
  if (!total) return false
  if (!failed) return true
  say(job, `${failed} of ${total} outputs were not judged: ${reason}`)
  if (failed === total) {
    say(
      job,
      'No report was written. The scores from the last grading, if there was one, still stand.',
    )
    return false
  }
  say(job, 'The scores of those outputs count only the layers that were judged.')
  return true
}

export function createOperations(options: OperationsOptions): Runners {
  const secrets = options.secrets ?? environmentSecrets
  const skills = options.skills.map((dir) => skillInfo(dir))

  /** Serve a skill folder from now on; the same folder twice is one skill. */
  const open = (dir: string): SkillInfo => {
    const info = skillInfo(dir)
    const found = skills.find((s) => s.path === info.path)
    if (found) return found
    skills.push(info)
    touchRecent(info.path)
    return info
  }

  /** The runs being graded now, as `<skill>/<run>`: by a grade job, or by the job that made the run. */
  const grading = new Set<string>()
  const gradeTarget = (skillPath: string, run: string): string => `${realPath(skillPath)}/${run}`

  /** What a job is doing to `run` now, if anything: writing its outputs, or grading them. */
  const runBusy = (skillPath: string, run: string): 'writing' | 'grading' | null => {
    if (runningJob('generate', realPath(skillPath))?.writing.includes(run)) return 'writing'
    const target = gradeTarget(skillPath, run)
    return runningJob('grade', target) || grading.has(target) ? 'grading' : null
  }

  /**
   * Grade a run inside `job` and say how it went, `done` when it was judged.
   * One grading per run at a time, whichever job asks: two would pay Jev twice
   * and write the same report over each other.
   */
  async function gradeInJob(
    job: Job,
    skillPath: string,
    run: string,
    useJev: boolean,
    signal: AbortSignal,
    done: string,
  ): Promise<boolean> {
    const target = gradeTarget(skillPath, run)
    if (grading.has(target))
      throw new Error('This run is already being graded. Wait for it to finish, or stop it.')
    grading.add(target)
    markGrading(job, run, true)
    try {
      const report = await gradeRun(skillPath, run, {
        useJev,
        log: (line) => say(job, line),
        signal,
        render: options.render,
      })
      const judged = reportJudging(job, report)
      if (judged) say(job, done)
      return judged
    } finally {
      grading.delete(target)
      markGrading(job, run, false)
    }
  }

  /** The skill an input names by path, opened on first use; else the first served. */
  /** A skill open already, by its path, the path it links to, or its name: the first one for none named. */
  const openSkill = (wanted: string): SkillInfo | null => {
    if (!wanted) return skills[0] ?? null
    const paths = [resolve(wanted), realPath(resolve(wanted))]
    return skills.find((s) => paths.includes(s.path) || s.name === wanted) ?? null
  }

  const skillOf = ({ skill: wanted }: Scoped): SkillInfo => {
    const match = openSkill(wanted)
    if (match) return match
    if (!wanted) throw new Error('Open a skill from the library first.')
    if (!existsSync(join(resolve(wanted), 'SKILL.md'))) throw new Error(`No skill at ${wanted}.`)
    return open(wanted)
  }

  return {
    'library.skills': () => skills,
    'library.scan': () => scanLibrary(skills.map((s) => s.path)),
    'library.create': (input) => open(createSkill(input)),
    'library.practice': () => open(openPractice()),
    'library.restartPractice': () => {
      // A job may be writing a run of the practice skill.
      if (anyRunning()) throw new Error('Wait for running jobs to finish, then restart.')
      const skill = open(restartPractice())
      writeDrafts(skill.path, emptyDrafts())
      return skill
    },
    'library.practiceSeen': ({ step }) => ({ seen: markPracticeSeen(step) }),
    'library.link': ({ path, agent, scope }) => ({ linked: linkSkill(path, agent, scope) }),
    'library.unlink': ({ path, agent, scope }) => {
      unlinkSkill(path, agent, scope)
      return { unlinked: true }
    },
    'library.workspaces': ({ workspaces }) => ({ workspaces: setWorkspaces(workspaces) }),
    'library.done': ({ path, done }) => {
      markDone(path, done)
      return { done }
    },
    'jobs.list': () => listJobs(),
    'jobs.stop': ({ id }) => stopJob(id),
    'settings.read': () => secrets.read(),
    'settings.key': ({ id, value }) => secrets.write(id, value),
    'ai.status': () => aiStatus(),
    'ai.usage': () => aiUsage(),
    'ai.commands': () => aiCommands(),
    'ai.assist': ({ skill, ...input }) => {
      const dir = skill ? skillOf({ skill }).path : null
      return startAssist(
        input,
        input.images.map((image) => findImage(dir, image)),
      )
    },
    'ai.run': ({ id }) => findRun(id),
    'ai.stop': ({ id }) => stopRun(id),
    'chat.read': () => chatThread(),
    'chat.send': (input) => {
      const skill = input.skill ? skillOf(input) : null
      // The skill as the reader has it: what is saved, with their stored drafts over it.
      const scene: ChatScene = {
        screen: input.screen,
        open: input.open,
        skill: skill && {
          name: skill.name,
          ...workingSkill(skillFiles(skill.path), loadCases(skill.path), readDrafts(skill.path)),
        },
      }
      return sendChat(input.text, input.images, scene, skill?.path ?? null)
    },
    'chat.clear': () => clearChat(),
    'ai.refine': (scene) => startRefine(scene),
    'ai.rewrites': (scene) => startRewrites(scene),
    'improve.read': () => improveThread(),
    'improve.start': (scene) => startImprove(scene),
    'improve.send': ({ text }) => sendImprove(text),
    'improve.clear': () => {
      clearImprove()
      return { cleared: true as const }
    },
    'image.upload': (input) => saveUpload(input),
    'input.upload': (input) => saveInputUpload(input),
    'image.read': ({ skill, file, upload }) => {
      // Only a skill open already: a page an agent wrote can load a picture by any path, and asking must not open one.
      const open = upload ? null : openSkill(skill)
      if (!upload && !open) throw new Error('No such picture.')
      const dir = open?.path ?? null
      const image = findImage(dir, { name: '', file: file || null, upload: upload || null })
      return { bytes: readImage(image), type: image.type }
    },
    'preferences.read': () => readPreferences(),
    'preferences.write': ({ preferences }) => writePreferences(preferences),
    'skill.state': async (input) => {
      const skill = skillOf(input)
      const config = loadBench(skill.path)
      return {
        skill,
        practice: isPracticeSkill(skill.path),
        practiceSeen: isPracticeSkill(skill.path) ? practiceSeen() : [],
        source: lockSource(skill.path),
        skills,
        cases: loadCases(skill.path).map((c) => savedCase(skill.path, c)),
        runs: listRuns(skill.path),
        versions: versionsOf(skill.path),
        engines: await engineInfo(),
        reviews: loadReviews(skill.path),
        config,
        savedConfig: readJson<Partial<BenchConfig>>(benchPath(skill.path), {}),
        rules: loadRules(skill.path, config),
        jevKey: Jev.available(),
        paths: {
          bench: relative(skill.path, benchPath(skill.path)),
          reviews: relative(skill.path, reviewsPath(skill.path)),
        },
      }
    },
    'skill.run': (input) => readRun(skillOf(input).path, input.run),
    'skill.transcript': (input) =>
      sampleTranscript(skillOf(input).path, input.run, input.sample) ?? [],
    'skill.artifact': (input) => {
      // Only a skill open already: a page an agent wrote can name any path, and asking must not open one.
      const skill = openSkill(input.skill)
      if (!skill) throw new Error('No such file.')
      const path = sampleFile(skill.path, input.run, input.sample, input.file)
      if (!existsSync(path) || statSync(path).isDirectory()) throw new Error('No such file.')
      return { bytes: new Uint8Array(readFileSync(path)), type: contentTypeOf(path) }
    },
    'skill.files': (input) => {
      const skill = skillOf(input)
      if (input.source === 'current')
        return { files: skillFiles(skill.path), label: 'Working tree' }
      if (isVersionLabel(input.source))
        return { files: versionFiles(skill.path, input.source), label: input.source }
      return { files: runSkillFiles(skill.path, input.source), label: input.source }
    },
    'skill.saveVersion': (input) => {
      const skill = skillOf(input)
      return saveVersion(skill.path, versionsOf(skill.path).current, input.name, input.note)
    },
    'skill.restoreVersion': (input) => {
      const skill = skillOf(input)
      const { current } = versionsOf(skill.path)
      if (current.changed && !input.force)
        throw new Error(
          `The skill's files are not saved as a version. Save them as ${current.version} first, or restore anyway.`,
        )
      restoreSkillFiles(skill.path, versionSource(skill.path, input.version))
      // The name and description come from SKILL.md's front matter.
      Object.assign(skill, skillInfo(skill.path))
      return { restored: input.version }
    },
    'skill.deleteVersion': (input) => {
      // A job may be writing a run of this very version.
      if (anyRunning()) throw new Error('Wait for running jobs to finish, then delete.')
      return deleteVersion(skillOf(input).path, input.version)
    },
    'skill.undeleteVersion': (input) => undeleteVersion(skillOf(input).path, input.undo),
    'skill.deleteRun': (input) => {
      const skill = skillOf(input)
      // A job still writing the run would make its folder again; a grading would write its report there.
      const busy = runBusy(skill.path, input.run)
      if (busy === 'writing')
        throw new Error('This run is still writing. Stop it, or delete it when it finishes.')
      if (busy === 'grading')
        throw new Error(
          'This run is being graded. Stop the grading, or delete it when it finishes.',
        )
      return deleteRun(skill.path, input.run)
    },
    'skill.undeleteRun': (input) => undeleteRun(skillOf(input).path, input.undo),
    'skill.drafts': (input) => readDrafts(skillOf(input).path),
    'skill.saveDrafts': (input) => ({
      updatedAt: writeDrafts(skillOf(input).path, input.drafts),
    }),
    'skill.correct': (input) => {
      const skill = skillOf(input)
      saveCorrection(skill.path, input.key, input.verdict, input.met)
      return { saved: reviewsPath(skill.path) }
    },
    'skill.saveFile': (input) => {
      const skill = skillOf(input)
      writeSkillFile(skill.path, input.path, input.text, input.previous)
      // The name and description come from SKILL.md's front matter.
      if (input.path === 'SKILL.md') Object.assign(skill, skillInfo(skill.path))
      return { saved: input.path }
    },
    'skill.deleteFile': (input) => {
      deleteSkillFile(skillOf(input).path, input.path)
      return { deleted: input.path }
    },
    'skill.saveCase': (input) => {
      const skill = skillOf(input)
      // `savedAt` is when the form's copy was saved: a newer save on disk refuses this one.
      const saved = saveCase(
        skill.path,
        input.case,
        input.isNew,
        { picture: uploadPath, input: inputUploadPath },
        input.savedAt,
      )
      return { saved, savedAt: caseSavedAt(skill.path, saved) }
    },
    'skill.deleteCase': (input) => {
      deleteCase(skillOf(input).path, input.id)
      return { deleted: true }
    },
    'skill.gradedAs': (input) => {
      const skill = skillOf(input)
      savePacks(skill.path, input.packs)
      return { saved: benchPath(skill.path), config: loadBench(skill.path) }
    },
    'skill.generate': (input) => {
      const skill = skillOf(input)
      const cases = loadCases(skill.path)
      const selected = input.cases.length ? cases.filter((c) => input.cases.includes(c.id)) : cases
      if (!selected.length) throw new Error('No cases selected.')
      // What was asked for and cannot run is left out, and the job's log says so.
      const left = input.cases
        .filter((id) => !cases.some((c) => c.id === id))
        .map((id) => `There is no case called ${id}: left out.`)
      const engines = input.configs.flatMap((c) => {
        const engine = engineById(c.engine)
        if (engine?.available())
          return [{ engine, model: c.model || null, effort: c.effort || null }]
        left.push(`${engine?.label ?? c.engine} is not installed: left out.`)
        return []
      })
      if (!engines.length)
        throw new Error('None of the agents picked is installed. Pick another, or install one.')
      const configuration: Configuration = input.configuration
      // As the Library lists it, so the skill's row can show the run.
      const skillPath = realPath(skill.path)
      if (runningJob('generate', skillPath))
        throw new Error('This skill is already running. Wait for it to finish, or stop it.')
      const job = runJob(
        'generate',
        `Run ${selected.length} ${selected.length === 1 ? 'case' : 'cases'} with ${engines.map((e) => e.engine.label).join(' and ')}`,
        skillPath,
        skillPath,
        async (job, signal) => {
          // One unit per output, and one more per writer for its grading, so the
          // count only reaches the end when the job does.
          const perWriter = selected.length * samplesPerCase(input.samples) + (input.grade ? 1 : 0)
          sizeJob(job, perWriter * engines.length)
          for (const line of left) say(job, line)
          const useJev = Jev.available()
          const results = await Promise.all(
            engines.map(async ({ engine, model, effort }) => {
              let left = perWriter
              const step = () => {
                left -= 1
                stepJob(job)
              }
              /** The run this writer makes, once it is named: it cannot be graded while it is written. */
              let writing: string | null = null
              try {
                const { name } = await generateRun({
                  skillDir: skill.path,
                  cases: selected,
                  engine,
                  model,
                  effort,
                  samples: input.samples,
                  configuration,
                  baselineRun: input.baselineRun,
                  skillName: input.skillName,
                  note: input.note,
                  log: (line) => say(job, line),
                  onSample: step,
                  onNamed: (named) => {
                    writing = named
                    markWriting(job, named, true)
                  },
                  signal,
                })
                markWriting(job, name, false)
                writing = null
                if (!input.grade || signal.aborted) return !signal.aborted
                say(job, `${name}: grading`)
                if (!useJev) say(job, 'No Jev key: no rule or check is marked.')
                const judged = await gradeInJob(
                  job,
                  skill.path,
                  name,
                  useJev,
                  signal,
                  `${name}: graded`,
                )
                step()
                return judged
              } catch (error) {
                if (writing) markWriting(job, writing, false)
                if (!signal.aborted) say(job, (error as Error).message)
                // What this writer will never do still counts as settled.
                while (left > 0) step()
                return false
              }
            }),
          )
          return results.every(Boolean)
        },
      )
      return { started: true, job: job.id }
    },
    'skill.grade': (input) => {
      const skill = skillOf(input)
      const skillPath = realPath(skill.path)
      const target = gradeTarget(skill.path, input.run)
      if (!isDir(runDir(skill.path, input.run)))
        throw new Error(`There is no run called ${input.run}.`)
      // A report over a run still writing would miss the outputs still to come. A run
      // with no end time and no job writing it was cut off, and is graded as it stands,
      // whatever other run of the skill is being written.
      const busy = runBusy(skill.path, input.run)
      if (busy === 'writing')
        throw new Error('This run is still writing. Grade it when it finishes.')
      if (busy === 'grading')
        throw new Error('This run is already being graded. Wait for it to finish, or stop it.')
      const useJev = input.jev && Jev.available()
      const job = runJob('grade', `Grade ${input.run}`, skillPath, target, (job, signal) => {
        if (input.jev && !useJev) say(job, 'No Jev key: no rule or check is marked.')
        return gradeInJob(job, skill.path, input.run, useJev, signal, 'Graded.')
      })
      return { started: true, job: job.id }
    },
  }
}

export const isOperation = (name: unknown): name is OperationName =>
  typeof name === 'string' && Object.hasOwn(parsers, name)

export const isShellOperation = (name: OperationName): name is ShellOperation =>
  (SHELL_OPERATIONS as readonly string[]).includes(name)

/** Check `raw` against the operation's parser and run it. Unknown names and bad inputs throw. */
export async function invoke<K extends OperationName>(
  runners: Runners,
  name: K,
  raw: unknown,
): Promise<Output<K>> {
  const input = parsers[name](record(raw))
  return runners[name](input)
}
