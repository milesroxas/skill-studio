/**
 * The typed client of the operations table. Every call names the open skill,
 * remembered across reloads, so screens never pass it.
 */
import type { CreateSkillInput, GenerateInput } from '@application/api/contract.ts'
import type { AgentId } from '@domain/library.ts'
import type { BenchConfig, CaseDraft, Review, Vote } from '@domain/schemas.ts'
import { transport } from './transport.ts'

export type { Job, RunView, Sample, Settings, State } from '@domain/views.ts'

type GenerateRequest = Omit<GenerateInput, 'skill'>

const SKILL_KEY = 'skill-studio.skill'
// A link can name the skill (`?skill=<path>`); it then becomes the remembered one.
const linked = new URLSearchParams(window.location.search).get('skill')
if (linked !== null) {
  localStorage.setItem(SKILL_KEY, linked)
  window.history.replaceState(null, '', window.location.pathname + window.location.hash)
}
let skillParam = localStorage.getItem(SKILL_KEY) ?? ''
/** The skill every call addresses, by path; remembered across reloads. Empty: none open. */
export const currentSkill = (): string => skillParam
export const setSkill = (path: string): void => {
  skillParam = path
  if (path) localStorage.setItem(SKILL_KEY, path)
  else localStorage.removeItem(SKILL_KEY)
}

const { call } = transport
const scoped = <T extends object>(input: T): T & { skill: string } => ({
  ...input,
  skill: skillParam,
})

const artifactUrl = (run: string, sample: string, file: string): string =>
  transport.artifactUrl(scoped({ run, sample, file }))

export const api = {
  platform: transport.platform,
  skills: () => call('library.skills', {}),
  library: () => call('library.scan', {}),
  createSkill: (input: CreateSkillInput) => call('library.create', input),
  link: (path: string, agent: AgentId, scope: string) =>
    call('library.link', { path, agent, scope }),
  unlink: (path: string, agent: AgentId, scope: string) =>
    call('library.unlink', { path, agent, scope }),
  setWorkspaces: (workspaces: string[]) => call('library.workspaces', { workspaces }),
  mark: (path: string, theirs: boolean) => call('library.mark', { path, theirs }),
  jobs: () => call('jobs.list', {}),
  /** Push job changes when the host can; the shell polls otherwise. */
  watchJobs: transport.watchJobs,
  settings: () => call('settings.read', {}),
  setJevKey: (value: string) => call('settings.jevKey', { value }),
  state: () => call('skill.state', scoped({})),
  run: (run: string) => call('skill.run', scoped({ run })),
  transcript: (run: string, sample: string) => call('skill.transcript', scoped({ run, sample })),
  artifactUrl,
  openArtifact: (run: string, sample: string, file: string) =>
    transport.openArtifact(artifactUrl(run, sample, file)),
  openExternal: transport.openExternal,
  artifactText: async (run: string, sample: string, file: string): Promise<string> => {
    const { bytes } = await call('skill.artifact', scoped({ run, sample, file }))
    return new TextDecoder().decode(bytes)
  },
  skillFiles: (run: string) => call('skill.files', scoped({ run })),
  saveSkillFile: (path: string, text: string, previous: string | null) =>
    call('skill.saveFile', scoped({ path, text, previous })),
  deleteSkillFile: (path: string) => call('skill.deleteFile', scoped({ path })),
  queue: () => call('skill.queue', scoped({})),
  leaderboard: () => call('skill.leaderboard', scoped({})),
  review: (key: string, review: Omit<Review, 'updatedAt'>) =>
    call('skill.review', scoped({ key, review })),
  preference: (a: string, b: string, criterion: string, vote: Vote) =>
    call('skill.preference', scoped({ a, b, criterion, vote })),
  pairwise: (a: string, b: string, criteria: string[]) =>
    call('skill.pairwise', scoped({ a, b, criteria })),
  config: (config: BenchConfig) => call('skill.config', scoped({ config })),
  anchor: (anchor: {
    run: string
    sample: string
    file: string
    case: string
    label: 'good' | 'bad'
    tests: string[]
    about: string
  }) => call('skill.anchor', scoped(anchor)),
  generate: (request: GenerateRequest) => call('skill.generate', scoped(request)),
  grade: (run: string, jev = true) => call('skill.grade', scoped({ run, jev })),
  saveCase: (draft: CaseDraft, isNew: boolean) =>
    call('skill.saveCase', scoped({ case: draft, isNew })),
  deleteCase: (id: string) => call('skill.deleteCase', scoped({ id })),
}
