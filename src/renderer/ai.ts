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
  type AiProviderInfo,
  type AiRun,
  type ChatThread,
  isNewsOf,
  isSettled,
  modelOf,
  resolveChoice,
  runsToForget,
} from '@domain/ai.ts'
import type { AssistInput } from '@domain/assist.ts'
import type { ImageRef } from '@domain/image.ts'
import { aiChoiceOf, aiChoicePatch } from '@domain/preferences.ts'
import { useSyncExternalStore } from 'react'
import { api } from './api.ts'
import { setPreferences, usePreferences } from './preferences.ts'

/**
 * How often a running reply is asked after: often where asking is the only way
 * to see it grow, seldom where pushes bring the text.
 */
const POLL_MS = api.watchAi ? 2000 : 150

let providers: AiProviderInfo[] | null = null
/** Why the providers could not be read; null once they have been. */
let providersProblem: string | null = null
let thread: ChatThread | null = null
/** The same for the conversation. */
let threadProblem: string | null = null
const runs = new Map<string, AiRun>()
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A chat reply that ended without failing is part of the conversation now. */
const joinedChat = (run: AiRun): boolean =>
  run.kind === 'chat' && isSettled(run) && run.status !== 'failed'

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
  emit()
  if (joinedChat(run)) void loadChat()
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
  poll(run.id).catch(lost(known))
  return known
}

api.watchAi?.(take)

/**
 * Read which providers are connected and what they offer. Call at launch and
 * after a key changes. A failed read keeps what was known and says why.
 */
export async function loadAi(): Promise<void> {
  try {
    providers = (await api.aiStatus()).providers
    providersProblem = null
  } catch (e) {
    providersProblem = (e as Error).message
  }
  emit()
}

/** Read the conversation. A failed read keeps what was known and says why. */
export async function loadChat(): Promise<void> {
  try {
    thread = await api.chat()
    threadProblem = null
    if (thread.run) hold(thread.run)
  } catch (e) {
    threadProblem = (e as Error).message
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
    choose: (next) => void setPreferences(aiChoicePatch(next)),
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

export async function sendChat(text: string, images: ImageRef[], screen: string): Promise<void> {
  thread = await api.chatSend(text, images, screen)
  if (thread.run) follow(thread.run)
  else emit()
}

export async function clearChat(): Promise<void> {
  thread = await api.chatClear()
  emit()
}
