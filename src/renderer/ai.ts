/**
 * The assistant in the page: which providers are connected and the model in
 * use, the replies being written, and the side panel's conversation. The
 * backend holds all three; this mirrors them. A running reply is asked after
 * until it ends: in a browser that is how it grows; in the desktop app pushes
 * bring the text, and asking finds a reply the backend lost. The model in use
 * is a preference, so every control that shows it shows the same one.
 */
import {
  type AiChoice,
  type AiModel,
  type AiProviderId,
  type AiProviderInfo,
  type AiRun,
  type ChatThread,
  isNewsOf,
  isSettled,
  modelOf,
  resolveChoice,
  runsToForget,
} from '@domain/ai.ts'
import type { AssistInput, ChatScene } from '@domain/assist.ts'
import type { SlashCommand } from '@domain/commands.ts'
import type { ImageRef } from '@domain/image.ts'
import type { ImproveThread, RefineResult } from '@domain/improve.ts'
import type { RuleScene } from '@domain/lint.ts'
import { aiChoiceOf, aiChoicePatch } from '@domain/preferences.ts'
import { useSyncExternalStore } from 'react'
import { api } from './api.ts'
import { savePreference, usePreferences } from './preferences.ts'
import { createEmitter, createStore, useStore } from './store.ts'
import { reportFailure } from './transport.ts'

/**
 * How often a running reply is asked after: often where asking is the only way
 * to see it grow, seldom where pushes bring the text. Over HTTP each ask is a
 * request, so a reply grows in steps a reader still sees as a stream.
 */
const POLL_MS = api.watchAi ? 2000 : 400

let providers: AiProviderInfo[] | null = null
/** Why the providers could not be read; null once they have been. */
let providersProblem: string | null = null
/** The newest read of the providers asked for, and the newest taken: an older one landing later is dropped. */
let providersAsked = 0
let providersTaken = 0
let thread: ChatThread | null = null
/** The same for the conversation. */
let threadProblem: string | null = null
/** The improve conversation on a selected rule; null when none is open. */
let improve: ImproveThread | null = null
let improveProblem: string | null = null
/** The commands a message may start with, null until read; and why the read failed. */
let commands: SlashCommand[] | null = null
let commandsProblem: string | null = null
/** Which read of the commands is the latest: an older one landing later is dropped. */
let commandsRead = 0
/** The same for the conversation and the improve conversation: a send or a clear is newer than any read before it. */
let chatRead = 0
let improveRead = 0
const runs = new Map<string, AiRun>()
/** The runs being asked after, so no run is asked after twice at once. */
const polled = new Set<string>()
/** One signal for every value above: any of them changed. */
const { emit, subscribe } = createEmitter()

/** A chat reply that ended without failing is part of the conversation now. */
const joinedChat = (run: AiRun): boolean =>
  run.kind === 'chat' && isSettled(run) && run.status !== 'failed'

/** An improve reply that ended changed its thread: a question joined it, or a draft and its checklist. */
const joinedImprove = (run: AiRun): boolean => run.kind === 'improve' && isSettled(run)

/** Hold a run. A new one goes in last, so the map stays oldest first, and the oldest ended ones make room. */
function hold(run: AiRun): void {
  const isNew = !runs.has(run.id)
  runs.set(run.id, run)
  if (isNew) for (const id of runsToForget([...runs.values()])) runs.delete(id)
}

/**
 * Take a report of a run. A stale one is dropped: the reply to a call can land
 * after the push that reported the run's end.
 */
function take(run: AiRun): void {
  if (!isNewsOf(runs.get(run.id), run)) return
  hold(run)
  if (thread?.run?.id === run.id) thread = { ...thread, run }
  if (improve?.run?.id === run.id) improve = { ...improve, run }
  emit()
  if (joinedChat(run)) void loadChat()
  if (joinedImprove(run)) void loadImprove()
}

/** A run the host can no longer answer for has failed, as far as the page can tell. */
const lost = (run: AiRun) => (e: Error) => take({ ...run, status: 'failed', error: e.message })

/** Ask after a run until the mirror has its end. Throws when the host no longer answers for it. */
async function poll(id: string): Promise<void> {
  for (;;) {
    await new Promise((done) => setTimeout(done, POLL_MS))
    const known = runs.get(id)
    if (!known || isSettled(known)) return
    take(await api.aiRun(id))
  }
}

/** Keep a run that was just started up to date until it ends. */
function follow(run: AiRun): AiRun {
  // A push may have brought a newer state of it already.
  const known = runs.get(run.id) ?? run
  take(known)
  if (!polled.has(run.id)) {
    polled.add(run.id)
    poll(run.id)
      .catch(lost(known))
      .finally(() => polled.delete(run.id))
  }
  return known
}

/** Hold a run a read brought. One still being written is followed: in a browser nothing else would bring its end. */
const keep = (run: AiRun): void => {
  if (isSettled(run)) hold(run)
  else follow(run)
}

api.watchAi?.(take)

/** What one read of the providers found: the list, or why it could not be read. */
export interface ProvidersRead {
  providers: AiProviderInfo[] | null
  problem: string | null
}

/**
 * Read which providers are connected and what they offer. Call at launch and
 * after a key changes. A failed read keeps what was known and says why. A read
 * that lands after a newer one leaves the mirror alone. Each read resolves to
 * what it found itself, which another read landing meanwhile cannot change.
 */
export async function loadAi(): Promise<ProvidersRead> {
  const read = ++providersAsked
  let found: ProvidersRead
  try {
    found = { providers: (await api.aiStatus()).providers, problem: null }
  } catch (e) {
    found = { providers: null, problem: (e as Error).message }
  }
  if (read > providersTaken) {
    providersTaken = read
    if (found.providers) providers = found.providers
    providersProblem = found.problem
    emit()
  }
  return found
}

/**
 * Read the providers again and return one of them as it stands now, after the
 * person has installed a CLI or signed it in themselves, in a terminal. The
 * problem is this read's own: why it failed, or null.
 */
export async function recheck(
  provider: AiProviderId,
): Promise<{ info: AiProviderInfo | undefined; problem: string | null }> {
  const found = await loadAi()
  return { info: found.providers?.find((p) => p.id === provider), problem: found.problem }
}

/** Read the commands the model in use can run. Call when the side panel opens and when the provider changes. */
export async function loadCommands(): Promise<void> {
  const read = ++commandsRead
  let next: SlashCommand[] = []
  let problem: string | null = null
  try {
    next = await api.aiCommands()
  } catch (e) {
    problem = (e as Error).message
  }
  // The provider changed and a newer read is on its way: its list is the one to show.
  if (read !== commandsRead) return
  commands = next
  commandsProblem = problem
  emit()
}

/** The commands a message may start with: null until the first read, and why the last read failed. */
export interface Commands {
  list: SlashCommand[] | null
  problem: string | null
}

export function useCommands(): Commands {
  return {
    list: useSyncExternalStore(subscribe, () => commands),
    problem: useSyncExternalStore(subscribe, () => commandsProblem),
  }
}

/** Read the conversation. A failed read keeps what was known and says why. */
export async function loadChat(): Promise<void> {
  const read = ++chatRead
  try {
    const next = await api.chat()
    // A message was sent, or the conversation cleared or read again, since: that is the newer word.
    if (read !== chatRead) return
    thread = next
    threadProblem = null
    if (next.run) keep(next.run)
  } catch (e) {
    if (read !== chatRead) return
    threadProblem = (e as Error).message
  }
  emit()
}

/** Read the improve conversation. A failed read keeps what was known and says why. */
export async function loadImprove(): Promise<void> {
  const read = ++improveRead
  try {
    const next = await api.improve()
    if (read !== improveRead) return
    improve = next
    improveProblem = null
    if (next?.run) keep(next.run)
  } catch (e) {
    if (read !== improveRead) return
    improveProblem = (e as Error).message
  }
  emit()
}

export interface Ai {
  /** Null until the first answer from the host. */
  providers: AiProviderInfo[] | null
  /** Why the last read of the providers failed; null when it did not. */
  problem: string | null
  /** The model in use; null when nothing is connected. */
  choice: AiChoice | null
  model: AiModel | null
  /** Pick the model in use. It shows at once; a store that fails is said on the status line. */
  choose: (choice: AiChoice) => void
}

export function useAi(): Ai {
  const preferences = usePreferences()
  const known = useSyncExternalStore(subscribe, () => providers)
  const problem = useSyncExternalStore(subscribe, () => providersProblem)
  const choice = known ? resolveChoice(aiChoiceOf(preferences), known) : null
  return {
    providers: known,
    problem,
    choice,
    model: (choice && known && modelOf(choice, known)) ?? null,
    choose: (next) =>
      savePreference(aiChoicePatch(next), (message) =>
        reportFailure(typeof message === 'string' ? new Error(message) : message),
      ),
  }
}

export function useRun(id: string | null): AiRun | null {
  return useSyncExternalStore(subscribe, () => (id === null ? null : (runs.get(id) ?? null)))
}

export const startAssist = async (input: AssistInput): Promise<AiRun> =>
  follow(await api.assist(input))

/** Stop a reply still being written. One that has ended, and may be forgotten here by now, stays as it is. */
export function stopRun(id: string): void {
  const run = runs.get(id)
  if (!run || isSettled(run)) return
  api.aiStop(id).then(take, lost(run))
}

/** The conversation, null until it is first read, and why the last read of it failed. */
export function useChat(): { thread: ChatThread | null; problem: string | null } {
  return {
    thread: useSyncExternalStore(subscribe, () => thread),
    problem: useSyncExternalStore(subscribe, () => threadProblem),
  }
}

/** Send a message from `screen`, where the reader has `open` in view. */
export async function sendChat(
  text: string,
  images: ImageRef[],
  screen: string,
  open: ChatScene['open'],
): Promise<void> {
  const next = await api.chatSend(text, images, screen, open)
  chatRead += 1
  thread = next
  if (next.run) follow(next.run)
  // A reply that ended before this returned was taken already, and `follow` then tells nobody.
  emit()
}

export async function clearChat(): Promise<void> {
  const next = await api.chatClear()
  chatRead += 1
  thread = next
  emit()
}

/**
 * The message being typed in the side panel, and the answer being typed in an
 * improve conversation. Kept here, not in the panel, so closing the panel or
 * swapping one conversation for the other loses neither.
 */
const chatDraftStore = createStore('')
const improveDraftStore = createStore('')

const setImproveDraft = (text: string): void => improveDraftStore.set(text)

/** The side panel's unsent message, and the way to change it. */
export const useChatDraft = (): [string, (text: string) => void] => [
  useStore(chatDraftStore),
  chatDraftStore.set,
]

/** The improve conversation's unsent answer, and the way to change it. It empties when the conversation closes. */
export const useImproveDraft = (): [string, (text: string) => void] => [
  useStore(improveDraftStore),
  setImproveDraft,
]

/** Auto refine: what is wrong with the rule, and the revision on its way when anything drifts. */
export async function startRefine(scene: RuleScene): Promise<RefineResult> {
  const result = await api.refine(scene)
  return result.run ? { ...result, run: follow(result.run) } : result
}

/** Suggest changes: the run whose finished text holds the three rewrites. */
export const startRewrites = async (scene: RuleScene): Promise<AiRun> =>
  follow(await api.rewrites(scene))

/** The improve conversation, null when none is open, and why the last read of it failed. */
export function useImprove(): { thread: ImproveThread | null; problem: string | null } {
  return {
    thread: useSyncExternalStore(subscribe, () => improve),
    problem: useSyncExternalStore(subscribe, () => improveProblem),
  }
}

const tookImprove = (next: ImproveThread): void => {
  improveRead += 1
  improve = next
  if (next.run) follow(next.run)
  emit()
}

/** Open an improve conversation on a selected rule. It opens the side panel. */
export async function startImprove(scene: RuleScene): Promise<void> {
  tookImprove(await api.improveStart(scene))
}

export async function sendImprove(text: string): Promise<void> {
  tookImprove(await api.improveSend(text))
}

/** Close the improve conversation. The side panel goes back to the chat. */
export async function clearImprove(): Promise<void> {
  await api.improveClear()
  improveRead += 1
  improve = null
  setImproveDraft('')
  emit()
}
