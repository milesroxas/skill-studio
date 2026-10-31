/**
 * The skill-tester server: a local HTTP API over the skill library and each
 * open skill's evals, bound to 127.0.0.1. The UI in `app/` talks to it; the
 * CLI calls the same functions directly. Started by `st serve`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, relative, resolve } from 'node:path'
import { leaderboards, voteKeys } from '@core/bradley-terry.ts'
import { isWithin } from '@core/paths.ts'
import { reviewQueue } from '@core/queue.ts'
import {
  type BenchConfig,
  type CaseDraft,
  CONFIGURATIONS,
  type Configuration,
  type Preference,
  type Review,
} from '@core/schemas.ts'
import { agreement } from '@core/stats.ts'
import type { JudgeInput } from '@judges/index.ts'
import { packById } from '@judges/index.ts'
import {
  benchPath,
  deleteCase,
  findCase,
  loadBench,
  loadCases,
  loadRules,
  saveCase,
} from './cases.ts'
import { engineById, engineInfo } from './engines/index.ts'
import { loadEnv, TOOL_ROOT } from './env.ts'
import { assertSafe, assertSafePath, isDir, readJson, readTree, writeJson } from './fs.ts'
import { generateRun } from './generate.ts'
import { gradeRun, judgeInput } from './grade.ts'
import { refusal } from './guard.ts'
import { Jev } from './jev.ts'
import { listJobs, runJob, say } from './jobs.ts'
import {
  createSkill,
  linkSkill,
  markOthers,
  scanLibrary,
  setWorkspaces,
  touchRecent,
  unlinkSkill,
} from './library.ts'
import { loadReviews, promoteAnchor, reviewsPath, savePreference, saveReview } from './reviews.ts'
import {
  anchorList,
  listRuns,
  readRun,
  runDir,
  sampleFile,
  sampleTranscript,
  versionsOf,
} from './runs.ts'
import { deleteSkillFile, type SkillInfo, skillFiles, skillInfo, writeSkillFile } from './skill.ts'

export const DEFAULT_PORT = 4400

const TYPES: Record<string, string> = {
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

type Body = Record<string, unknown>
type Route = (url: URL, body: Body, skill: SkillInfo) => unknown | Promise<unknown>
type LibraryRoute = (url: URL, body: Body) => unknown | Promise<unknown>

interface Static {
  bytes: Buffer
  type: string
}

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback
const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
const record = (value: unknown): Body =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Body) : {}

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

export interface ServerOptions {
  skills: string[]
  port?: number
}

function createApi(skillDirs: string[]) {
  const skills = skillDirs.map((dir) => skillInfo(dir))

  /** Serve a skill folder from now on; the same folder twice is one skill. */
  const open = (dir: string): SkillInfo => {
    const info = skillInfo(dir)
    const found = skills.find((s) => s.path === info.path)
    if (found) return found
    skills.push(info)
    touchRecent(info.path)
    return info
  }

  /** The skill a request names by path, opened on first use; else the first served. */
  const skillOf = (url: URL, body: Body): SkillInfo => {
    const wanted = str(url.searchParams.get('skill') ?? body.skill)
    if (!wanted) {
      if (!skills.length) throw new Error('Open a skill from the library first.')
      return skills[0]
    }
    const match = skills.find((s) => s.path === resolve(wanted) || s.name === wanted)
    if (match) return match
    if (!existsSync(join(resolve(wanted), 'SKILL.md'))) throw new Error(`No skill at ${wanted}.`)
    return open(wanted)
  }

  /** Routes that work before any skill is open. */
  const libraryRoutes: Record<string, LibraryRoute> = {
    'GET /api/skills': () => skills,
    'GET /api/library': () => scanLibrary(skills.map((s) => s.path)),
    'POST /api/library/create': (_url, body) => {
      const path = createSkill({
        scope: str(body.scope, 'user'),
        name: str(body.name).trim(),
        description: str(body.description).trim(),
        agents: list(body.agents),
      })
      return open(path)
    },
    'POST /api/library/link': (_url, body) => ({
      linked: linkSkill(str(body.path), str(body.agent), str(body.scope, 'user')),
    }),
    'POST /api/library/unlink': (_url, body) => {
      unlinkSkill(str(body.path), str(body.agent), str(body.scope, 'user'))
      return { unlinked: true }
    },
    'POST /api/library/workspaces': (_url, body) => ({
      workspaces: setWorkspaces(list(body.workspaces)),
    }),
    'POST /api/library/mark': (_url, body) => {
      markOthers(str(body.path), body.theirs === true)
      return { marked: true }
    },
  }

  const state = async (skill: SkillInfo) => {
    const config = loadBench(skill.path)
    return {
      skill,
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

  const routes: Record<string, Route> = {
    'GET /api/state': (_url, _body, skill) => state(skill),
    'GET /api/run': (url, _body, skill) =>
      readRun(skill.path, assertSafe(url.searchParams.get('run'), 'run')),
    'GET /api/transcript': (url, _body, skill) =>
      sampleTranscript(
        skill.path,
        assertSafe(url.searchParams.get('run'), 'run'),
        assertSafe(url.searchParams.get('sample'), 'sample'),
      ) ?? [],
    'GET /api/skill-files': (url, _body, skill) => {
      const run = url.searchParams.get('run') ?? 'current'
      if (run === 'current') return { files: skillFiles(skill.path), label: 'Working tree' }
      assertSafe(run, 'run')
      return { files: readTree(join(runDir(skill.path, run), '_skill')), label: run }
    },
    'GET /api/jobs': () => listJobs(),
    'GET /api/queue': (_url, _body, skill) => {
      const reviews = loadReviews(skill.path)
      return reviewQueue(
        listRuns(skill.path).flatMap((r) =>
          r.report ? [{ name: r.name, results: r.report.results }] : [],
        ),
        new Set(Object.keys(reviews.reviews)),
      )
    },
    'GET /api/leaderboard': (_url, _body, skill) => {
      const { preferences } = loadReviews(skill.path)
      return {
        boards: leaderboards(preferences),
        agreement: agreement(voteKeys(preferences, 'jev'), voteKeys(preferences, 'human')),
      }
    },
    'POST /api/review': (_url, body, skill) => {
      const key = assertSafePath(str(body.key), 'key')
      const review = (body.review ?? {}) as Partial<Review>
      saveReview(skill.path, key, {
        rating: typeof review.rating === 'number' ? review.rating : null,
        layers: review.layers ?? {},
        note: str(review.note),
      })
      return { saved: reviewsPath(skill.path) }
    },
    'POST /api/preference': (_url, body, skill) => {
      const vote = str(body.vote)
      if (!['a', 'b', 'tie'].includes(vote)) throw new Error('Bad vote.')
      savePreference(skill.path, {
        a: assertSafePath(str(body.a), 'a'),
        b: assertSafePath(str(body.b), 'b'),
        criterion: str(body.criterion, 'overall'),
        vote: vote as Preference['vote'],
        by: 'human',
      })
      return { saved: reviewsPath(skill.path) }
    },
    'POST /api/skill-file': (_url, body, skill) => {
      if (typeof body.text !== 'string') throw new Error('Bad text.')
      const path = str(body.path)
      writeSkillFile(
        skill.path,
        path,
        body.text,
        typeof body.previous === 'string' ? body.previous : null,
      )
      // The name and description come from SKILL.md's front matter.
      if (path === 'SKILL.md') Object.assign(skill, skillInfo(skill.path))
      return { saved: path }
    },
    'POST /api/skill-file/delete': (_url, body, skill) => {
      const path = str(body.path)
      deleteSkillFile(skill.path, path)
      return { deleted: path }
    },
    'POST /api/case': (_url, body, skill) => ({
      saved: saveCase(skill.path, caseDraftOf(body.case), body.isNew === true),
    }),
    'POST /api/case/delete': (_url, body, skill) => {
      deleteCase(skill.path, assertSafe(str(body.id), 'case'))
      return { deleted: true }
    },
    'POST /api/config': (_url, body, skill) => {
      if (!body.config || typeof body.config !== 'object') throw new Error('Bad config.')
      writeJson(benchPath(skill.path), body.config)
      return { saved: benchPath(skill.path), config: loadBench(skill.path) }
    },
    'POST /api/anchor': (_url, body, skill) => {
      const label = str(body.label)
      if (label !== 'good' && label !== 'bad') throw new Error('Bad label.')
      return {
        saved: promoteAnchor(skill.path, {
          run: str(body.run),
          sample: str(body.sample),
          file: str(body.file),
          case: str(body.case),
          label,
          tests: list(body.tests),
          about: str(body.about),
        }),
      }
    },
    'POST /api/generate': (_url, body, skill) => {
      const cases = loadCases(skill.path)
      const wanted = list(body.cases)
      const selected = wanted.length ? cases.filter((c) => wanted.includes(c.id)) : cases
      if (!selected.length) throw new Error('No cases selected.')
      const configs = (Array.isArray(body.configs) ? body.configs : []).slice(0, 4) as Body[]
      const engines = configs.flatMap((c) => {
        const engine = engineById(str(c.engine))
        return engine?.available()
          ? [{ engine, model: str(c.model) || null, effort: str(c.effort) || null }]
          : []
      })
      if (!engines.length) throw new Error('No available engine selected.')
      const configuration = str(body.configuration, 'with_skill') as Configuration
      if (!CONFIGURATIONS.includes(configuration))
        throw new Error(`Bad configuration ${configuration}.`)
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
                  samples: num(body.samples, 1),
                  configuration,
                  baselineRun: str(body.baselineRun) || null,
                  skillName: str(body.skillName) || null,
                  note: str(body.note),
                  log: (line) => say(job, line),
                })
                if (body.grade === false) return true
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
    'POST /api/grade': (_url, body, skill) => {
      const run = assertSafe(str(body.run), 'run')
      const job = runJob('grade', `Grade ${run}`, async (job) => {
        await gradeRun(skill.path, run, {
          useJev: body.jev !== false && Jev.available(),
          log: (line) => say(job, line),
        })
        say(job, 'Graded.')
        return true
      })
      return { started: true, job: job.id }
    },
    'POST /api/pairwise': (_url, body, skill) => {
      const a = assertSafePath(str(body.a), 'a')
      const b = assertSafePath(str(body.b), 'b')
      const criteria = list(body.criteria)
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

  /** A sample artifact or a case file, served raw by its kind. */
  const artifact = (url: URL, skill: SkillInfo): Static => {
    const run = assertSafe(url.searchParams.get('run'), 'run')
    const sample = assertSafe(url.searchParams.get('sample'), 'sample')
    const file = assertSafePath(url.searchParams.get('file'), 'file')
    const path = sampleFile(skill.path, run, sample, file)
    if (!existsSync(path) || statSync(path).isDirectory()) throw new Error('No such file.')
    return {
      bytes: readFileSync(path),
      type: TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    }
  }

  return { skills, skillOf, routes, libraryRoutes, artifact }
}

const send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  type = TYPES['.json'],
  headers: Record<string, string> = {},
) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers })
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

async function bodyOf(req: IncomingMessage): Promise<Body> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? (JSON.parse(raw) as Body) : {}
}

export function startServer(options: ServerOptions): Promise<number> {
  loadEnv()
  const port = options.port ?? DEFAULT_PORT
  const api = createApi(options.skills)
  const ui = join(TOOL_ROOT, 'app/dist')
  const server = createServer(async (req, res) => {
    const refused = refusal(req.method, req.headers)
    if (refused) return send(res, 403, { error: refused })
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    try {
      const body = req.method === 'POST' ? await bodyOf(req) : {}
      const free = api.libraryRoutes[`${req.method} ${url.pathname}`]
      if (free) return send(res, 200, await free(url, body))
      if (url.pathname === '/api/artifact') {
        const file = api.artifact(url, api.skillOf(url, body))
        // Agent-written HTML must never run on this origin: it could call the API.
        return send(res, 200, file.bytes, file.type, { 'content-security-policy': 'sandbox' })
      }
      const route = api.routes[`${req.method} ${url.pathname}`]
      if (route) return send(res, 200, await route(url, body, api.skillOf(url, body)))
      if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'No such route.' })
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' })
      if (!isDir(ui))
        return send(
          res,
          200,
          'skill-tester API is up. Build the UI (pnpm app) to browse it.',
          TYPES['.txt'],
        )
      let path = join(ui, url.pathname === '/' ? 'index.html' : url.pathname.slice(1))
      if (!isWithin(path, ui) || !existsSync(path) || statSync(path).isDirectory())
        path = join(ui, 'index.html')
      return send(res, 200, readFileSync(path), TYPES[extname(path)] ?? 'application/octet-stream')
    } catch (error) {
      return send(res, 400, { error: (error as Error).message })
    }
  })
  return new Promise((done, fail) => {
    server.on('error', (error: NodeJS.ErrnoException) => {
      fail(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Port ${port} is taken. Stop what holds it (lsof -nP -iTCP:${port} -sTCP:LISTEN) or pass --port.`,
            )
          : error,
      )
    })
    server.listen(port, '127.0.0.1', () => done(port))
  })
}
