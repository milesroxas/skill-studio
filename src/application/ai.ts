/**
 * The assistant's work. A request starts a run: one reply, written by the
 * model the preferences name, held here while it grows and for a while after.
 * Interfaces either poll a run or subscribe with `watchRuns`, which reports a
 * growing reply a few times a second and its end at once. Five kinds of run
 * exist: `assist` fills one field in the field's own shape, `chat` adds a
 * reply to the side panel's conversation, and `refine`, `rewrites` and
 * `improve` serve the three actions on a selected rule. For those, the lint
 * and Jev decide what is wrong before any model writes, so a rule that
 * already complies costs no generative call at all.
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
import {
  ASKS_MAX,
  checklistOf,
  codeVerdicts,
  currentStep,
  DRIFTS,
  drafting,
  draftOf,
  drifts,
  HOLDS,
  type ImproveThread,
  improveSystem,
  judgmentFindings,
  mergeFindings,
  planImprove,
  REFINE_SCHEMA,
  REWRITES_SCHEMA,
  type RefineResult,
  type RuleJudgment,
  refinePrompt,
  refineText,
  rewritesOf,
  rewritesPrompt,
  rewritesText,
} from '@domain/improve.ts'
import { type Finding, lintScene, type RuleScene } from '@domain/lint.ts'
import { aiChoiceOf } from '@domain/preferences.ts'
import { type AiMessage, aiProvider, aiProviderInfo } from '@infrastructure/ai/index.ts'
import { readChat, readUsage, recordUsage, writeChat } from '@infrastructure/ai/store.ts'
import { findImage, type StoredImage } from '@infrastructure/images.ts'
import { readPreferences } from '@infrastructure/preferences.ts'
import { Jev } from '@judges/jev.ts'
import { judgeAnswer, judgeDraft, judgeRule, verifyRewrites } from '@judges/rule/index.ts'

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
  finish: (raw: string) => string | Promise<string>
  /** Called once, when the run has ended for any reason, and before the end is reported. */
  ended?: (run: AiRun) => void | Promise<void>
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
    .then(async (reply) => {
      if (controller.signal.aborted) return
      run.usage = reply.usage
      recordUsage({
        at: new Date().toISOString(),
        provider: choice.provider,
        model: reply.model,
        ...reply.usage,
      })
      run.text = await work.finish(reply.text)
      run.status = 'done'
    })
    .catch((error: Error) => {
      if (controller.signal.aborted) return
      run.status = 'failed'
      run.error = error.message
    })
    .finally(async () => {
      if (run.status === 'running') run.status = 'stopped'
      controllers.delete(run.id)
      await work.ended?.(run)
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

/**
 * What is wrong with a selected rule, as code and the judge read it. Jev reads
 * it only when a TypeSafe key is set; a judge that cannot be reached leaves
 * code's findings standing rather than failing the action.
 */
async function assess(
  scene: RuleScene,
  jev: Jev,
): Promise<{ findings: Finding[]; judgment: RuleJudgment | null; judged: boolean }> {
  const code = lintScene(scene)
  if (!Jev.available()) return { findings: code, judgment: null, judged: false }
  try {
    const judgment = await judgeRule(jev, scene)
    return { findings: mergeFindings(code, judgmentFindings(judgment)), judgment, judged: true }
  } catch {
    return { findings: code, judgment: null, judged: false }
  }
}

/** Auto refine: check the rule, and start its revision only when something drifts. */
export async function startRefine(scene: RuleScene): Promise<RefineResult> {
  const { findings, judged } = await assess(scene, new Jev())
  if (!drifts(findings)) return { findings, judged, run: null }
  const { system, user } = refinePrompt(scene, findings)
  const run = start({
    kind: 'refine',
    choice: await currentChoice(),
    system,
    messages: [{ role: 'user', text: user }],
    schema: REFINE_SCHEMA,
    preview: (raw) => partialText(raw, 'revision'),
    finish: refineText,
  })
  return { findings, judged, run }
}

/**
 * Suggest changes: three rewrites in one reply, each checked before it is
 * offered. The finished run's text is the `RewritesResult` as JSON.
 */
export async function startRewrites(scene: RuleScene): Promise<AiRun> {
  const jev = new Jev()
  const { findings, judged } = await assess(scene, jev)
  const { system, user } = rewritesPrompt(scene, findings)
  return start({
    kind: 'rewrites',
    choice: await currentChoice(),
    system,
    messages: [{ role: 'user', text: user }],
    schema: REWRITES_SCHEMA,
    preview: () => '',
    finish: async (raw) => {
      const rewrites = rewritesOf(raw)
      const verdicts = codeVerdicts(scene, rewrites)
      if (judged)
        try {
          const verified = await verifyRewrites(jev, scene, rewrites)
          for (const kind of ['practice', 'direct', 'shorter'] as const)
            verdicts[kind].kept = verified.kept[kind]
          verdicts.practice.drift = judgmentFindings(verified.practice)
        } catch {
          // The rewrites stand unverified, as they would without a key.
        }
      return rewritesText({ rewrites, verdicts })
    },
  })
}

/** The one improve conversation, on one selection, kept while the window is open. */
let improve: ImproveThread | null = null
const improveJev = new Jev()

const snapshot = (thread: ImproveThread): ImproveThread => ({
  ...thread,
  run: thread.run && (runs.get(thread.run.id) ?? thread.run),
  messages: [...thread.messages],
})

export const improveThread = (): ImproveThread | null => (improve ? snapshot(improve) : null)

/** The next reply of the improve conversation: a question, or the draft. */
async function improveReply(thread: ImproveThread): Promise<void> {
  const choice = await currentChoice()
  thread.run = start({
    kind: 'improve',
    choice,
    system: improveSystem(thread),
    messages: chatWindow(thread.messages),
    schema: null,
    preview: (raw) => raw,
    finish: (raw) => {
      if (!raw.trim()) throw new Error('The model returned nothing. Try again.')
      return raw.trim()
    },
    ended: async (run) => {
      // The conversation was closed, or started over, while this reply was on its way.
      if (improve !== thread || thread.run?.id !== run.id) return
      thread.run = run
      if (run.status === 'failed' || !run.text.trim()) return
      thread.messages = [...thread.messages, message(thread.messages, 'assistant', run.text.trim())]
      thread.run = null
      if (!drafting(thread)) return
      const draft = draftOf(run.text)
      if (thread.cut && !draft) {
        thread.draft = ''
        thread.checklist = null
        return
      }
      if (!draft) return
      thread.draft = draft
      if (!thread.judged) return
      try {
        thread.checklist = checklistOf(await judgeDraft(improveJev, thread.scene, draft))
      } catch {
        thread.checklist = null
      }
    },
  })
}

/** Open an improve conversation on a selected rule and ask its first question. */
export async function startImprove(scene: RuleScene): Promise<ImproveThread> {
  clearImprove()
  const { findings, judgment, judged } = await assess(scene, improveJev)
  const thread: ImproveThread = {
    scene,
    steps: planImprove(findings, judgment),
    at: 0,
    asks: 0,
    cut: false,
    messages: [message([], 'user', scene.selection)],
    run: null,
    draft: null,
    checklist: null,
    judged,
  }
  improve = thread
  await improveReply(thread)
  return snapshot(thread)
}

/**
 * The writer's reply. Code decides where the walk goes: the judge says
 * whether the reply answered the question in hand, so an unanswered one is put
 * once more and an answered one moves on; on the first question, a reply that
 * says the line does nothing sends the walk straight to a draft that deletes it.
 */
export async function sendImprove(text: string): Promise<ImproveThread> {
  const thread = improve
  if (!thread) throw new Error('No rule is being improved. Select one in the Editor first.')
  if (thread.run?.status === 'running') throw new Error('Wait for the reply, or stop it first.')
  thread.messages = [...thread.messages, message(thread.messages, 'user', text)]
  const step = currentStep(thread)
  if (step) {
    let advance = true
    if (thread.judged)
      try {
        const { answered, cut } = await judgeAnswer(improveJev, thread.scene, step, text)
        if (cut !== null && cut >= HOLDS) {
          thread.cut = true
          thread.at = thread.steps.length
        } else if (answered < DRIFTS && thread.asks + 1 < ASKS_MAX) advance = false
      } catch {
        // Without the judge's reading, every reply counts as an answer.
      }
    if (!thread.cut) {
      if (advance) {
        thread.at += 1
        thread.asks = 0
      } else thread.asks += 1
    }
  }
  await improveReply(thread)
  return snapshot(thread)
}

/** Close the improve conversation, stopping a reply still on its way. */
export function clearImprove(): void {
  if (improve?.run) controllers.get(improve.run.id)?.abort()
  improve = null
}
