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
  type ChatMessage,
  type ChatThread,
  chatWindowOf,
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
  chatBrief,
  partialText,
} from '@domain/assist.ts'
import type { SlashCommand } from '@domain/commands.ts'
import type { ImageRef } from '@domain/image.ts'
import {
  type AnswerReading,
  checklistOf,
  currentStep,
  drafting,
  draftOf,
  type ImproveStep,
  type ImproveThread,
  improveSystem,
  judgmentFindings,
  keepListMark,
  kindsFor,
  mergeFindings,
  noVerdict,
  oneRule,
  openIn,
  planImprove,
  REFINE_SCHEMA,
  type RefineResult,
  type RewriteKind,
  type Rewrites,
  type RewritesResult,
  type RuleJudgment,
  refinePrompt,
  refineText,
  revisionText,
  rewritesOf,
  rewritesPrompt,
  rewritesSchema,
  rewritesText,
  toFix,
  walkAfter,
} from '@domain/improve.ts'
import { type Finding, lintScene, type RuleScene } from '@domain/lint.ts'
import { aiChoiceOf } from '@domain/preferences.ts'
import {
  type AiMessage,
  aiProvider,
  aiProviderInfo,
  isProviderError,
} from '@infrastructure/ai/index.ts'
import { readChat, readUsage, recordUsage, writeChat } from '@infrastructure/ai/store.ts'
import { findImage, type StoredImage } from '@infrastructure/images.ts'
import { readPreferences } from '@infrastructure/preferences.ts'
import { isAuthError, Jev } from '@judges/jev.ts'
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

/** Stop every reply still being written. For when the process is going away. */
export function stopAllRuns(): void {
  for (const controller of controllers.values()) controller.abort()
}

/**
 * Keep what a request spent. The log is a record beside the reply, never part
 * of it: a log that cannot be written must not turn a good reply into a failed one.
 */
function spent(entry: Parameters<typeof recordUsage>[0]): void {
  try {
    recordUsage(entry)
  } catch (error) {
    console.warn(`The usage log could not be written: ${(error as Error).message}`)
  }
}

/** A prose reply as the run keeps it. An empty one is a failure the writer can retry. */
const proseReply = (raw: string): string => {
  if (!raw.trim()) throw new Error('The model returned nothing. Try again.')
  return raw.trim()
}

/**
 * Run `work` unless the same kind of work is already starting. The checks that
 * refuse a second message while a reply is on its way read state that is only
 * set after the first `await`, so two calls a moment apart would both pass
 * them and both start a paid reply. This holds the place from the first line.
 */
const starting = new Set<string>()
async function once<T>(what: string, work: () => Promise<T>): Promise<T> {
  if (starting.has(what)) throw new Error('Wait for the reply, or stop it first.')
  starting.add(what)
  try {
    return await work()
  } finally {
    starting.delete(what)
  }
}

/** How every provider stands now, asked afresh: this is what Settings' "Check again" reads. */
export const aiStatus = async (): Promise<AiStatus> => ({
  providers: await aiProviderInfo({ fresh: true }),
})

export const aiUsage = (): UsageSummary => summarizeUsage(readUsage(), new Date())

/** The model the preferences name, among what is connected now; null when nothing is. */
const choiceNow = async (): Promise<AiChoice | null> =>
  resolveChoice(aiChoiceOf(readPreferences()), await aiProviderInfo())

/** The model in use, or why there is none. */
async function currentChoice(): Promise<AiChoice> {
  const choice = await choiceNow()
  if (!choice) throw new Error('Set up the assistant in Settings first.')
  return choice
}

/** The commands a message may start with on the model in use: none on a provider that takes none, or with nothing connected. */
export async function aiCommands(): Promise<SlashCommand[]> {
  const choice = await choiceNow()
  const list = choice && aiProvider(choice.provider).commands
  return list ? list() : []
}

/**
 * One more request to the run's own model, for a reply the first one's checks
 * sent back: its text, whole. It stops with the run, and what it spent is
 * logged with the run's.
 */
type Again = (
  system: string,
  user: string,
  schema: Readonly<Record<string, unknown>> | null,
) => Promise<string>

interface Work {
  kind: AiRunKind
  choice: AiChoice
  system: string
  /** What changes from turn to turn, sent after `system` (`AiRequest.turn`). */
  turn?: string
  messages: AiMessage[]
  schema: Readonly<Record<string, unknown>> | null
  /** What the run shows of the reply so far. */
  preview: (raw: string) => string
  /**
   * The run's text from the finished reply. Throws when the reply does not
   * hold up. `again` asks the same model once more, as part of this run.
   */
  finish: (raw: string, again: Again) => string | Promise<string>
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
  const provider = aiProvider(choice.provider)
  const again: Again = async (system, user, schema) => {
    const reply = await provider.run({
      model: choice.model,
      effort: choice.effort,
      system,
      messages: [{ role: 'user', text: user }],
      schema,
      signal: controller.signal,
      // The reader keeps the first reply in view until the checked one takes its place.
      onText: () => {},
    })
    spent({
      at: new Date().toISOString(),
      provider: choice.provider,
      model: reply.model,
      ...reply.usage,
    })
    return reply.text
  }
  provider
    .run({
      model: choice.model,
      effort: choice.effort,
      system: work.system,
      turn: work.turn,
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
      spent({
        at: new Date().toISOString(),
        provider: choice.provider,
        model: reply.model,
        ...reply.usage,
      })
      const text = await work.finish(reply.text, again)
      // Stopped while its reply was checked: nobody is waiting for it.
      if (controller.signal.aborted) return
      run.text = text
      run.status = 'done'
    })
    .catch((error: Error) => {
      if (controller.signal.aborted) return
      // A reply the provider billed and then refused still cost tokens; the log keeps them.
      if (isProviderError(error)) {
        run.usage = error.usage
        spent({
          at: new Date().toISOString(),
          provider: choice.provider,
          model: error.model,
          ...error.usage,
        })
      }
      run.status = 'failed'
      run.error = error.message
    })
    .finally(async () => {
      if (run.status === 'running') run.status = 'stopped'
      controllers.delete(run.id)
      try {
        await work.ended?.(run)
      } catch (error) {
        // The reply itself stands; what could not be kept of it is said, and the end is still reported.
        console.warn(`A reply's end could not be recorded: ${(error as Error).message}`)
        if (run.status === 'done') {
          run.status = 'failed'
          run.error = `The reply could not be saved: ${(error as Error).message}`
        }
      }
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
  return chatWindowOf(messages).map(({ role, text, images }) => ({
    role,
    text,
    images: picturesOf(images),
  }))
}

/**
 * Add a message, with any pictures, to the side panel's conversation and start
 * the reply. `skill` is the open skill's path: the reply is marked with it, so
 * the changes it proposes are offered only while that skill is open.
 */
export const sendChat = (
  text: string,
  images: ImageRef[],
  scene: ChatScene,
  skill: string | null,
): Promise<ChatThread> => once('chat', () => sendChatNow(text, images, scene, skill))

async function sendChatNow(
  text: string,
  images: ImageRef[],
  scene: ChatScene,
  skill: string | null,
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
    ...chatBrief(scene),
    messages: chatWindow(messages),
    schema: null,
    preview: (raw) => raw,
    finish: proseReply,
    ended: (run) => {
      // The conversation was started over while this reply was on its way.
      if (chatRun?.id !== run.id) return
      chatRun = run
      // A finished reply, and what a stopped one had written, join the conversation.
      if (run.status === 'failed' || !run.text.trim()) return
      const now = readChat()
      const reply = message(now, 'assistant', run.text.trim())
      writeChat([...now, skill ? { ...reply, skill } : reply])
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
 * code's findings standing rather than failing the action, and says why in
 * the backend's log. A key TypeSafe refuses is an error the writer can fix,
 * so that one is thrown.
 */
interface Assessment {
  findings: Finding[]
  judgment: RuleJudgment | null
  judged: boolean
}

/** The last rule Jev read and what it said: the same rule asked about twice in a row costs one reading. */
let assessed: { key: string; value: Assessment } | null = null

async function assess(scene: RuleScene, jev: Jev): Promise<Assessment> {
  const code = lintScene(scene)
  if (!Jev.available()) return { findings: code, judgment: null, judged: false }
  const key = JSON.stringify(scene)
  if (assessed?.key === key && assessed.value.judged) return assessed.value
  try {
    const judgment = await judgeRule(jev, scene)
    const value = {
      findings: mergeFindings(code, judgmentFindings(judgment)),
      judgment,
      judged: true,
    }
    assessed = { key, value }
    return value
  } catch (error) {
    if (isAuthError(error)) throw new Error('TypeSafe refused the key. Check it in Settings.')
    console.warn(`Jev could not read the rule: ${(error as Error).message}`)
    return { findings: code, judgment: null, judged: false }
  }
}

/**
 * What a rewrite of the selection still leaves open, as the checks that read
 * the selection read the rewrite: code always, and Jev when it read the
 * selection and the rewrite is still one rule. A Jev that cannot be reached
 * leaves code's reading standing.
 */
async function stillOpen(scene: RuleScene, text: string, jev: Jev | null): Promise<Finding[]> {
  let judgment: RuleJudgment | null = null
  if (jev && oneRule(text))
    try {
      judgment = await judgeDraft(jev, scene, text)
    } catch (error) {
      console.warn(`Jev could not read the rewrite: ${(error as Error).message}`)
    }
  return openIn(text, judgment)
}

/**
 * One more try at a rewrite that left `open` standing: the model is shown its
 * own text and what the checks still find in it. Null when the try fails, so
 * the first rewrite stands.
 */
async function oneMoreTry(
  scene: RuleScene,
  text: string,
  open: Finding[],
  again: Again,
): Promise<string | null> {
  const { system, user } = refinePrompt({ ...scene, selection: text }, open, true)
  try {
    return keepListMark(scene.selection, refineText(await again(system, user, REFINE_SCHEMA)))
  } catch (error) {
    console.warn(`The rewrite could not be tried again: ${(error as Error).message}`)
    return null
  }
}

/**
 * Auto refine: check the rule, and start its revision only when a rewrite can
 * fix what was found. The revision is held to the same checks before it is
 * shown: one that leaves any of them open is sent back once, and what is
 * still open after that is said under it. The finished run's text is the
 * `Revision` as JSON.
 */
export async function startRefine(scene: RuleScene): Promise<RefineResult> {
  // Before Jev is paid: no model to write with means nothing to check for.
  const choice = await currentChoice()
  const jev = new Jev()
  const { findings, judged } = await assess(scene, jev)
  const fix = toFix(findings)
  if (!fix.length) return { findings, judged, run: null }
  const { system, user } = refinePrompt(scene, fix)
  const reader = judged ? jev : null
  const run = start({
    kind: 'refine',
    choice,
    system,
    messages: [{ role: 'user', text: user }],
    schema: REFINE_SCHEMA,
    preview: (raw) => partialText(raw, 'revision'),
    finish: async (raw, again) => {
      let text = keepListMark(scene.selection, refineText(raw))
      let open = await stillOpen(scene, text, reader)
      const second = open.length ? await oneMoreTry(scene, text, open, again) : null
      if (second) {
        const left = await stillOpen(scene, second, reader)
        if (left.length < open.length) {
          text = second
          open = left
        }
      }
      return revisionText({ text, open })
    },
  })
  return { findings, judged, run }
}

/** Jev's reading of rewrites: which kept the selection's facts, and `practice` as a rule while it is one. */
async function readRewrites(
  jev: Jev | null,
  scene: RuleScene,
  rewrites: Rewrites,
): Promise<{ kept: Partial<Record<RewriteKind, number>>; judgment: RuleJudgment | null } | null> {
  if (!jev) return null
  try {
    const read = rewrites.practice !== undefined && oneRule(rewrites.practice) ? 'practice' : null
    return await verifyRewrites(jev, scene, rewrites, read)
  } catch (error) {
    // The rewrites stand unverified, as they would without a key.
    console.warn(`Jev could not check the rewrites: ${(error as Error).message}`)
    return null
  }
}

/**
 * Suggest changes: three rewrites in one reply, each checked before it is
 * offered. Best practice is held to the checks it was asked to fix: one that
 * leaves any of them open is sent back once. The finished run's text is the
 * `RewritesResult` as JSON.
 */
export async function startRewrites(scene: RuleScene): Promise<AiRun> {
  const choice = await currentChoice()
  const jev = new Jev()
  const { findings, judged } = await assess(scene, jev)
  const kinds = kindsFor(scene)
  const { system, user } = rewritesPrompt(scene, findings, kinds)
  const reader = judged ? jev : null
  return start({
    kind: 'rewrites',
    choice,
    system,
    messages: [{ role: 'user', text: user }],
    schema: rewritesSchema(kinds),
    preview: () => '',
    finish: async (raw, again) => {
      const rewrites = rewritesOf(raw, kinds)
      for (const kind of kinds) rewrites[kind] = keepListMark(scene.selection, rewrites[kind] ?? '')
      const read = await readRewrites(reader, scene, rewrites)
      const verdicts: RewritesResult['verdicts'] = Object.fromEntries(
        kinds.map((kind) => [kind, { ...noVerdict(), kept: read?.kept[kind] ?? null }]),
      )
      // Best practice says it fixes what the checks found, so the checks read it before it is shown.
      const practice = rewrites.practice ?? ''
      let open = openIn(practice, read?.judgment ?? null)
      let kept = read?.kept.practice ?? null
      const second = open.length ? await oneMoreTry(scene, practice, open, again) : null
      if (second) {
        const reread = await readRewrites(reader, scene, { practice: second })
        const left = openIn(second, reread?.judgment ?? null)
        if (left.length < open.length) {
          rewrites.practice = second
          open = left
          kept = reread?.kept.practice ?? null
        }
      }
      verdicts.practice = { kept, open }
      return rewritesText({ rewrites, verdicts, judged: read !== null })
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
    finish: proseReply,
    ended: async (run) => {
      // The conversation was closed, or started over, while this reply was on its way.
      if (improve !== thread || thread.run?.id !== run.id) return
      thread.run = run
      if (run.status === 'failed' || !run.text.trim()) return
      thread.messages = [...thread.messages, message(thread.messages, 'assistant', run.text.trim())]
      thread.run = null
      if (!drafting(thread)) return
      const found = draftOf(run.text)
      const draft = found && keepListMark(thread.scene.selection, found)
      if (thread.cut && !draft) {
        thread.draft = ''
        thread.checklist = null
        return
      }
      if (!draft) return
      thread.draft = draft
      if (!thread.judged) return
      try {
        thread.checklist = checklistOf(await judgeDraft(improveJev, thread.scene, draft), draft)
      } catch {
        thread.checklist = null
      }
    },
  })
}

/** How many improve conversations have been started: a start, or a reply, that a later start overtook gives way. */
let improveStarts = 0
/** The latest start, which one that gave way answers with. */
let latestStart: Promise<ImproveThread> | null = null
/** Jev's reading of each conversation's rule, begun as it opens, so the writer's first message seldom waits on it. */
const plans = new WeakMap<ImproveThread, Promise<Assessment>>()

/**
 * Open an improve conversation on a selected rule. Nothing is asked of the
 * model yet: the writer says what they want first. Jev starts reading the rule
 * at once, so the plan is ready by the time they have. A rule picked while the
 * last one is opening is the one the writer wants now: the earlier start gives
 * way and answers with this one's conversation.
 */
export function startImprove(scene: RuleScene): Promise<ImproveThread> {
  const ticket = ++improveStarts
  const started = startImproveNow(scene, ticket)
  latestStart = started
  return started
}

/** Whether a start later than `ticket` has begun. */
const overtaken = (ticket: number): boolean => ticket !== improveStarts

/** What a start or a reply that was overtaken answers with: the latest start's conversation. */
const latest = (): Promise<ImproveThread> =>
  latestStart ??
  Promise.reject(new Error('No rule is being improved. Select one on the Skill screen first.'))

/** Stop the reply `thread` began, when it began one. */
const stopReply = (thread: ImproveThread): void => {
  if (thread.run) controllers.get(thread.run.id)?.abort()
}

async function startImproveNow(scene: RuleScene, ticket: number): Promise<ImproveThread> {
  clearImprove()
  // No model to write with means nothing to open: say so before Jev is paid.
  await currentChoice()
  if (overtaken(ticket)) return latest()
  const thread: ImproveThread = {
    scene,
    opened: new Date().toISOString(),
    walked: null,
    findings: [],
    steps: [],
    at: 0,
    asks: 0,
    cut: false,
    messages: [],
    run: null,
    draft: null,
    checklist: null,
    judged: false,
  }
  const plan = assess(scene, improveJev)
  // Read when the writer first sends; a failure is said then, not as the panel opens.
  plan.catch(() => {})
  plans.set(thread, plan)
  improve = thread
  return snapshot(thread)
}

/** What a reply to a conversation closed while its answer was read is refused with. */
const CLOSED = 'That conversation was closed.'

/** How the writer's message goes: as the way into the questions, and with the rule as it stands in the file now. */
export interface ImproveSend {
  /** The first message asks to be walked through the questions, not for a draft. */
  walk?: boolean
  /** The rule's text in the file now, when the writer put a draft in place or edited it since. */
  current?: string
}

/**
 * The writer's message. The first one sets the course: a request for a draft,
 * or the way into the questions. Code decides where the walk goes from there:
 * the judge says whether a reply answered the question in hand, so an
 * unanswered one is put once more and an answered one moves on; on the first
 * question, a reply that says the line does nothing sends the walk straight to
 * a draft that deletes it.
 */
export const sendImprove = (text: string, how: ImproveSend = {}): Promise<ImproveThread> =>
  once('improve', () => sendImproveNow(text, how))

async function sendImproveNow(text: string, how: ImproveSend): Promise<ImproveThread> {
  const thread = improve
  if (!thread) throw new Error('No rule is being improved. Select one on the Skill screen first.')
  if (thread.run?.status === 'running') throw new Error('Wait for the reply, or stop it first.')
  const ticket = improveStarts
  if (how.current !== undefined && how.current !== thread.scene.selection)
    thread.scene = { ...thread.scene, selection: how.current }
  thread.messages = [...thread.messages, message(thread.messages, 'user', text)]
  if (thread.walked === null) {
    let assessment: Assessment
    try {
      assessment = await (plans.get(thread) ?? assess(thread.scene, improveJev))
    } catch (error) {
      // The message is not lost: the writer sends it again once the key is fixed.
      thread.messages = thread.messages.slice(0, -1)
      throw error
    }
    if (improve !== thread) return gone(ticket)
    thread.findings = assessment.findings
    thread.judged = assessment.judged
    thread.steps = planImprove(assessment.findings, assessment.judgment)
    thread.walked = how.walk === true
    thread.at = thread.walked ? 0 : thread.steps.length
  } else {
    const step = currentStep(thread)
    thread.unread = false
    if (step) {
      let reading: AnswerReading | null = null
      if (thread.judged)
        try {
          reading = await readAnswer(thread.scene, step, text)
        } catch (error) {
          // The answer is not lost: the writer sends it again once the key is fixed.
          thread.messages = thread.messages.slice(0, -1)
          throw error
        }
      if (improve !== thread) return gone(ticket)
      thread.unread = thread.judged && reading === null
      Object.assign(thread, walkAfter(thread, reading))
    }
  }
  // Another rule was picked, or the conversation closed, while the answer was read: no reply is paid for.
  if (improve !== thread) return gone(ticket)
  await improveReply(thread)
  if (improve !== thread) {
    stopReply(thread)
    return gone(ticket)
  }
  return snapshot(thread)
}

/**
 * The judge's reading of the writer's reply to `step`; null when it could not
 * read it, and the reply counts as an answer. A refused key is said, as when
 * the rule is read (`assess`), since every reading after it would fail too.
 */
async function readAnswer(
  scene: RuleScene,
  step: ImproveStep,
  text: string,
): Promise<AnswerReading | null> {
  try {
    return await judgeAnswer(improveJev, scene, step, text)
  } catch (error) {
    if (isAuthError(error)) throw new Error('TypeSafe refused the key. Check it in Settings.')
    console.warn(`Jev could not read the answer: ${(error as Error).message}`)
    return null
  }
}

/** What a reply answers with once its conversation is gone: the latest start's when another rule was picked, else a refusal. */
const gone = (ticket: number): Promise<ImproveThread> =>
  overtaken(ticket) ? latest() : Promise.reject(new Error(CLOSED))

/** Close the improve conversation, stopping a reply still on its way. */
export function clearImprove(): void {
  if (improve?.run) controllers.get(improve.run.id)?.abort()
  improve = null
}
