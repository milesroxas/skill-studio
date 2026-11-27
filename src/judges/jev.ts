/**
 * The Jev client: one TypeSafe client per grading run, counting input tokens
 * and recording the model that answered so every report carries both. Each
 * request is counted to the meter as one call, and saved or answered from a
 * saved reply as `replies.ts` says.
 */

import type { CallRecord, Operation } from '@domain/cost.ts'
import {
  AuthenticationError,
  PermissionDeniedError,
  type Questions,
  type SystemOneResult,
  TypeSafeClient,
} from '@typesafe-ai/sdk'
import { holdsImage } from './images.ts'
import { countCall } from './meter.ts'
import {
  hashOf,
  MissingReply,
  noteReplayed,
  readSaved,
  savedReplies,
  sha,
  unanswered,
  writeSaved,
} from './replies.ts'

/** The model a grading asks unless it is given another. */
export const DEFAULT_MODEL = 'jev-1.14.0'

/**
 * Pictures are a preview feature of the API: a request that holds one is
 * refused with a 400 unless it says so with this header. Sent only with such
 * a request, so a text question never opts in to a preview.
 */
const IMAGES_HEADER = { 'TypeSafe-Danger-Zone-Images': 'true' }

export type JevState = NonNullable<Parameters<TypeSafeClient['systemOne']>[0]['state']>

/** What one request cost, filled in by `Jev.ask` once it is answered. */
export interface Usage {
  inputTokens: number
}

/**
 * What a pack asks Jev through: the client itself, or one grading puts in
 * its place that keeps each answer and asks only what it does not hold.
 */
export type JevAsker = Pick<Jev, 'model' | 'ask'>

/** TypeSafe refused the key: it is missing, wrong, or may not do this. */
export const isAuthError = (error: unknown): boolean =>
  error instanceof AuthenticationError || error instanceof PermissionDeniedError

/**
 * TypeSafe refused the request for its size: the state and the questions
 * together are more than Jev reads at once. Asking the same again fails the
 * same way, so whoever asked must ask for less.
 */
export const isTooLarge = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('max_tokens_exceeded')

/**
 * The key Jev's saved answers to one state are filed under: the model and the
 * state, its pictures by their bytes. Each answer in the file is under its
 * question's own key, as Jev answers each question apart from the others.
 */
const jevStateKey = (model: string, state: JevState): string =>
  sha(JSON.stringify([model, hashOf(state)]))

/** Saved answers to one state, each by its question's key (`hashOf`). */
type SavedAnswers = Record<string, unknown>

const seconds = (since: number): number => Math.round(performance.now() - since) / 1000

export class Jev {
  readonly model: string
  /** The work this client asks for, named on each call it counts. */
  readonly operation: Operation
  private client: TypeSafeClient | null = null
  /** The key the client was built with. A key changed in Settings builds a new one. */
  private key: string | undefined
  inputTokens = 0
  calls = 0
  modelSeen: string | null = null

  constructor(model: string | undefined, operation: Operation) {
    this.model = model ?? DEFAULT_MODEL
    this.operation = operation
  }

  /** There is a key to ask with, or a replay that answers without one. */
  static available(): boolean {
    return Boolean(process.env.TYPESAFE_API_KEY) || savedReplies()?.mode === 'replay'
  }

  /**
   * Ask `questions` of `state`. `signal` ends the request, and any retry of it,
   * when the grading is stopped. `usage`, when given, is told what the request cost.
   */
  async ask<const Q extends Questions>(
    state: JevState,
    questions: Q,
    signal?: AbortSignal,
    usage?: Usage,
  ): Promise<SystemOneResult<Q>['answers']> {
    const begun = performance.now()
    const saved = savedReplies()
    if (saved?.mode === 'replay') {
      const answers = this.replayed(saved.dir, state, questions)
      if (usage) usage.inputTokens = 0
      this.calls += 1
      this.modelSeen = this.model
      countCall(this.record(this.model, 0, begun, 'replayed'))
      return answers as SystemOneResult<Q>['answers']
    }
    const key = process.env.TYPESAFE_API_KEY
    if (!key) throw new Error('No TypeSafe key is set, so Jev cannot judge.')
    if (!this.client || this.key !== key) {
      this.client = new TypeSafeClient({
        apiKey: key,
        defaultModel: this.model,
        timeout: 60_000,
        logLevel: 'error',
      })
      this.key = key
    }
    const result = await this.client.systemOne(
      { state, questions },
      {
        ...(signal ? { signal } : {}),
        ...(holdsImage(state) || holdsImage(questions) ? { headers: IMAGES_HEADER } : {}),
      },
    )
    const tokens = result.usage.input_tokens ?? 0
    this.inputTokens += tokens
    if (usage) usage.inputTokens = tokens
    this.calls += 1
    this.modelSeen = result.model
    countCall(this.record(result.model, tokens, begun, 'asked'))
    if (saved?.mode === 'record') this.save(saved.dir, state, questions, result.answers)
    return result.answers
  }

  private record(
    model: string,
    input: number,
    begun: number,
    source: CallRecord['source'],
  ): CallRecord {
    return {
      operation: this.operation,
      provider: 'jev',
      model,
      input,
      output: 0,
      // A replayed answer took no time a gate could compare.
      seconds: source === 'replayed' ? 0 : seconds(begun),
      source,
    }
  }

  /** Each question's saved answer, by its name; stops when one has none, however they were grouped when saved. */
  private replayed(dir: string, state: JevState, questions: Questions): SavedAnswers {
    const file = jevStateKey(this.model, state)
    const held = readSaved<SavedAnswers>(dir, 'jev', file) ?? {}
    const answers: SavedAnswers = {}
    for (const [name, question] of Object.entries(questions)) {
      const key = hashOf(question)
      if (!Object.hasOwn(held, key))
        throw unanswered(
          new MissingReply(this.operation, dir, `jev/${file}.json has no answer ${key}`),
        )
      answers[name] = held[key]
      noteReplayed(`jev/${file}.json#${key}`)
    }
    return answers
  }

  /** Keep each answer that came back beside those saved before for the same state. */
  private save(dir: string, state: JevState, questions: Questions, answers: object): void {
    const file = jevStateKey(this.model, state)
    const held = readSaved<SavedAnswers>(dir, 'jev', file) ?? {}
    for (const [name, question] of Object.entries(questions))
      if (Object.hasOwn(answers, name)) held[hashOf(question)] = (answers as SavedAnswers)[name]
    writeSaved(dir, 'jev', file, held)
  }
}
