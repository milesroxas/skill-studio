/**
 * The typed client of the operations table. Every call names the open skill,
 * remembered across reloads, so screens never pass it.
 */
import type { CreateSkillInput, GenerateInput } from '@application/api/contract.ts'
import type { AssistInput, ChatScene } from '@domain/assist.ts'
import type { ImageRef, ImageUpload } from '@domain/image.ts'
import type { InputPick } from '@domain/inputs.ts'
import type { AgentId } from '@domain/library.ts'
import type { RuleScene } from '@domain/lint.ts'
import type { LookStep } from '@domain/practice.ts'
import type { Preferences } from '@domain/preferences.ts'
import type { CaseDraft, SkillDrafts } from '@domain/schemas.ts'
import type { SecretId } from '@domain/secrets.ts'
import { transport } from './transport.ts'

export type { Job, JobProgress, RunView, Sample, State } from '@domain/views.ts'

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

const artifactUrl = (run: string, sample: string, file: string, stage = false): string =>
  transport.artifactUrl(scoped({ run, sample, file }), { stage })

/** Where an `<img>` loads a picture from: an upload by its id, a saved one by its path in the open skill. */
const imageUrl = (image: ImageRef): string =>
  transport.imageUrl({
    skill: image.upload ? '' : skillParam,
    file: image.file ?? '',
    upload: image.upload ?? '',
  })

export const api = {
  platform: transport.platform,
  skills: () => call('library.skills', {}),
  library: () => call('library.scan', {}),
  createSkill: (input: CreateSkillInput) => call('library.create', input),
  /** The practice skill, written the first time it is asked for. */
  practice: () => call('library.practice', {}),
  /** The practice skill as first written, with its runs, corrections, edits and drafts gone. */
  restartPractice: () => call('library.restartPractice', {}),
  /** Mark a walkthrough step that only asks to look at its screen. */
  practiceSeen: (step: LookStep) => call('library.practiceSeen', { step }),
  link: (path: string, agent: AgentId, scope: string) =>
    call('library.link', { path, agent, scope }),
  unlink: (path: string, agent: AgentId, scope: string) =>
    call('library.unlink', { path, agent, scope }),
  setWorkspaces: (workspaces: string[]) => call('library.workspaces', { workspaces }),
  markDone: (path: string, done: boolean) => call('library.done', { path, done }),
  jobs: () => call('jobs.list', {}),
  stopJob: (id: number) => call('jobs.stop', { id }),
  /** Push job changes when the host can; the shell polls otherwise. */
  watchJobs: transport.watchJobs,
  /** Screens the desktop app's Help menu asks for. */
  watchGo: transport.watchGo,
  /** A skill the welcome's window hands this one to open. */
  watchOpen: transport.watchOpen,
  /** The welcome in a window of its own; undefined in a browser, which shows it in the page. */
  openWelcome: transport.openWelcome,
  /** Leave the welcome's window for the app. */
  enterApp: transport.enterApp,
  /** The desktop app's own updates; undefined in a browser. */
  updates: transport.updates,
  /** Start the app over; undefined unless this copy was made for testing. */
  reset: transport.reset,
  settings: () => call('settings.read', {}),
  /** Store a key in the host's keychain; an empty value removes the stored one. */
  setKey: (id: SecretId, value: string) => call('settings.key', { id, value }),
  aiStatus: () => call('ai.status', {}),
  aiUsage: () => call('ai.usage', {}),
  aiCommands: () => call('ai.commands', {}),
  /** The open skill goes along, so a picture saved in it can be found. */
  assist: (input: AssistInput) => call('ai.assist', scoped(input)),
  aiRun: (id: string) => call('ai.run', { id }),
  aiStop: (id: string) => call('ai.stop', { id }),
  /** Push assistant replies when the host can; the store polls otherwise. */
  watchAi: transport.watchAi,
  chat: () => call('chat.read', {}),
  /** The open skill, if any, goes along so the assistant knows what is in hand. */
  chatSend: (text: string, images: ImageRef[], screen: string, open: ChatScene['open']) =>
    call('chat.send', scoped({ text, images, screen, open })),
  chatClear: () => call('chat.clear', {}),
  /** Auto refine on a selected rule: the findings, and the revision on its way when anything drifts. */
  refine: (scene: RuleScene) => call('ai.refine', scene),
  /** Suggest changes on a selected rule: one run whose finished text is the three rewrites. */
  rewrites: (scene: RuleScene) => call('ai.rewrites', scene),
  improve: () => call('improve.read', {}),
  improveStart: (scene: RuleScene) => call('improve.start', scene),
  improveSend: (text: string) => call('improve.send', { text }),
  improveClear: () => call('improve.clear', {}),
  uploadImage: (upload: ImageUpload) => call('image.upload', upload),
  uploadInput: (pick: InputPick) => call('input.upload', pick),
  imageUrl,
  openImage: (image: ImageRef) => transport.openArtifact(imageUrl(image)),
  preferences: () => call('preferences.read', {}),
  savePreferences: (preferences: Preferences) => call('preferences.write', { preferences }),
  state: () => call('skill.state', scoped({})),
  run: (run: string) => call('skill.run', scoped({ run })),
  transcript: (run: string, sample: string) => call('skill.transcript', scoped({ run, sample })),
  artifactUrl,
  openArtifact: (run: string, sample: string, file: string) =>
    transport.openArtifact(artifactUrl(run, sample, file)),
  openExternal: transport.openExternal,
  /** Show a skill's folder in the file manager; undefined in a browser. */
  revealSkill: transport.revealSkill,
  /** Open a case's `files` folder in the file manager; undefined in a browser. */
  openCaseFiles: transport.openCaseFiles,
  /** Pick a folder in the system's dialog; undefined in a browser, where one is typed. */
  chooseFolder: transport.chooseFolder,
  artifactText: async (run: string, sample: string, file: string): Promise<string> => {
    const { bytes } = await call('skill.artifact', scoped({ run, sample, file }))
    return new TextDecoder().decode(bytes)
  },
  /** `current`, a version label (`v2`) or a run name. */
  skillFiles: (source: string) => call('skill.files', scoped({ source })),
  saveVersion: (name: string, note: string) => call('skill.saveVersion', scoped({ name, note })),
  restoreVersion: (version: string, force: boolean) =>
    call('skill.restoreVersion', scoped({ version, force })),
  deleteVersion: (version: string) => call('skill.deleteVersion', scoped({ version })),
  undeleteVersion: (undo: string) => call('skill.undeleteVersion', scoped({ undo })),
  deleteRun: (run: string) => call('skill.deleteRun', scoped({ run })),
  undeleteRun: (undo: string) => call('skill.undeleteRun', scoped({ undo })),
  /** Drafts name their skill outright: a store can land after another skill is opened. */
  drafts: (skill: string) => call('skill.drafts', { skill }),
  saveDrafts: (skill: string, drafts: SkillDrafts) => call('skill.saveDrafts', { skill, drafts }),
  saveSkillFile: (path: string, text: string, previous: string | null) =>
    call('skill.saveFile', scoped({ path, text, previous })),
  deleteSkillFile: (path: string) => call('skill.deleteFile', scoped({ path })),
  /** Your own answer on one verdict of an output; null takes it back, so Jev's stands again. */
  correct: (key: string, verdict: string, met: boolean | null) =>
    call('skill.correct', scoped({ key, verdict, met })),
  /** Set the packs the skill is graded as; the rest of `bench.json` stays as it is. */
  gradedAs: (packs: string[]) => call('skill.gradedAs', scoped({ packs })),
  generate: (request: GenerateRequest) => call('skill.generate', scoped(request)),
  grade: (run: string, jev = true) => call('skill.grade', scoped({ run, jev })),
  /** `savedAt` is when the form's copy of the case was saved: a newer copy on disk refuses the save. */
  saveCase: (draft: CaseDraft, isNew: boolean, savedAt: string | null = null) =>
    call('skill.saveCase', scoped({ case: draft, isNew, savedAt })),
  deleteCase: (id: string) => call('skill.deleteCase', scoped({ id })),
}
