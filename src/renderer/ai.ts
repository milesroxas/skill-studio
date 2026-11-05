/**
 * The assistant in the page: which providers are connected and the model in
 * use, the replies being written, and the side panel's conversation. The
 * backend holds all three; this mirrors them, fed by pushes in the desktop app
 * and by polling a running reply in a browser. The model in use is a
 * preference, so every control that shows it shows the same one.
 */
import {
  type AiChoice,
  type AiModel,
  type AiProviderInfo,
  type AiRun,
  type ChatThread,
  isSettled,
  modelOf,
  resolveChoice,
} from '@domain/ai.ts'
import type { AssistInput } from '@domain/assist.ts'
import type { ImageRef } from '@domain/image.ts'
import { aiChoiceOf, aiChoicePatch } from '@domain/preferences.ts'
import { useSyncExternalStore } from 'react'
import { api } from './api.ts'
import { setPreferences, usePreferences } from './preferences.ts'

/** How often a browser asks after a running reply. */
const POLL_MS = 150

let providers: AiProviderInfo[] | null = null
let thread: ChatThread | null = null
const runs = new Map<number, AiRun>()
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

/** Take a newer state of a run. A chat reply that has ended is now part of the conversation. */
function take(run: AiRun): void {
  runs.set(run.id, run)
  if (thread?.run?.id === run.id) thread = { ...thread, run }
  emit()
  if (run.kind === 'chat' && isSettled(run)) void loadChat()
}

async function poll(id: number): Promise<void> {
  for (;;) {
    await new Promise((done) => setTimeout(done, POLL_MS))
    const run = await api.aiRun(id)
    take(run)
    if (isSettled(run)) return
  }
}

/** Keep a run that was just started up to date until it ends. */
function follow(run: AiRun): AiRun {
  // A push may have brought a newer state of it already.
  const known = runs.get(run.id) ?? run
  take(known)
  if (!api.watchAi && !isSettled(known))
    poll(run.id).catch((e: Error) => take({ ...known, status: 'failed', error: e.message }))
  return known
}

api.watchAi?.(take)

/** Read which providers are connected and what they offer. Call at launch and after a key changes. */
export async function loadAi(): Promise<void> {
  try {
    providers = (await api.aiStatus()).providers
  } catch {
    providers = []
  }
  emit()
}

export async function loadChat(): Promise<void> {
  thread = await api.chat()
  if (thread.run) runs.set(thread.run.id, thread.run)
  emit()
}

export interface Ai {
  /** Null until the first answer from the host. */
  providers: AiProviderInfo[] | null
  /** The model in use; null when nothing is connected. */
  choice: AiChoice | null
  model: AiModel | null
  choose: (choice: AiChoice) => void
}

export function useAi(): Ai {
  const preferences = usePreferences()
  const known = useSyncExternalStore(subscribe, () => providers)
  const choice = known ? resolveChoice(aiChoiceOf(preferences), known) : null
  return {
    providers: known,
    choice,
    model: (choice && known && modelOf(choice, known)) ?? null,
    choose: (next) => void setPreferences(aiChoicePatch(next)),
  }
}

export function useRun(id: number | null): AiRun | null {
  return useSyncExternalStore(subscribe, () => (id === null ? null : (runs.get(id) ?? null)))
}

export const startAssist = async (input: AssistInput): Promise<AiRun> =>
  follow(await api.assist(input))

export const stopRun = (id: number): Promise<void> => api.aiStop(id).then(take)

export function useChat(): ChatThread | null {
  return useSyncExternalStore(subscribe, () => thread)
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
