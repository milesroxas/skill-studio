/**
 * The operations table: one entry per name in the contract, each with a
 * `parse` that turns untrusted input into the typed shape (or throws) and a
 * `run` that does the work. Interfaces call `invoke`, so request checking and
 * behaviour live here once, whatever the transport.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { leaderboards, voteKeys } from '@domain/bradley-terry.ts'
import { preferencesOf } from '@domain/preferences.ts'
import { reviewQueue } from '@domain/queue.ts'
import {
  type BenchConfig,
  type CaseDraft,
  CONFIGURATIONS,
  type Configuration,
  type FileDraft,
  type Review,
  type SkillDrafts,
  type Vote,
} from '@domain/schemas.ts'
import { agreement } from '@domain/stats.ts'
import { TEMPLATE_IDS } from '@domain/templates.ts'
import type { Settings, SkillInfo } from '@domain/views.ts'
import {
  benchPath,
  deleteCase,
  findCase,
  loadBench,
  loadCases,
  loadRules,
  saveCase,
} from '@infrastructure/cases.ts'
import { readDrafts, writeDrafts } from '@infrastructure/drafts.ts'
import { engineById, engineInfo } from '@infrastructure/engines/index.ts'
import { assertSafe, assertSafePath, readJson, readTree, writeJson } from '@infrastructure/fs.ts'
import {
  createSkill,
  isPracticeSkill,
  linkSkill,
  markOthers,
  openPractice,
  scanLibrary,
  setWorkspaces,
  touchRecent,
  unlinkSkill,
} from '@infrastructure/library.ts'
import { readPreferences, writePreferences } from '@infrastructure/preferences.ts'
import {
  loadReviews,
  promoteAnchor,
  reviewsPath,
  savePreference,
  saveReview,
} from '@infrastructure/reviews.ts'
import {
  anchorList,
  listRuns,
  readRun,
  runDir,
  sampleFile,
  sampleTranscript,
  versionFiles,
  versionsOf,
} from '@infrastructure/runs.ts'
import {
  deleteSkillFile,
  replaceSkillFiles,
  skillFiles,
  skillInfo,
  writeSkillFile,
} from '@infrastructure/skill.ts'
import { isVersionLabel, saveVersion } from '@infrastructure/versions.ts'
import type { JudgeInput } from '@judges/index.ts'
import { packById } from '@judges/index.ts'
import { Jev } from '@judges/jev.ts'
import { generateRun } from '../generate.ts'
import { gradeRun, judgeInput } from '../grade.ts'
import { listJobs, runJob, say } from '../jobs.ts'
import {
  type AnchorInput,
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
const oneOf = <T extends string>(value: unknown, options: readonly T[], what: string): T => {
  if (typeof value !== 'string' || !options.includes(value as T)) throw new Error(`Bad ${what}.`)
  return value as T
}

const scoped = (raw: Raw): Scoped => ({ skill: str(raw.skill) })
const none = (): Record<string, never> => ({})

function caseDraftOf(value: unknown): CaseDraft {
  const input = record(value)
  const words = Array.isArray(input.words) ? input.words.map(Number) : []
  return {
    id: str(input.id).trim(),
    title: str(input.title),
    prompt: str(input.prompt),
    expectedOutcome: str(input.expectedOutcome),
    words: words.length === 2 ? [words[0], words[1]] : null,
    graders: (Array.isArray(input.graders) ? input.graders : []).map((raw) => {
      const g = record(raw)
      return {
        id: typeof g.id === 'string' ? g.id : null,
        statement: str(g.statement),
        weight: num(g.weight, 1),
      }
    }),
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
  return { files, cases, updatedAt: null }
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
    samples: num(raw.samples, 1),
    configuration: oneOf(str(raw.configuration, 'with_skill'), CONFIGURATIONS, 'configuration'),
    baselineRun: str(raw.baselineRun) || null,
    skillName: str(raw.skillName) || null,
    note: str(raw.note),
    grade: raw.grade !== false,
  }
}

function anchorInputOf(raw: Raw): AnchorInput {
  return {
    ...scoped(raw),
    run: str(raw.run),
    sample: str(raw.sample),
    file: str(raw.file),
    case: str(raw.case),
    label: oneOf(raw.label, ['good', 'bad'], 'label'),
    tests: list(raw.tests),
    about: str(raw.about),
  }
}

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
  'library.link': (raw) => ({
    path: str(raw.path),
    agent: oneOf(raw.agent, ['claude', 'cursor', 'codex'], 'agent'),
    scope: str(raw.scope, 'user'),
  }),
  'library.unlink': (raw) => parsers['library.link'](raw),
  'library.workspaces': (raw) => ({ workspaces: list(raw.workspaces) }),
  'library.mark': (raw) => ({ path: str(raw.path), theirs: raw.theirs === true }),
  'jobs.list': none,
  'settings.read': none,
  'settings.jevKey': (raw) => ({ value: str(raw.value).trim() }),
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
  'skill.drafts': scoped,
  'skill.saveDrafts': (raw) => ({ ...scoped(raw), drafts: draftsOf(raw.drafts) }),
  'skill.queue': scoped,
  'skill.leaderboard': scoped,
  'skill.review': (raw) => {
    const review = record(raw.review) as Partial<Review>
    return {
      ...scoped(raw),
      key: assertSafePath(str(raw.key), 'key'),
      review: {
        rating: typeof review.rating === 'number' ? review.rating : null,
        layers: review.layers ?? {},
        note: str(review.note),
      },
    }
  },
  'skill.preference': (raw) => ({
    ...scoped(raw),
    a: assertSafePath(str(raw.a), 'a'),
    b: assertSafePath(str(raw.b), 'b'),
    criterion: str(raw.criterion, 'overall'),
    vote: oneOf<Vote>(raw.vote, ['a', 'b', 'tie'], 'vote'),
  }),
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
  }),
  'skill.deleteCase': (raw) => ({ ...scoped(raw), id: assertSafe(str(raw.id), 'case') }),
  'skill.config': (raw) => {
    if (!raw.config || typeof raw.config !== 'object') throw new Error('Bad config.')
    return { ...scoped(raw), config: raw.config as BenchConfig }
  },
  'skill.anchor': anchorInputOf,
  'skill.generate': generateInputOf,
  'skill.grade': (raw) => ({
    ...scoped(raw),
    run: assertSafe(str(raw.run), 'run'),
    jev: raw.jev !== false,
  }),
  'skill.pairwise': (raw) => ({
    ...scoped(raw),
    a: assertSafePath(str(raw.a), 'a'),
    b: assertSafePath(str(raw.b), 'b'),
    criteria: list(raw.criteria),
  }),
}

export type Runner<K extends OperationName> = (input: Input<K>) => Output<K> | Promise<Output<K>>
export type Runners = { [K in OperationName]: Runner<K> }

/** Where a host keeps the Jev key when it can; the default knows only the environment. */
export interface SecretStore {
  read(): Promise<Settings>
  write(value: string): Promise<Settings>
}

const environmentSecrets: SecretStore = {
  read: async () => ({
    jevKey: Jev.available(),
    source: Jev.available() ? 'environment' : null,
    canStore: false,
  }),
  write: async () => {
    throw new Error('Set TYPESAFE_API_KEY in the environment; this host keeps no key of its own.')
  },
}

export interface OperationsOptions {
  /** Skill folders served from the start. */
  skills: string[]
  secrets?: SecretStore
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

  /** The skill an input names by path, opened on first use; else the first served. */
  const skillOf = ({ skill: wanted }: Scoped): SkillInfo => {
    if (!wanted) {
      if (!skills.length) throw new Error('Open a skill from the library first.')
      return skills[0]
    }
    const match = skills.find((s) => s.path === resolve(wanted) || s.name === wanted)
    if (match) return match
    if (!existsSync(join(resolve(wanted), 'SKILL.md'))) throw new Error(`No skill at ${wanted}.`)
    return open(wanted)
  }

  /** The judge input for one output, by `<run>/<sample>` key, for pairwise calls. */
  const inputFor = (skill: SkillInfo, key: string, config: BenchConfig): JudgeInput => {
    const [run, sample] = key.split('/')
    assertSafe(run, 'run')
    assertSafe(sample, 'sample')
    const found = readRun(skill.path, run).samples.find((s) => s.name === sample)
    if (!found) throw new Error(`No sample ${key}.`)
    const testCase = findCase(loadCases(skill.path), sample)
    return judgeInput(skill.path, found, testCase, loadRules(skill.path, config))
  }

  return {
    'library.skills': () => skills,
    'library.scan': () => scanLibrary(skills.map((s) => s.path)),
    'library.create': (input) => open(createSkill(input)),
    'library.practice': () => open(openPractice()),
    'library.link': ({ path, agent, scope }) => ({ linked: linkSkill(path, agent, scope) }),
    'library.unlink': ({ path, agent, scope }) => {
      unlinkSkill(path, agent, scope)
      return { unlinked: true }
    },
    'library.workspaces': ({ workspaces }) => ({ workspaces: setWorkspaces(workspaces) }),
    'library.mark': ({ path, theirs }) => {
      markOthers(path, theirs)
      return { marked: true }
    },
    'jobs.list': () => listJobs(),
    'settings.read': () => secrets.read(),
    'settings.jevKey': ({ value }) => secrets.write(value),
    'preferences.read': () => readPreferences(),
    'preferences.write': ({ preferences }) => writePreferences(preferences),
    'skill.state': async (input) => {
      const skill = skillOf(input)
      const config = loadBench(skill.path)
      return {
        skill,
        practice: isPracticeSkill(skill.path),
        skills,
        cases: loadCases(skill.path),
        runs: listRuns(skill.path),
        versions: versionsOf(skill.path),
        engines: await engineInfo(),
        reviews: loadReviews(skill.path),
        config,
        savedConfig: readJson<Partial<BenchConfig>>(benchPath(skill.path), {}),
        rules: loadRules(skill.path, config),
        anchors: anchorList(skill.path),
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
      const path = sampleFile(skillOf(input).path, input.run, input.sample, input.file)
      if (!existsSync(path) || statSync(path).isDirectory()) throw new Error('No such file.')
      return { bytes: new Uint8Array(readFileSync(path)), type: contentTypeOf(path) }
    },
    'skill.files': (input) => {
      const skill = skillOf(input)
      if (input.source === 'current')
        return { files: skillFiles(skill.path), label: 'Working tree' }
      if (isVersionLabel(input.source))
        return { files: versionFiles(skill.path, input.source), label: input.source }
      return {
        files: readTree(join(runDir(skill.path, input.source), '_skill')),
        label: input.source,
      }
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
      replaceSkillFiles(skill.path, versionFiles(skill.path, input.version))
      return { restored: input.version }
    },
    'skill.drafts': (input) => readDrafts(skillOf(input).path),
    'skill.saveDrafts': (input) => ({
      updatedAt: writeDrafts(skillOf(input).path, input.drafts),
    }),
    'skill.queue': (input) => {
      const skill = skillOf(input)
      const reviews = loadReviews(skill.path)
      return reviewQueue(
        listRuns(skill.path).flatMap((r) =>
          r.report ? [{ name: r.name, results: r.report.results }] : [],
        ),
        new Set(Object.keys(reviews.reviews)),
      )
    },
    'skill.leaderboard': (input) => {
      const { preferences } = loadReviews(skillOf(input).path)
      return {
        boards: leaderboards(preferences),
        agreement: agreement(voteKeys(preferences, 'jev'), voteKeys(preferences, 'human')),
      }
    },
    'skill.review': (input) => {
      const skill = skillOf(input)
      saveReview(skill.path, input.key, input.review)
      return { saved: reviewsPath(skill.path) }
    },
    'skill.preference': (input) => {
      const skill = skillOf(input)
      const { a, b, criterion, vote } = input
      savePreference(skill.path, { a, b, criterion, vote, by: 'human' })
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
    'skill.saveCase': (input) => ({
      saved: saveCase(skillOf(input).path, input.case, input.isNew),
    }),
    'skill.deleteCase': (input) => {
      deleteCase(skillOf(input).path, input.id)
      return { deleted: true }
    },
    'skill.config': (input) => {
      const skill = skillOf(input)
      writeJson(benchPath(skill.path), input.config)
      return { saved: benchPath(skill.path), config: loadBench(skill.path) }
    },
    'skill.anchor': (input) => {
      const { skill: _skill, ...anchor } = input
      return { saved: promoteAnchor(skillOf(input).path, anchor) }
    },
    'skill.generate': (input) => {
      const skill = skillOf(input)
      const cases = loadCases(skill.path)
      const selected = input.cases.length ? cases.filter((c) => input.cases.includes(c.id)) : cases
      if (!selected.length) throw new Error('No cases selected.')
      const engines = input.configs.flatMap((c) => {
        const engine = engineById(c.engine)
        return engine?.available()
          ? [{ engine, model: c.model || null, effort: c.effort || null }]
          : []
      })
      if (!engines.length) throw new Error('No available engine selected.')
      const configuration: Configuration = input.configuration
      const job = runJob(
        'generate',
        `Generate ${selected.length} case(s): ${engines.map((e) => e.engine.id).join(', ')}`,
        async (job) => {
          const results = await Promise.all(
            engines.map(async ({ engine, model, effort }) => {
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
                })
                if (!input.grade) return true
                say(job, `${name}: grading`)
                await gradeRun(skill.path, name, {
                  useJev: Jev.available(),
                  log: (line) => say(job, line),
                })
                say(job, `${name}: graded`)
                return true
              } catch (error) {
                say(job, (error as Error).message)
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
      const job = runJob('grade', `Grade ${input.run}`, async (job) => {
        await gradeRun(skill.path, input.run, {
          useJev: input.jev && Jev.available(),
          log: (line) => say(job, line),
        })
        say(job, 'Graded.')
        return true
      })
      return { started: true, job: job.id }
    },
    'skill.pairwise': (input) => {
      const skill = skillOf(input)
      const { a, b, criteria } = input
      if (!criteria.length) throw new Error('No criteria.')
      const config = loadBench(skill.path)
      const job = runJob('pairwise', `Jev: ${a} vs ${b}`, async (job) => {
        const jev = new Jev()
        const inputA = inputFor(skill, a, config)
        const inputB = inputFor(skill, b, config)
        for (const id of config.packs) {
          const pack = packById(id)
          if (!pack?.pairwise) continue
          const votes = await pack.pairwise(inputA, inputB, criteria, {
            jev,
            useJev: true,
            config,
            skillDir: skill.path,
            log: (l) => say(job, l),
          })
          for (const [criterion, vote] of Object.entries(votes)) {
            savePreference(skill.path, {
              a,
              b,
              criterion,
              vote: vote.vote,
              by: 'jev',
              confidence: vote.confidence,
            })
            say(job, `${criterion}: ${vote.vote} (${Math.round(vote.confidence * 100)}%)`)
          }
        }
        return true
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
