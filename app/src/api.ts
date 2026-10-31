/**
 * The typed client for `st serve`. Shapes the server returns that core does
 * not define are declared here so the browser never imports from `server/`.
 */
import type { QueueItem, Rating } from '@core/index.ts'
import type { Rule } from '@core/rules.ts'
import type {
  Artifact,
  BenchConfig,
  Case,
  Configuration,
  Report,
  Review,
  Reviews,
  RunMeta,
  TranscriptEvent,
} from '@core/schemas.ts'

export interface SkillInfo {
  path: string
  name: string
  description: string
}

export interface Sample {
  name: string
  path: string
  artifacts: Artifact[]
  hasTranscript: boolean
  legacy: boolean
}

export interface RunView {
  name: string
  meta: RunMeta | null
  report: Report | null
  samples: Sample[]
  hasSkill: boolean
}

export interface EngineInfo {
  id: string
  label: string
  harness: 'agent' | 'api'
  efforts: string[]
  models: string[]
  defaultModel: string
  available: boolean
  hint: string
}

export interface SkillVersion {
  version: string
  name: string
  hash: string
  note: string
  date: string | undefined
}

export interface AnchorInfo {
  file: string
  case: string | null
  label: string | null
  tests: string[]
}

export interface State {
  skill: SkillInfo
  skills: SkillInfo[]
  cases: Case[]
  runs: RunView[]
  versions: { versions: SkillVersion[]; current: SkillVersion & { changed: boolean } }
  engines: EngineInfo[]
  reviews: Reviews
  config: BenchConfig
  savedConfig: Partial<BenchConfig>
  rules: Rule[]
  anchors: AnchorInfo[]
  jevKey: boolean
  paths: { bench: string; reviews: string }
}

export interface Job {
  id: number
  kind: 'generate' | 'grade' | 'pairwise'
  title: string
  status: 'running' | 'done' | 'failed'
  log: string[]
  startedAt: number
  finishedAt: number | null
}

export interface Leaderboard {
  boards: Record<string, { jev: Rating[]; human: Rating[] }>
  agreement: { agreed: number; compared: number; share: number | null }
}

export interface GenerateRequest {
  cases: string[]
  configs: Array<{ engine: string; model: string; effort: string }>
  samples: number
  configuration: Configuration
  baselineRun: string | null
  skillName: string | null
  note: string
  grade?: boolean
}

let skillParam = ''
/** Which served skill every call addresses; empty means the first. */
export const setSkill = (path: string): void => {
  skillParam = path
}

const withSkill = (path: string): string => {
  if (!skillParam) return path
  return `${path}${path.includes('?') ? '&' : '?'}skill=${encodeURIComponent(skillParam)}`
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    withSkill(path),
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  )
  if (!response.ok) throw new Error(await errorOf(response))
  return response.json()
}

/** The server's `{ error }`; a proxy error while the server is down has no JSON body. */
async function errorOf(response: Response): Promise<string> {
  try {
    return (await response.json()).error ?? response.statusText
  } catch {
    return response.statusText
  }
}

const q = (params: Record<string, string>): string => new URLSearchParams(params).toString()

const artifactUrl = (run: string, sample: string, file: string): string =>
  withSkill(`/api/artifact?${q({ run, sample, file })}`)

export const api = {
  skills: () => call<SkillInfo[]>('/api/skills'),
  state: () => call<State>('/api/state'),
  run: (run: string) => call<RunView>(`/api/run?${q({ run })}`),
  transcript: (run: string, sample: string) =>
    call<TranscriptEvent[]>(`/api/transcript?${q({ run, sample })}`),
  artifactUrl,
  artifactText: async (run: string, sample: string, file: string): Promise<string> => {
    const response = await fetch(artifactUrl(run, sample, file))
    if (!response.ok) throw new Error(`Could not read ${file}.`)
    return response.text()
  },
  skillFiles: (run: string) =>
    call<{ files: Record<string, string>; label: string }>(`/api/skill-files?${q({ run })}`),
  saveSkillFile: (path: string, text: string, previous: string | null) =>
    call<{ saved: string }>('/api/skill-file', { path, text, previous }),
  deleteSkillFile: (path: string) => call<{ deleted: string }>('/api/skill-file/delete', { path }),
  queue: () => call<QueueItem[]>('/api/queue'),
  leaderboard: () => call<Leaderboard>('/api/leaderboard'),
  jobs: () => call<Job[]>('/api/jobs'),
  review: (key: string, review: Omit<Review, 'updatedAt'>) =>
    call<{ saved: string }>('/api/review', { key, review }),
  preference: (a: string, b: string, criterion: string, vote: 'a' | 'b' | 'tie') =>
    call<{ saved: string }>('/api/preference', { a, b, criterion, vote }),
  pairwise: (a: string, b: string, criteria: string[]) =>
    call<{ started: true; job: number }>('/api/pairwise', { a, b, criteria }),
  config: (config: BenchConfig) =>
    call<{ saved: string; config: BenchConfig }>('/api/config', { config }),
  anchor: (body: {
    run: string
    sample: string
    file: string
    case: string
    label: 'good' | 'bad'
    tests: string[]
    about: string
  }) => call<{ saved: string }>('/api/anchor', body),
  generate: (body: GenerateRequest) => call<{ started: true; job: number }>('/api/generate', body),
  grade: (run: string, jev = true) =>
    call<{ started: true; job: number }>('/api/grade', { run, jev }),
}
