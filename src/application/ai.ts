/**
 * The assistant's work. A request starts a run: one reply, written by the
 * model the preferences name, held here while it grows and for a while after.
 * Interfaces either poll a run or subscribe with `watchRuns`, which reports a
 * growing reply a few times a second and its end at once. Two kinds of run
 * exist: `assist` fills one field in the field's own shape, `chat` adds a
 * reply to the side panel's conversation.
 */
import { randomUUID } from 'node:crypto'
import {
  type AiChoice,
  type AiRun,
  type AiRunKind,
  type AiStatus,
  CHAT_WINDOW,
  type ChatMessage,
  type ChatThread,
  resolveChoice,
  runsToForget,
  summarizeUsage,
  type UsageSummary,
} from '@domain/ai.ts'
import {
  ASSIST_SCHEMA,
  type AssistInput,
  assistPrompt,
  assistText,
  type ChatScene,
  chatSystem,
  partialText,
} from '@domain/assist.ts'
import type { ImageRef } from '@domain/image.ts'
import { aiChoiceOf } from '@domain/preferences.ts'
import { type AiMessage, aiProvider, aiProviderInfo } from '@infrastructure/ai/index.ts'
import { readChat, readUsage, recordUsage, writeChat } from '@infrastructure/ai/store.ts'
import { findImage, type StoredImage } from '@infrastructure/images.ts'
import { readPreferences } from '@infrastructure/preferences.ts'

/** A growing reply is reported at most this often: smooth to read, light to send. */
const REPORT_MS = 40

const runs = new Map<string, AiRun>()
const controllers = new Map<string, AbortController>()
const pending = new Map<string, ReturnType<typeof setTimeout>>()
const watchers = new Set<(run: AiRun) => void>()

/** Be told as a run grows and when it ends. Returns the unsubscribe. */
export function watchRuns(listener: (run: AiRun) => void): () => void {
  watchers.add(listener)
  return () => {
    watchers.delete(listener)
  }
}

function report(run: AiRun): void {
  pending.delete(run.id)
  for (const listener of watchers) listener({ ...run })
}

/** Report a run: at once when it has ended, else with the next batch of its changes. */
function changed(run: AiRun): void {
  if (run.status !== 'running') {
    clearTimeout(pending.get(run.id))
    report(run)
  } else if (!pending.has(run.id))
    pending.set(
      run.id,
      setTimeout(() => report(run), REPORT_MS),
    )
}

export function findRun(id: string): AiRun {
  const run = runs.get(id)
  if (!run) throw new Error('That reply is no longer kept. Ask again.')
  return { ...run }
}

/** Stop a run that is still being written; one that has ended stays as it is. */
export function stopRun(id: string): AiRun {
  controllers.get(id)?.abort()
  return findRun(id)
}

export const aiStatus = async (): Promise<AiStatus> => ({ providers: await aiProviderInfo() })

export const aiUsage = (): UsageSummary => summarizeUsage(readUsage(), new Date())

/** The model the preferences name, among what is connected now. */
async function currentChoice(): Promise<AiChoice> {
  const choice = resolveChoice(aiChoiceOf(readPreferences()), await aiProviderInfo())
  if (!choice) throw new Error('Connect a provider in Settings first.')
  return choice
}

interface Work {
  kind: AiRunKind
  choice: AiChoice
  system: string
  messages: AiMessage[]
  schema: Readonly<Record<string, unknown>> | null
  /** What the run shows of the reply so far. */
  preview: (raw: string) => string
  /** The run's text from the finished reply. Throws when the reply does not hold up. */
  finish: (raw: string) => string
  /** Called once, when the run has ended for any reason. */
  ended?: (run: AiRun) => void
}

function start(work: Work): AiRun {
  const { choice } = work
  const run: AiRun = {
    id: randomUUID(),
    kind: work.kind,
    status: 'running',
    text: '',
    error: null,
    provider: choice.provider,
    model: choice.model,
    usage: null,
  }
  runs.set(run.id, run)
  for (const id of runsToForget([...runs.values()])) runs.delete(id)
  const controller = new AbortController()
  controllers.set(run.id, controller)
  aiProvider(choice.provider)
    .run({
      model: choice.model,
      effort: choice.effort,
      system: work.system,
      messages: work.messages,
      schema: work.schema,
      signal: controller.signal,
      onText: (raw) => {
        run.text = work.preview(raw)
        changed(run)
      },
    })
    .then((reply) => {
      if (controller.signal.aborted) return
      run.usage = reply.usage
      recordUsage({
        at: new Date().toISOString(),
        provider: choice.provider,
        model: reply.model,
        ...reply.usage,
      })
      run.text = work.finish(reply.text)
      run.status = 'done'
    })
    .catch((error: Error) => {
      if (controller.signal.aborted) return
      run.status = 'failed'
      run.error = error.message
    })
    .finally(() => {
      if (run.status === 'running') run.status = 'stopped'
      controllers.delete(run.id)
      work.ended?.(run)
      changed(run)
    })
  return { ...run }
}

/** Write one field's text, in the shape that field holds. `images` are `input.images`, found on disk. */
export async function startAssist(input: AssistInput, images: StoredImage[]): Promise<AiRun> {
  const { system, user } = assistPrompt(input)
  return start({
    kind: 'assist',
    choice: await currentChoice(),
    system,
    messages: [{ role: 'user', text: user, images }],
    schema: ASSIST_SCHEMA,
    preview: partialText,
    finish: (raw) => assistText(input, raw),
  })
}

/** The latest chat reply while it is not part of the conversation: running, failed or empty. */
let chatRun: AiRun | null = null

export function chatThread(): ChatThread {
  const run = chatRun && (runs.get(chatRun.id) ?? chatRun)
  return { messages: readChat(), run: run && { ...run } }
}

const message = (
  messages: ChatMessage[],
  role: ChatMessage['role'],
  text: string,
  images: ImageRef[] = [],
): ChatMessage => ({
  id: Math.max(0, ...messages.map((m) => m.id)) + 1,
  role,
  text,
  ...(images.length ? { images } : {}),
  at: new Date().toISOString(),
})

/** A message's pictures on disk. One whose upload is no longer kept is left out, not an error. */
const picturesOf = (images: ImageRef[] = []): StoredImage[] =>
  images.flatMap((ref) => {
    try {
      return [findImage(null, ref)]
    } catch {
      return []
    }
  })

/** The messages the model reads: the latest ones, starting at one from the user. */
function chatWindow(messages: ChatMessage[]): AiMessage[] {
  const latest = messages.slice(-CHAT_WINDOW)
  const start = latest.findIndex((m) => m.role === 'user')
  return latest
    .slice(Math.max(0, start))
    .map(({ role, text, images }) => ({ role, text, images: picturesOf(images) }))
}

/** Add a message, with any pictures, to the side panel's conversation and start the reply. */
export async function sendChat(
  text: string,
  images: ImageRef[],
  scene: ChatScene,
): Promise<ChatThread> {
  if (chatRun?.status === 'running') throw new Error('Wait for the reply, or stop it first.')
  const choice = await currentChoice()
  // Fails now, while the writer can add it again, not when the reply is under way.
  for (const image of images) findImage(null, image)
  const asked = readChat()
  const messages = [...asked, message(asked, 'user', text, images)]
  writeChat(messages)
  chatRun = start({
    kind: 'chat',
    choice,
    system: chatSystem(scene),
    messages: chatWindow(messages),
    schema: null,
    preview: (raw) => raw,
    finish: (raw) => {
      if (!raw.trim()) throw new Error('The model returned nothing. Try again.')
      return raw.trim()
    },
    ended: (run) => {
      // The conversation was started over while this reply was on its way.
      if (chatRun?.id !== run.id) return
      chatRun = run
      // A finished reply, and what a stopped one had written, join the conversation.
      if (run.status === 'failed' || !run.text.trim()) return
      const now = readChat()
      writeChat([...now, message(now, 'assistant', run.text.trim())])
      chatRun = null
    },
  })
  return chatThread()
}

/** Start the conversation over, stopping a reply still on its way. */
export function clearChat(): ChatThread {
  if (chatRun) controllers.get(chatRun.id)?.abort()
  chatRun = null
  writeChat([])
  return chatThread()
}
